"""Shared fixtures and capability probes for multi-currency accounting tests."""
from datetime import datetime
from decimal import Decimal

from django.apps import apps
from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.utils import timezone

from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_BY_CODE, ExchangeRate
from api.models.data.expenses import Expense, ExpenseCategory
from api.models.data.journal import JournalEntry, JournalLine
from api.services.accounting.amounts import d
from api.services.accounting.coa import get_gl_account
from api.services.currency_conversion import populate_base_amounts

User = get_user_model()

AFN = BASE_CURRENCY_ID
USD = CURRENCY_BY_CODE['USD']['id']
KDR = CURRENCY_BY_CODE['KDR']['id']

USD_RATE_8720 = Decimal('87.20')
USD_RATE_9000 = Decimal('90.00')
TXN_WHEN = timezone.make_aware(datetime(2026, 8, 1, 12, 0, 0))


def journal_line_field_names():
    return {field.name for field in JournalLine._meta.get_fields()}


def journal_line_has_functional_fields():
    required = {'currency', 'exchange_rate', 'base_debit', 'base_credit'}
    names = journal_line_field_names()
    return required <= names or (
        {'currency', 'exchange_rate'} <= names
        and ({'base_debit', 'base_credit'} <= names or {'debit_base', 'credit_base'} <= names)
    )


def has_api_model(model_name):
    try:
        apps.get_model('api', model_name)
        return True
    except LookupError:
        return False


def has_gl_role(*role_names):
    from api.constants.gl_roles import GL_ROLE_CODES

    return any(name in GL_ROLE_CODES for name in role_names)


def has_accounting_module(module_name):
    import importlib.util

    return importlib.util.find_spec(f'api.services.accounting.{module_name}') is not None


def create_staff_user(*, username, email, password='test-pass-123', as_admin=False):
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        first_name=username,
        last_name='Staff',
    )
    user.is_admin = as_admin
    user.is_superuser = as_admin
    user.is_staff = as_admin
    user.role = 'admin' if as_admin else 'staff'
    user.save(update_fields=['is_admin', 'is_superuser', 'is_staff', 'role'])
    return user


def create_exchange_rate(*, from_currency, rate, when, to_currency=AFN):
    return ExchangeRate.objects.create(
        from_currency=from_currency,
        to_currency=to_currency,
        rate=rate,
        date=when,
        effective_date=when,
        is_active=True,
        notes='phase0-test',
    )


def cash_native_net(currency_id):
    """Debit minus credit on Cash (1000) for the currency-specific cash GL."""
    gl = get_gl_account('1000', currency_id=currency_id)
    agg = JournalLine.objects.filter(gl_account=gl).aggregate(
        total_debit=Sum('debit'),
        total_credit=Sum('credit'),
    )
    return d(agg['total_debit']) - d(agg['total_credit'])


def gl_native_net(code, currency_id):
    from api.constants.gl_roles import is_currency_specific_gl_code

    gl = get_gl_account(code, currency_id=currency_id)
    qs = JournalLine.objects.filter(gl_account=gl)
    if not is_currency_specific_gl_code(code):
        qs = qs.filter(currency=currency_id)
    agg = qs.aggregate(
        total_debit=Sum('debit'),
        total_credit=Sum('credit'),
    )
    return d(agg['total_debit']) - d(agg['total_credit'])


def cash_base_net(currency_id):
    """AFN carrying (base debit minus base credit) on Cash (1000)."""
    gl = get_gl_account('1000', currency_id=currency_id)
    agg = JournalLine.objects.filter(gl_account=gl).aggregate(
        total_debit=Sum('base_debit'),
        total_credit=Sum('base_credit'),
    )
    return d(agg['total_debit']) - d(agg['total_credit'])


def journal_for_source(source):
    from django.contrib.contenttypes.models import ContentType

    return JournalEntry.objects.filter(
        content_type=ContentType.objects.get_for_model(source),
        object_id=source.pk,
        is_auto=True,
    ).prefetch_related('lines__gl_account').first()


def native_totals(journal):
    debit = sum((d(line.debit) for line in journal.lines.all()), Decimal('0'))
    credit = sum((d(line.credit) for line in journal.lines.all()), Decimal('0'))
    return debit, credit


def seed_cash(*, amount, currency, when=TXN_WHEN, description='test cash seed'):
    """Post Dr Cash / Cr Other Income so FX tests can seed a cash balance."""
    from api.services.accounting.coa import get_gl_for_role
    from api.services.accounting.journal_fx import prepare_posted_line
    from api.services.fiscal_year import assert_fiscal_year_open_for_date, get_fiscal_year_for_date

    class _Ctx:
        def __init__(self):
            self.currency = currency

    amount = d(amount)
    ctx = _Ctx()
    cash = get_gl_account('1000', currency_id=currency)
    income = get_gl_for_role('other_income', currency_id=AFN)
    assert_fiscal_year_open_for_date(when)
    fiscal_year = get_fiscal_year_for_date(when)
    prepared = [
        prepare_posted_line(
            {
                'gl_account': cash,
                'debit': amount,
                'credit': Decimal('0'),
                'description': description,
            },
            source=ctx,
            entry_date=when,
            require_rate=True,
        ),
        prepare_posted_line(
            {
                'gl_account': income,
                'debit': Decimal('0'),
                'credit': amount,
                'description': description,
            },
            source=ctx,
            entry_date=when,
            require_rate=True,
        ),
    ]
    journal = JournalEntry.objects.create(
        entry_date=when,
        reference_number=f'SEED-CASH-{currency}',
        description=description,
        is_auto=True,
        fiscal_year=fiscal_year,
    )
    for line in prepared:
        JournalLine.objects.create(journal_entry=journal, **line)
    return journal


