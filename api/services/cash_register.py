"""Safe (cash register) operational services — does not duplicate GL for source docs."""
from __future__ import annotations

from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.models.data.cash_register import (
    CashCountLine,
    CashRegister,
    CashSession,
    CashTransaction,
)
from api.models.data.currency import BASE_CURRENCY_ID
from api.services.uom.conversion import d

AFN_DENOMINATIONS = (
    Decimal('1000'), Decimal('500'), Decimal('100'), Decimal('50'),
    Decimal('20'), Decimal('10'), Decimal('5'), Decimal('2'), Decimal('1'),
)

INFLOW_CATEGORIES = {
    CashTransaction.CAT_CASH_SALE,
    CashTransaction.CAT_CUSTOMER_DEBT_COLLECTION,
    CashTransaction.CAT_INITIAL_CASH,
    CashTransaction.CAT_OWNER_CAPITAL,
    CashTransaction.CAT_OTHER_RECEIPT,
    CashTransaction.CAT_CASH_OVERAGE,
}

OUTFLOW_CATEGORIES = {
    CashTransaction.CAT_BUSINESS_EXPENSE,
    CashTransaction.CAT_CASH_PURCHASE,
    CashTransaction.CAT_SUPPLIER_PAYMENT,
    CashTransaction.CAT_OWNER_WITHDRAWAL,
    CashTransaction.CAT_CUSTOMER_REFUND,
    CashTransaction.CAT_BANK_DEPOSIT,
    CashTransaction.CAT_OTHER_PAYMENT,
    CashTransaction.CAT_CASH_SHORTAGE,
    CashTransaction.CAT_SESSION_REMOVAL,
}


def _q(value) -> Decimal:
    return d(value).quantize(Decimal('0.01'))


def get_or_create_default_register() -> CashRegister:
    """Ensure the single active cash register linked to GL Cash 1000 (AFN)."""
    existing = CashRegister.objects.filter(is_active=True).select_related('linked_cash_account').first()
    if existing:
        return existing

    from api.services.accounting.coa import get_payment_asset_account, ensure_accounting_ready

    ensure_accounting_ready(currency_id=BASE_CURRENCY_ID)
    cash_gl = get_payment_asset_account('cash', currency_id=BASE_CURRENCY_ID)
    if cash_gl is None:
        raise ValidationError('Cash GL account (1000) is not configured. Set up accounting first.')

    return CashRegister.objects.create(
        name='Main Cash Drawer',
        code='MAIN',
        linked_cash_account=cash_gl,
        default_currency=BASE_CURRENCY_ID,
        is_active=True,
    )


def get_open_session(register: CashRegister | None = None) -> CashSession | None:
    register = register or get_or_create_default_register()
    return (
        CashSession.objects.select_related('cash_register', 'opened_by')
        .filter(cash_register=register, status=CashSession.STATUS_OPEN)
        .first()
    )


def _next_session_number(register: CashRegister) -> str:
    stamp = timezone.localtime().strftime('%Y%m%d')
    prefix = f'{register.code}-{stamp}-'
    # Include soft-deleted rows so unique session_number never collides after reset
    qs = CashSession.all_objects.filter(session_number__startswith=prefix)
    last = qs.order_by('-session_number').values_list('session_number', flat=True).first()
    seq = 1
    if last:
        try:
            seq = int(str(last).rsplit('-', 1)[-1]) + 1
        except ValueError:
            seq = qs.count() + 1
    return f'{prefix}{seq:03d}'


@transaction.atomic
def open_session(
    *,
    opening_balance=None,
    opening_deposit=None,
    user=None,
    notes: str = '',
    currency=None,
) -> CashSession:
    """
    Start a daily drawer session.

    - carried  = previous session carry-forward (auto)
    - deposit  = cash put into the drawer at open today (user enters)
    - opening  = carried + deposit

    Carry-forward is not sales. Deposit is new cash into the drawer (owner capital).
    """
    register = get_or_create_default_register()
    if not register.is_active:
        raise ValidationError('Cash register is inactive.')
    if get_open_session(register):
        raise ValidationError('An open cash session already exists. Close it before opening another.')

    currency = int(currency or register.default_currency or BASE_CURRENCY_ID)
    prev = (
        CashSession.objects.filter(
            cash_register=register,
            status=CashSession.STATUS_CLOSED,
            deleted_at__isnull=True,
        )
        .order_by('-closed_at', '-id')
        .first()
    )

    carried = _q(prev.carry_forward_amount) if prev is not None else Decimal('0')

    # First day: opening_balance is the cash deposited to start.
    # Later days: opening_deposit is extra cash put in on top of yesterday's leftover.
    if prev is None:
        deposit = _q(opening_deposit if opening_deposit is not None else (opening_balance or 0))
        if deposit < 0:
            raise ValidationError('Opening deposit cannot be negative.')
        if deposit <= 0 and opening_balance is None and opening_deposit is None:
            raise ValidationError('Enter the cash you put in the drawer to open today.')
        source = 'manual'
    else:
        deposit = _q(opening_deposit or 0)
        if deposit < 0:
            raise ValidationError('Opening deposit cannot be negative.')
        # Allow legacy clients that still send opening_balance as "extra"
        if deposit == 0 and opening_balance is not None:
            extra = _q(opening_balance)
            if extra > carried:
                deposit = _q(extra - carried)
        source = 'carry_forward' if deposit == 0 else 'carry_forward_plus_deposit'

    opening = _q(carried + deposit)

    session = CashSession.objects.create(
        cash_register=register,
        session_number=_next_session_number(register),
        currency=currency,
        opening_balance=opening,
        opening_source=source,
        opened_by=user if getattr(user, 'is_authenticated', False) else None,
        opened_at=timezone.now(),
        expected_closing_balance=opening,
        status=CashSession.STATUS_OPEN,
        notes=notes or None,
    )

    # Physical cash put in at open — part of Opening, not today's sales income.
    # Posts to GL Cash + Owner equity when amount > 0.
    if deposit > 0:
        record_transaction(
            session=session,
            direction=CashTransaction.DIRECTION_IN,
            category=CashTransaction.CAT_INITIAL_CASH,
            amount=deposit,
            description=(
                'Opening cash deposit into drawer'
                if prev is not None
                else 'First opening cash deposit into drawer'
            ),
            user=user,
            posts_own_journal=True,
            skip_session_check=True,
        )
    return session


def session_totals(session: CashSession) -> dict:
    qs = session.transactions.filter(status=CashTransaction.STATUS_POSTED, deleted_at__isnull=True)
    # Opening/initial cash is tracked separately — exclude from "today's inflows"
    operational = qs.exclude(category=CashTransaction.CAT_INITIAL_CASH)

    in_by_cat = {}
    out_by_cat = {}
    for cat, _label in CashTransaction.CATEGORY_CHOICES:
        agg = operational.filter(category=cat).aggregate(t=Sum('amount'))['t']
        val = _q(agg or 0)
        if cat in INFLOW_CATEGORIES:
            in_by_cat[cat] = val
        else:
            out_by_cat[cat] = val

    total_in = _q(sum(in_by_cat.values(), Decimal('0')))
    total_out = _q(sum(out_by_cat.values(), Decimal('0')))
    opening = _q(session.opening_balance)
    expected = _q(opening + total_in - total_out)

    return {
        'opening_balance': opening,
        'opening_source': session.opening_source,
        'cash_sales': in_by_cat.get(CashTransaction.CAT_CASH_SALE, Decimal('0')),
        'customer_debt_collections': in_by_cat.get(CashTransaction.CAT_CUSTOMER_DEBT_COLLECTION, Decimal('0')),
        'other_receipts': _q(
            in_by_cat.get(CashTransaction.CAT_OTHER_RECEIPT, 0)
            + in_by_cat.get(CashTransaction.CAT_OWNER_CAPITAL, 0)
            + in_by_cat.get(CashTransaction.CAT_CASH_OVERAGE, 0),
        ),
        'total_cash_in': total_in,
        'business_expenses': out_by_cat.get(CashTransaction.CAT_BUSINESS_EXPENSE, Decimal('0')),
        'supplier_payments': _q(
            out_by_cat.get(CashTransaction.CAT_SUPPLIER_PAYMENT, 0)
            + out_by_cat.get(CashTransaction.CAT_CASH_PURCHASE, 0),
        ),
        'owner_withdrawals': out_by_cat.get(CashTransaction.CAT_OWNER_WITHDRAWAL, Decimal('0')),
        'customer_refunds': out_by_cat.get(CashTransaction.CAT_CUSTOMER_REFUND, Decimal('0')),
        'bank_deposits': out_by_cat.get(CashTransaction.CAT_BANK_DEPOSIT, Decimal('0')),
        'other_payments': _q(
            out_by_cat.get(CashTransaction.CAT_OTHER_PAYMENT, 0)
            + out_by_cat.get(CashTransaction.CAT_CASH_SHORTAGE, 0)
            + out_by_cat.get(CashTransaction.CAT_SESSION_REMOVAL, 0),
        ),
        'total_cash_out': total_out,
        'expected_closing_balance': expected,
        'actual_closing_balance': session.actual_closing_balance,
        'cash_difference': session.cash_difference,
        'carry_forward_amount': session.carry_forward_amount,
        'in_by_category': {k: str(v) for k, v in in_by_cat.items()},
        'out_by_category': {k: str(v) for k, v in out_by_cat.items()},
    }