def create_currency_exchange(
    *,
    from_currency,
    from_amount,
    to_currency,
    to_amount,
    when=TXN_WHEN,
    from_method='cash',
    to_method='cash',
    rate=None,
    status='posted',
    notes='test currency exchange',
):
    from api.models.data.currency_exchange import CurrencyExchange

    kwargs = {
        'exchange_date': when,
        'from_currency': from_currency,
        'from_amount': from_amount,
        'from_method': from_method,
        'to_currency': to_currency,
        'to_amount': to_amount,
        'to_method': to_method,
        'status': status,
        'notes': notes,
    }
    if rate is not None:
        kwargs['rate'] = rate
    return CurrencyExchange.objects.create(**kwargs)


def create_expense(*, amount, currency=AFN, when=TXN_WHEN, description='phase0 expense'):
    category, _ = ExpenseCategory.objects.get_or_create(
        name='Phase0 Test Category',
        defaults={'description': 'Accounting Phase 0'},
    )
    expense = Expense(
        category=category,
        amount=amount,
        currency=currency,
        expense_date=when,
        description=description,
    )
    populate_base_amounts(
        expense,
        amount_fields=['amount'],
        at_datetime=when,
        raise_if_missing=True,
    )
    expense.save()
    return expense


def create_confirmed_sale(*, amount, currency=AFN, when=TXN_WHEN, product=None):
    """Confirmed sale with one packaging line so totals and the sales journal post."""
    from api.models.data.customers import Customer
    from api.models.data.product_packaging import ProductPackaging
    from api.models.data.products import Product
    from api.models.data.sales import Sales, SalesItems
    from api.models.data.uom import UnitCategory, UnitOfMeasure

    if product is None:
        category, _ = UnitCategory.objects.get_or_create(code='count', defaults={'name': 'Count'})
        piece, _ = UnitOfMeasure.objects.get_or_create(
            category=category,
            code='piece',
            defaults={
                'name': 'Piece',
                'symbol': 'pc',
                'is_category_reference': True,
            },
        )
        product = Product.objects.create(
            name=f'Phase0 Product {amount}',
            sku=f'P0-{amount}',
            base_uom=piece,
            track_inventory=False,
            is_active=True,
        )
        ProductPackaging.objects.create(
            product=product,
            name='Piece',
            qty_in_base=Decimal('1'),
            is_base=True,
            for_sale=True,
            for_purchase=True,
            for_stock=True,
            uom=piece,
        )

    packaging = product.packagings.filter(is_base=True).first() or product.packagings.first()
    customer = Customer.objects.create(is_active=True)

    sale = Sales(
        customer=customer,
        sale_date=when,
        status='confirmed',
        currency=currency,
        total_amount=amount,
        notes='phase0 usd sale',
    )
    populate_base_amounts(
        sale,
        amount_fields=['total_amount'],
        at_datetime=when,
        raise_if_missing=True,
    )
    sale.save()
    SalesItems.objects.create(
        sales=sale,
        product=product,
        packaging=packaging,
        quantity=Decimal('1'),
        conversion_factor=Decimal(str(getattr(packaging, 'qty_in_base', 1) or 1)),
        sell_price=amount,
        unit_cost=Decimal('0'),
    )
    sale.refresh_from_db()
    return sale


def create_order_payment(*, order, amount, payment_type, when=TXN_WHEN, method='cash', currency=None):
    """Sale or purchase payment; rate/base filled from ExchangeRate at payment date."""
    from django.contrib.contenttypes.models import ContentType

    from api.models.data.payment import Payment

    currency = currency if currency is not None else order.currency
    payment = Payment(
        content_type=ContentType.objects.get_for_model(order),
        object_id=order.pk,
        payment_type=payment_type,
        payment_method=method,
        payment_date=when,
        amount=amount,
        currency=currency,
    )
    populate_base_amounts(
        payment,
        amount_fields=['amount'],
        at_datetime=when,
        raise_if_missing=True,
    )
    payment.save()
    return payment


def create_loan(*, amount, currency=AFN, when=TXN_WHEN, loan_type='loan_out', payment_method='cash'):
    from api.models.data.customers import Customer
    from api.models.data.loan import Loan

    customer = Customer.objects.create(is_active=True)
    loan = Loan(
        loaner_type='customer',
        customer=customer,
        amount=amount,
        currency=currency,
        loan_type=loan_type,
        loan_date=when,
        payment_method=payment_method,
        notes='phase0 loan',
    )
    populate_base_amounts(
        loan,
        amount_fields=['amount'],
        at_datetime=when,
        raise_if_missing=True,
    )
    loan.save()
    return loan


def create_loan_payment(*, loan, amount, when=TXN_WHEN):
    from api.models.data.loan import LoanPayment

    payment = LoanPayment(
        loan=loan,
        amount=amount,
        payment_date=when,
        notes='phase0 loan payment',
    )
    payment.save()
    return payment


def create_withdrawal(*, amount, currency=AFN, when=TXN_WHEN, payment_method='cash', description='test withdrawal'):
    from api.models.data.withdrawal import Withdrawal
    from api.services.accounting.coa import get_payment_asset_account

    gl = get_payment_asset_account(payment_method, currency_id=currency)
    withdrawal = Withdrawal(
        gl_account=gl,
        payment_method=payment_method,
        amount=amount,
        currency=currency,
        withdrawal_date=when,
        description=description,
    )
    populate_base_amounts(
        withdrawal,
        amount_fields=['amount'],
        at_datetime=when,
        raise_if_missing=True,
    )
    withdrawal.save()
    return withdrawal