@transaction.atomic
def record_transaction(
    *,
    session: CashSession | None = None,
    direction: str,
    category: str,
    amount,
    description: str = '',
    user=None,
    source=None,
    currency=None,
    exchange_rate=1,
    posts_own_journal: bool = False,
    transaction_date=None,
    skip_session_check: bool = False,
) -> CashTransaction | None:
    amount = _q(amount)
    if amount <= 0:
        return None

    if session is None:
        session = get_open_session()
    if session is None:
        # No open drawer — skip silently for auto hooks; callers that need a session raise.
        if skip_session_check:
            raise ValidationError('No open cash session.')
        return None
    if not session.is_open and not skip_session_check:
        raise ValidationError('Cash session is closed.')

    register = session.cash_register
    if not register.is_active:
        raise ValidationError('Cash register is inactive.')

    ct = oid = None
    if source is not None and getattr(source, 'pk', None):
        ct = ContentType.objects.get_for_model(source, for_concrete_model=False)
        oid = source.pk
        existing = CashTransaction.objects.filter(
            content_type=ct,
            object_id=oid,
            category=category,
            status=CashTransaction.STATUS_POSTED,
        ).first()
        if existing:
            # Source documents can be edited after the first Safe post — keep the
            # drawer amount/description in sync so expected closing matches reality.
            rate = d(exchange_rate or 1) or Decimal('1')
            new_amount = _q(amount)
            new_base = _q(new_amount * rate)
            new_currency = int(currency or existing.currency or session.currency or BASE_CURRENCY_ID)
            previous_session_id = existing.cash_session_id
            changed_fields = []
            if existing.amount != new_amount:
                existing.amount = new_amount
                changed_fields.append('amount')
            if existing.amount_base != new_base:
                existing.amount_base = new_base
                changed_fields.append('amount_base')
            if existing.exchange_rate != rate:
                existing.exchange_rate = rate
                changed_fields.append('exchange_rate')
            if existing.currency != new_currency:
                existing.currency = new_currency
                changed_fields.append('currency')
            if description and existing.description != description:
                existing.description = description
                changed_fields.append('description')
            if transaction_date and existing.transaction_date != transaction_date:
                existing.transaction_date = transaction_date
                changed_fields.append('transaction_date')
            if previous_session_id != session.pk:
                existing.cash_session = session
                existing.cash_register = register
                changed_fields.extend(['cash_session', 'cash_register'])
            if changed_fields:
                changed_fields.append('updated_at')
                existing.save(update_fields=list(dict.fromkeys(changed_fields)))
                totals = session_totals(session)
                CashSession.objects.filter(pk=session.pk).update(
                    expected_closing_balance=totals['expected_closing_balance'],
                )
                if previous_session_id and previous_session_id != session.pk:
                    other = CashSession.objects.filter(pk=previous_session_id).first()
                    if other:
                        other_totals = session_totals(other)
                        CashSession.objects.filter(pk=other.pk).update(
                            expected_closing_balance=other_totals['expected_closing_balance'],
                        )
                if posts_own_journal or existing.posts_own_journal:
                    from api.services.accounting.sync import sync_cash_transaction_journal
                    sync_cash_transaction_journal(existing)
            return existing

    if category in INFLOW_CATEGORIES:
        direction = CashTransaction.DIRECTION_IN
    elif category in OUTFLOW_CATEGORIES:
        direction = CashTransaction.DIRECTION_OUT

    rate = d(exchange_rate or 1) or Decimal('1')
    txn = CashTransaction.objects.create(
        cash_register=register,
        cash_session=session,
        direction=direction,
        category=category,
        amount=amount,
        currency=int(currency or session.currency or BASE_CURRENCY_ID),
        exchange_rate=rate,
        amount_base=_q(amount * rate),
        description=description or None,
        transaction_date=transaction_date or timezone.now(),
        created_by=user if getattr(user, 'is_authenticated', False) else None,
        content_type=ct,
        object_id=oid,
        posts_own_journal=bool(posts_own_journal),
        status=CashTransaction.STATUS_POSTED,
    )

    # Refresh expected balance cache on session
    totals = session_totals(session)
    CashSession.objects.filter(pk=session.pk).update(
        expected_closing_balance=totals['expected_closing_balance'],
    )

    if posts_own_journal:
        from api.services.accounting.sync import sync_cash_transaction_journal
        sync_cash_transaction_journal(txn)

    return txn


def categorize_payment(payment) -> tuple[str, str] | None:
    """Map a Payment to (direction, category) for the drawer. None = ignore."""
    method = (getattr(payment, 'payment_method', None) or '').lower()
    if method != 'cash':
        return None
    if getattr(payment, 'is_credit_application', False):
        return None
    if getattr(payment, 'deleted_at', None):
        return None
    amount = d(getattr(payment, 'amount', 0) or 0)
    if amount <= 0:
        return None

    ptype = getattr(payment, 'payment_type', None)
    if ptype == 'sale':
        # Advance or bill collection — both are cash in; debt collection if settling AR
        if getattr(payment, 'is_advance', False):
            cat = CashTransaction.CAT_CUSTOMER_DEBT_COLLECTION
        else:
            # Prefer cash_sale when paying a sale; debt collection for AR-heavy general payments
            related = getattr(payment, 'content_object', None)
            if related is not None and related.__class__.__name__ == 'Sales':
                cat = CashTransaction.CAT_CASH_SALE
            else:
                cat = CashTransaction.CAT_CUSTOMER_DEBT_COLLECTION
        return CashTransaction.DIRECTION_IN, cat
    if ptype == 'purchase':
        return CashTransaction.DIRECTION_OUT, CashTransaction.CAT_SUPPLIER_PAYMENT
    return None


def sync_drawer_from_payment(payment, user=None):
    mapped = categorize_payment(payment)
    if not mapped:
        # Bank/sarafi edits or soft-deletes must clear any prior cash Safe row.
        void_drawer_for_source(payment, user=user)
        return None
    direction, category = mapped
    return record_transaction(
        direction=direction,
        category=category,
        amount=payment.amount,
        description=getattr(payment, 'notes', None) or f'Payment #{payment.pk}',
        user=user,
        source=payment,
        currency=getattr(payment, 'currency', None),
        exchange_rate=getattr(payment, 'exchange_rate', 1) or 1,
        transaction_date=getattr(payment, 'payment_date', None),
        posts_own_journal=False,
    )


@transaction.atomic
def void_drawer_for_source(source, user=None) -> int:
    """
    Reverse Safe movements that came from a source document (payment / expense / …).

    When a cash sale, purchase payment, expense, or withdrawal is deleted, the
    Safe row it created must be voided so the open balance is correct again.
    """
    if source is None or not getattr(source, 'pk', None):
        return 0

    ct = ContentType.objects.get_for_model(source, for_concrete_model=False)
    qs = (
        CashTransaction.objects.select_for_update()
        .filter(
            content_type=ct,
            object_id=source.pk,
            status=CashTransaction.STATUS_POSTED,
            deleted_at__isnull=True,
        )
    )
    session_ids = set()
    count = 0
    for txn in qs:
        txn.status = CashTransaction.STATUS_VOID
        txn.save(update_fields=['status', 'updated_at'])
        if getattr(txn, 'posts_own_journal', False):
            from api.services.accounting import delete_journal_for_source
            delete_journal_for_source(txn)
        session_ids.add(txn.cash_session_id)
        count += 1

    for session_id in session_ids:
        session = CashSession.objects.filter(pk=session_id).first()
        if not session:
            continue
        totals = session_totals(session)
        CashSession.objects.filter(pk=session.pk).update(
            expected_closing_balance=totals['expected_closing_balance'],
        )
    return count


def soft_delete_linked_payments(source, user=None) -> int:
    """
    Soft-delete bill payments linked to a sale/purchase.

    Each payment soft-delete voids its Safe movement via the payment signal.
    """
    if source is None or not getattr(source, 'pk', None):
        return 0
    from api.models.data.payment import Payment

    ct = ContentType.objects.get_for_model(source, for_concrete_model=False)
    count = 0
    for payment in Payment.objects.filter(content_type=ct, object_id=source.pk):
        payment.soft_delete(user=user)
        count += 1
    return count


def sync_drawer_from_expense(expense, user=None):
    method = (getattr(expense, 'payment_method', None) or 'cash').lower()
    if method != 'cash' or getattr(expense, 'deleted_at', None):
        void_drawer_for_source(expense, user=user)
        return None
    amount = d(getattr(expense, 'amount', 0) or 0)
    if amount <= 0:
        void_drawer_for_source(expense, user=user)
        return None
    return record_transaction(
        direction=CashTransaction.DIRECTION_OUT,
        category=CashTransaction.CAT_BUSINESS_EXPENSE,
        amount=amount,
        description=getattr(expense, 'description', None) or 'Business expense',
        user=user,
        source=expense,
        currency=getattr(expense, 'currency', None),
        exchange_rate=getattr(expense, 'exchange_rate', 1) or 1,
        transaction_date=getattr(expense, 'expense_date', None),
        posts_own_journal=False,
    )


@transaction.atomic
def deposit_cash_to_drawer(*, amount, description: str = '', user=None, currency=None):
    """
    Put cash into the open drawer at any time (morning open or mid-day).
    Increases drawer balance and posts Owner capital → Cash.
    """
    session = get_open_session()
    if session is None:
        raise ValidationError('Open the drawer first, then deposit cash.')
    amount = _q(amount)
    if amount <= 0:
        raise ValidationError('Deposit amount must be greater than zero.')
    return record_transaction(
        session=session,
        direction=CashTransaction.DIRECTION_IN,
        category=CashTransaction.CAT_OWNER_CAPITAL,
        amount=amount,
        description=description or 'Cash deposited into drawer',
        user=user,
        currency=currency,
        posts_own_journal=True,
        skip_session_check=True,
    )


def sync_drawer_from_withdrawal(withdrawal, user=None):
    method = (getattr(withdrawal, 'payment_method', None) or 'cash').lower()
    if method != 'cash' or getattr(withdrawal, 'deleted_at', None):
        void_drawer_for_source(withdrawal, user=user)
        return None
    amount = d(getattr(withdrawal, 'amount', 0) or 0)
    if amount <= 0:
        void_drawer_for_source(withdrawal, user=user)
        return None
    return record_transaction(
        direction=CashTransaction.DIRECTION_OUT,
        category=CashTransaction.CAT_OWNER_WITHDRAWAL,
        amount=amount,
        description=getattr(withdrawal, 'description', None) or 'Owner withdrawal',
        user=user,
        source=withdrawal,
        currency=getattr(withdrawal, 'currency', None),
        exchange_rate=getattr(withdrawal, 'exchange_rate', 1) or 1,
        transaction_date=getattr(withdrawal, 'withdrawal_date', None),
        posts_own_journal=False,
    )


def sync_drawer_from_payroll(payroll, user=None):
    """Cash salary/advance paid from the Safe — bank/sarafi/goods skip the drawer."""
    method = (getattr(payroll, 'payment_method', None) or 'cash').lower()
    if method != 'cash' or getattr(payroll, 'deleted_at', None):
        void_drawer_for_source(payroll, user=user)
        return None
    if getattr(payroll, 'source_sale_id', None):
        void_drawer_for_source(payroll, user=user)
        return None
    amount = d(getattr(payroll, 'net_salary', 0) or getattr(payroll, 'amount', 0) or 0)
    if amount <= 0:
        void_drawer_for_source(payroll, user=user)
        return None
    label = getattr(payroll, 'get_payroll_type_display', lambda: 'Payroll')()
    return record_transaction(
        direction=CashTransaction.DIRECTION_OUT,
        category=CashTransaction.CAT_OTHER_PAYMENT,
        amount=amount,
        description=getattr(payroll, 'notes', None) or f'{label} cash payment',
        user=user,
        source=payroll,
        currency=getattr(payroll, 'currency', None),
        exchange_rate=getattr(payroll, 'exchange_rate', 1) or 1,
        transaction_date=getattr(payroll, 'payment_date', None),
        posts_own_journal=False,
    )


def sync_drawer_from_loan(loan, user=None):
    """Cash loan in → Safe income; cash loan out → Safe outcome. Opening balances skip."""
    if getattr(loan, 'deleted_at', None):
        void_drawer_for_source(loan, user=user)
        return None
    if getattr(loan, 'is_opening_balance', False) or getattr(loan, 'source_payment_id', None):
        void_drawer_for_source(loan, user=user)
        return None
    method = (getattr(loan, 'payment_method', None) or 'cash').lower()
    if method != 'cash':
        void_drawer_for_source(loan, user=user)
        return None
    amount = d(getattr(loan, 'amount', 0) or 0)
    if amount <= 0:
        void_drawer_for_source(loan, user=user)
        return None
    if getattr(loan, 'loan_type', None) == 'loan_in':
        direction = CashTransaction.DIRECTION_IN
        category = CashTransaction.CAT_OTHER_RECEIPT
        desc = 'Cash loan received'
    else:
        direction = CashTransaction.DIRECTION_OUT
        category = CashTransaction.CAT_OTHER_PAYMENT
        desc = 'Cash loan given'
    return record_transaction(
        direction=direction,
        category=category,
        amount=amount,
        description=getattr(loan, 'notes', None) or desc,
        user=user,
        source=loan,
        currency=getattr(loan, 'currency', None),
        exchange_rate=getattr(loan, 'exchange_rate', 1) or 1,
        transaction_date=getattr(loan, 'loan_date', None),
        posts_own_journal=False,
    )


def sync_drawer_from_loan_payment(payment, user=None):
    """Collecting a loan-out brings cash in; repaying a loan-in takes cash out."""
    if getattr(payment, 'deleted_at', None):
        void_drawer_for_source(payment, user=user)
        return None
    loan = getattr(payment, 'loan', None)
    if loan is None:
        void_drawer_for_source(payment, user=user)
        return None
    method = (
        getattr(payment, 'payment_method', None)
        or getattr(loan, 'payment_method', None)
        or 'cash'
    ).lower()
    if method != 'cash':
        void_drawer_for_source(payment, user=user)
        return None
    amount = d(getattr(payment, 'amount', 0) or 0)
    if amount <= 0:
        void_drawer_for_source(payment, user=user)
        return None
    if getattr(loan, 'loan_type', None) == 'loan_in':
        direction = CashTransaction.DIRECTION_OUT
        category = CashTransaction.CAT_OTHER_PAYMENT
        desc = 'Cash loan repayment'
    else:
        direction = CashTransaction.DIRECTION_IN
        category = CashTransaction.CAT_OTHER_RECEIPT
        desc = 'Cash loan collection'
    return record_transaction(
        direction=direction,
        category=category,
        amount=amount,
        description=getattr(payment, 'notes', None) or desc,
        user=user,
        source=payment,
        currency=getattr(payment, 'currency', None) or getattr(loan, 'currency', None),
        exchange_rate=getattr(payment, 'exchange_rate', None) or getattr(loan, 'exchange_rate', 1) or 1,
        transaction_date=getattr(payment, 'payment_date', None),
        posts_own_journal=False,
    )


@transaction.atomic
def close_session(
    *,
    session: CashSession,
    actual_closing_balance,
    carry_forward_amount,
    count_lines: list[dict] | None = None,
    difference_reason: str = '',
    removals: list[dict] | None = None,
    user=None,
    notes: str = '',
) -> CashSession:
    session = CashSession.objects.select_for_update().get(pk=session.pk)
    if not session.is_open:
        raise ValidationError('Session is already closed.')

    totals = session_totals(session)
    expected = _q(totals['expected_closing_balance'])
    actual = _q(actual_closing_balance)
    carry = _q(carry_forward_amount)
    if carry < 0:
        raise ValidationError('Carry-forward cannot be negative.')
    if carry > actual:
        raise ValidationError('Carry-forward cannot exceed the physically counted cash.')

    difference = _q(actual - expected)
    if difference != 0 and not (difference_reason or '').strip():
        raise ValidationError('A reason is required when counted cash differs from expected.')

    # Persist denomination lines
    if count_lines is not None:
        session.count_lines.all().delete()
        counted = Decimal('0')
        for row in count_lines:
            denom = _q(row.get('denomination') or 0)
            qty = int(row.get('quantity') or 0)
            if denom <= 0 or qty < 0:
                continue
            line = CashCountLine(
                cash_session=session,
                denomination=denom,
                quantity=qty,
            )
            line.save()
            counted += line.subtotal
        if count_lines and _q(counted) != actual:
            # Prefer explicit actual; warn by aligning if user only sent lines
            actual = _q(counted)
            difference = _q(actual - expected)

    # Record over/short if needed (own journal)
    if difference > 0:
        record_transaction(
            session=session,
            direction=CashTransaction.DIRECTION_IN,
            category=CashTransaction.CAT_CASH_OVERAGE,
            amount=difference,
            description=difference_reason or 'Cash overage at close',
            user=user,
            posts_own_journal=True,
            skip_session_check=True,
        )
    elif difference < 0:
        record_transaction(
            session=session,
            direction=CashTransaction.DIRECTION_OUT,
            category=CashTransaction.CAT_CASH_SHORTAGE,
            amount=abs(difference),
            description=difference_reason or 'Cash shortage at close',
            user=user,
            posts_own_journal=True,
            skip_session_check=True,
        )

    # Removals after count — must be classified (owner draw / bank deposit / other)
    allowed_removal = {
        CashTransaction.CAT_OWNER_WITHDRAWAL,
        CashTransaction.CAT_BANK_DEPOSIT,
        CashTransaction.CAT_OTHER_PAYMENT,
    }
    removed_total = Decimal('0')
    for row in removals or []:
        amt = _q(row.get('amount') or 0)
        if amt <= 0:
            continue
        cat = row.get('category') or ''
        if cat not in allowed_removal:
            raise ValidationError(
                'Cash removed at close must be classified as owner_withdrawal, bank_deposit, or other_payment.',
            )
        record_transaction(
            session=session,
            direction=CashTransaction.DIRECTION_OUT,
            category=cat,
            amount=amt,
            description=row.get('description') or 'Cash removed at session close',
            user=user,
            posts_own_journal=True,
            skip_session_check=True,
        )
        removed_total += amt

    if _q(actual - removed_total) != carry:
        # Recompute carry if removals imply it
        carry = _q(actual - removed_total)
        if carry < 0:
            raise ValidationError('Removals exceed counted cash.')

    session.expected_closing_balance = expected
    session.actual_closing_balance = actual
    session.cash_difference = difference
    session.difference_reason = difference_reason or None
    session.carry_forward_amount = carry
    session.status = CashSession.STATUS_CLOSED
    session.closed_by = user if getattr(user, 'is_authenticated', False) else None
    session.closed_at = timezone.now()
    if notes:
        session.notes = notes
    session.save()
    return session
