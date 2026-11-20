"""Customer/vendor balances and history from business transactions (not GL accounts)."""

from decimal import Decimal

from django.db.models import Q

from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS, get_currency
from api.utils.date_filters import normalize_date_from, normalize_date_to

SKIP_SALE_STATUSES = {'draft', 'cancelled'}
SKIP_PURCHASE_STATUSES = {'draft', 'cancelled'}


def _currency_code(currency_id):
    c = get_currency(currency_id)
    if c:
        return c['code'].upper()
    return str(currency_id or '').upper()


def _resolve_currency_filter(currency):
    """Accept AFN/afn or numeric currency id; return uppercase code or None."""
    if currency in (None, ''):
        return None
    raw = str(currency).strip()
    if not raw or raw.lower() == 'all':
        return None
    from api.models.data.currency import get_currency_by_code
    by_code = get_currency_by_code(raw)
    if by_code:
        return by_code['code'].upper()
    try:
        by_id = get_currency(int(raw))
    except (TypeError, ValueError):
        by_id = None
    if by_id:
        return by_id['code'].upper()
    return raw.upper()


def _in_date_range(dt, date_from=None, date_to=None):
    """Check if a datetime falls within the given date range (inclusive)."""
    date_from = normalize_date_from(date_from)
    date_to = normalize_date_to(date_to)

    # Debug logging to help troubleshoot date filtering issues
    # import logging
    # logger = logging.getLogger(__name__)
    # logger.debug(f"Checking date range: dt={dt}, date_from={date_from}, date_to={date_to}")

    if date_from and dt < date_from:
        return False
    if date_to and dt > date_to:
        return False
    return True


def _finance_bucket():
    return {
        'total_debit': Decimal('0'),
        'total_credit': Decimal('0'),
        'balance': Decimal('0'),
        'total_debit_base': Decimal('0'),
        'total_credit_base': Decimal('0'),
        'balance_base': Decimal('0'),
    }


def _d(value):
    return Decimal(str(value or 0))


def _historical_base(native, base_value, exchange_rate, currency_id):
    """
    Prefer stored historical AFN (*_base). Fall back to native × stored rate.
    Never use today's live ExchangeRate table for subledger overall AFN.
    """
    from api.models.data.currency import BASE_CURRENCY_ID

    native = _d(native)
    if currency_id is None or int(currency_id) == int(BASE_CURRENCY_ID):
        return native
    stored = _d(base_value)
    if stored != 0:
        return stored
    rate = _d(exchange_rate)
    # Model default exchange_rate=1 is not a valid FX rate for foreign currency.
    if rate > 1:
        return (native * rate).quantize(Decimal('0.01'))
    return Decimal('0')


def _add_finance(bucket, *, debit=0, credit=0, debit_base=0, credit_base=0):
    debit = _d(debit)
    credit = _d(credit)
    debit_base = _d(debit_base)
    credit_base = _d(credit_base)
    bucket['total_debit'] += debit
    bucket['total_credit'] += credit
    bucket['balance'] += debit - credit
    bucket['total_debit_base'] += debit_base
    bucket['total_credit_base'] += credit_base
    bucket['balance_base'] += debit_base - credit_base


def _serialize_finance(finance):
    """Serialize per-currency buckets and AFN overall from historical bases."""
    serialized = {
        code.upper(): {
            'currency': code.upper(),
            'total_debit': float(v['total_debit']),
            'total_credit': float(v['total_credit']),
            'balance': float(v['balance']),
            'total_debit_base': float(v['total_debit_base']),
            'total_credit_base': float(v['total_credit_base']),
            'balance_base': float(v['balance_base']),
        }
        for code, v in finance.items()
    }

    if not finance:
        return serialized

    overall = _finance_bucket()
    for bucket in finance.values():
        overall['total_debit'] += bucket['total_debit_base']
        overall['total_credit'] += bucket['total_credit_base']
        overall['balance'] += bucket['balance_base']

    base = CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]
    serialized['overall'] = {
        'currency': base['code'].upper(),
        'total_debit': float(overall['total_debit']),
        'total_credit': float(overall['total_credit']),
        'balance': float(overall['balance']),
        'amount_kind': 'afn_equivalent',
        'amount_kind_label': 'AFN equivalent (historical document rates)',
    }
    return serialized


def _add_advance_finance(finance, party, kind, date_from, date_to):
    from api.models.data.payment import Payment
    field = 'customer' if kind == 'sale' else 'vendor'
    payments = Payment.objects.filter(general_payment__payment_type=kind,
        **{'general_payment__' + field: party}).select_related('general_payment')
    for payment in payments.filter(is_advance=True):
        if _in_date_range(payment.payment_date, date_from, date_to):
            bucket = finance.setdefault(_currency_code(payment.currency), _finance_bucket())
            kwargs = {'credit': payment.amount, 'credit_base': payment.amount_base} if kind == 'sale' else {'debit': payment.amount, 'debit_base': payment.amount_base}
            _add_finance(bucket, **kwargs)
    # Bill paid_amount already includes credit applications. Their cash was
    # recorded by the original advance, so remove the duplicate here.
    for payment in payments.filter(is_credit_application=True):
        bill = payment.content_object
        when = getattr(bill, 'sale_date' if kind == 'sale' else 'purchase_date', None)
        if bill and bill.deleted_at is None and bill.status not in (SKIP_SALE_STATUSES if kind == 'sale' else {'draft', 'cancelled', 'pending'}) and _in_date_range(when, date_from, date_to):
            bucket = finance.setdefault(_currency_code(payment.currency), _finance_bucket())
            kwargs = {'credit': -payment.amount, 'credit_base': -payment.amount_base} if kind == 'sale' else {'debit': -payment.amount, 'debit_base': -payment.amount_base}
            _add_finance(bucket, **kwargs)


def get_customer_finance(customer, date_from=None, date_to=None):
    from api.models.data.loan import Loan
    from api.models.data.returns import Return
    from api.models.data.sales import Sales

    finance = {}

    sales_qs = Sales.objects.filter(customer=customer).exclude(
        status__in=SKIP_SALE_STATUSES)
    for sale in sales_qs:
        if not _in_date_range(sale.sale_date, date_from, date_to):
            continue
        key = _currency_code(sale.currency)
        bucket = finance.setdefault(key, _finance_bucket())
        total = _d(sale.total_amount)
        paid = _d(sale.paid_amount)
        total_base = _historical_base(
            total, sale.total_amount_base, sale.exchange_rate, sale.currency
        )
        paid_base = _historical_base(
            paid, sale.paid_amount_base, sale.exchange_rate, sale.currency
        )
        _add_finance(
            bucket,
            debit=total,
            credit=paid,
            debit_base=total_base,
            credit_base=paid_base,
        )

    returns_qs = Return.objects.filter(sales__customer=customer)
    for ret in returns_qs.select_related('sales'):
        if not _in_date_range(ret.return_date, date_from, date_to):
            continue
        key = _currency_code(ret.currency)
        bucket = finance.setdefault(key, _finance_bucket())
        amount = _d(ret.total_amount)
        amount_base = _historical_base(
            amount, ret.total_amount_base, ret.exchange_rate, ret.currency
        )
        # Returns reduce AR: credit native/base
        _add_finance(bucket, credit=amount, credit_base=amount_base)

    loans_qs = Loan.objects.filter(customer=customer, loaner_type='customer')
    for loan in loans_qs:
        if not _in_date_range(loan.loan_date, date_from, date_to):
            continue
        key = _currency_code(loan.currency)
        bucket = finance.setdefault(key, _finance_bucket())
        amount = _d(loan.amount)
        paid = _d(loan.amount_paid)
        amount_base = _historical_base(
            amount, loan.amount_base, loan.exchange_rate, loan.currency
        )
        paid_base = _historical_base(
            paid, loan.amount_paid_base, loan.exchange_rate, loan.currency
        )
        if loan.loan_type == 'loan_out':
            _add_finance(
                bucket,
                debit=amount,
                credit=paid,
                debit_base=amount_base,
                credit_base=paid_base,
            )
        else:
            _add_finance(
                bucket,
                debit=paid,
                credit=amount,
                debit_base=paid_base,
                credit_base=amount_base,
            )

    _add_advance_finance(finance, customer, 'sale', date_from, date_to)
    return _serialize_finance(finance)


def get_vendor_finance(vendor, date_from=None, date_to=None):
    from api.models.data.loan import Loan
    from api.models.data.purchases import Purchase as RawMaterialPurchase

    finance = {}

    purchases_qs = RawMaterialPurchase.objects.filter(vendor=vendor).exclude(
        status__in=('draft', 'cancelled', 'pending'),
    )
    for purchase in purchases_qs:
        if not _in_date_range(purchase.purchase_date, date_from, date_to):
            continue
        key = _currency_code(purchase.currency)
        bucket = finance.setdefault(key, _finance_bucket())
        amount = _d(purchase.total_amount)
        paid = _d(purchase.paid_amount)
        amount_base = _historical_base(
            amount,
            getattr(purchase, 'total_amount_base', None),
            purchase.exchange_rate,
            purchase.currency,
        )
        paid_base = _historical_base(
            paid,
            getattr(purchase, 'paid_amount_base', None),
            purchase.exchange_rate,
            purchase.currency,
        )
        # Vendor payable: credit increases what we owe; debit (payment) reduces it.
        _add_finance(
            bucket,
            debit=paid,
            credit=amount,
            debit_base=paid_base,
            credit_base=amount_base,
        )

    loans_qs = Loan.objects.filter(vendor=vendor, loaner_type='vendor')
    for loan in loans_qs:
        if not _in_date_range(loan.loan_date, date_from, date_to):
            continue
        key = _currency_code(loan.currency)
        bucket = finance.setdefault(key, _finance_bucket())
        amount = _d(loan.amount)
        paid = _d(loan.amount_paid)
        amount_base = _historical_base(
            amount, loan.amount_base, loan.exchange_rate, loan.currency
        )
        paid_base = _historical_base(
            paid, loan.amount_paid_base, loan.exchange_rate, loan.currency
        )
        # Vendor ledger perspective: loan_in = we owe vendor (credit principal, debit payments)
        # loan_out = vendor owes us (debit principal, credit collections)
        if loan.loan_type == 'loan_in':
            _add_finance(
                bucket,
                debit=paid,
                credit=amount,
                debit_base=paid_base,
                credit_base=amount_base,
            )
        else:
            _add_finance(
                bucket,
                debit=amount,
                credit=paid,
                debit_base=amount_base,
                credit_base=paid_base,
            )

    _add_advance_finance(finance, vendor, 'purchase', date_from, date_to)
    return _serialize_finance(finance)


def _append_tx(rows, *, tx_id, entry_date, entry_type_name, entry_type_key, reference_number, debit, credit, notes, currency_code, created_at=None):
    rows.append({
        'id': tx_id,
        'entry_date': entry_date,
        'created_at': created_at or entry_date,
        'entry_type_name': entry_type_name,
        'entry_type_key': entry_type_key,
        'entry_type_details': {'name': entry_type_name, 'key': entry_type_key},
        'reference_number': reference_number or '',
        'debit_amount': float(debit),
        'credit_amount': float(credit),
        'notes': notes or '',
        'account_currency': currency_code,
    })


def prepare_transaction_history(rows):
    sorted_rows = sorted(rows, key=lambda r: (r['entry_date'], str(r['id'])))
    running_by_currency = {}
    totals_by_currency = {}

    for row in sorted_rows:
        currency = row.get('account_currency') or 'N/A'
        debit = Decimal(str(row.get('debit_amount') or 0))
        credit = Decimal(str(row.get('credit_amount') or 0))

        running_by_currency[currency] = running_by_currency.get(
            currency, Decimal('0')) + debit - credit
        row['running_balance'] = float(running_by_currency[currency])

        bucket = totals_by_currency.setdefault(currency, {
            'currency': currency,
            'total_debit': Decimal('0'),
            'total_credit': Decimal('0'),
            'balance': Decimal('0'),
            'transaction_count': 0,
        })
        bucket['total_debit'] += debit
        bucket['total_credit'] += credit
        bucket['transaction_count'] += 1

    for bucket in totals_by_currency.values():
        bucket['balance'] = bucket['total_debit'] - bucket['total_credit']
        bucket['total_debit'] = float(bucket['total_debit'])
        bucket['total_credit'] = float(bucket['total_credit'])
        bucket['balance'] = float(bucket['balance'])

    # Running balances stay chronological; list newest business date first.
    def date_order(row):
        prefix, _, suffix = str(row['id']).rpartition('-')
        return (
            row['entry_date'],
            row.get('created_at') or row['entry_date'],
            prefix,
            int(suffix) if suffix.isdigit() else 0,
        )
    return sorted(sorted_rows, key=date_order, reverse=True), totals_by_currency


def query_customer_transactions(customer, *, search=None, date_from=None, date_to=None, currency=None):
    from api.models.data.loan import Loan, LoanPayment
    from api.models.data.payment import Payment
    from api.models.data.returns import Return
    from api.models.data.sales import Sales
    from django.contrib.contenttypes.models import ContentType

    rows = []
    sale_ct = ContentType.objects.get_for_model(Sales)

    sales_qs = Sales.objects.filter(customer=customer).exclude(
        status__in=SKIP_SALE_STATUSES)
    for sale in sales_qs:
        if _in_date_range(sale.sale_date, date_from, date_to):
            _append_tx(
                rows,
                tx_id=f'sale-{sale.id}',
                entry_date=sale.sale_date, created_at=sale.created_at,
                entry_type_name='Sales',
                entry_type_key='sale',
                reference_number=sale.invoice_number,
                debit=Decimal(str(sale.total_amount)),
                credit=Decimal('0'),
                notes=sale.notes,
                currency_code=_currency_code(sale.currency),
            )
        for payment in Payment.objects.filter(content_type=sale_ct, object_id=sale.pk, payment_type='sale', is_credit_application=False):
            if _in_date_range(payment.payment_date, date_from, date_to):
                _append_tx(
                    rows,
                    tx_id=f'payment-{payment.id}',
                    entry_date=payment.payment_date, created_at=payment.created_at,
                    entry_type_name='Payment',
                    entry_type_key='payment',
                    reference_number=payment.reference_number or f'PAY-{payment.id}',
                    debit=Decimal('0'),
                    credit=Decimal(str(payment.amount)),
                    notes=payment.notes,
                    currency_code=_currency_code(payment.currency),
                )

    returns_qs = Return.objects.filter(sales__customer=customer)
    for ret in returns_qs.select_related('sales'):
        if _in_date_range(ret.return_date, date_from, date_to):
            _append_tx(
                rows,
                tx_id=f'return-{ret.id}',
                entry_date=ret.return_date, created_at=ret.created_at,
                entry_type_name='Return',
                entry_type_key='return',
                reference_number=ret.return_number,
                debit=Decimal('0'),
                credit=Decimal(str(ret.total_amount)),
                notes=ret.notes,
                currency_code=_currency_code(ret.currency),
            )

    loans_qs = Loan.objects.filter(customer=customer, loaner_type='customer')
    for loan in loans_qs:
        if _in_date_range(loan.loan_date, date_from, date_to):
            is_out = loan.loan_type == 'loan_out'
            _append_tx(
                rows,
                tx_id=f'loan-{loan.id}',
                entry_date=loan.loan_date, created_at=loan.created_at,
                entry_type_name='Loan',
                entry_type_key='loan',
                reference_number=loan.bill_number or f'LOAN-{loan.id}',
                debit=Decimal(str(loan.amount)) if is_out else Decimal('0'),
                credit=Decimal('0') if is_out else Decimal(str(loan.amount)),
                notes=loan.notes,
                currency_code=_currency_code(loan.currency),
            )
        for lp in LoanPayment.objects.filter(loan=loan):
            if _in_date_range(lp.payment_date, date_from, date_to):
                is_out = loan.loan_type == 'loan_out'
                _append_tx(
                    rows,
                    tx_id=f'loan-payment-{lp.id}',
                    entry_date=lp.payment_date, created_at=lp.created_at,
                    entry_type_name='Loan Payment',
                    entry_type_key='loan_payment',
                    reference_number=lp.reference_number or f'LPAY-{lp.id}',
                    debit=Decimal('0') if is_out else Decimal(str(lp.amount)),
                    credit=Decimal(str(lp.amount)) if is_out else Decimal('0'),
                    notes=lp.notes,
                    currency_code=_currency_code(loan.currency),
                )

    for payment in Payment.objects.filter(is_advance=True, general_payment__customer=customer):
        if _in_date_range(payment.payment_date, date_from, date_to):
            _append_tx(rows, tx_id=f'advance-{payment.id}', entry_date=payment.payment_date, created_at=payment.created_at,
                entry_type_name='Advance payment', entry_type_key='payment',
                reference_number=payment.reference_number or f'GPAY-{payment.general_payment_id}',
                debit=Decimal("0"), credit=payment.amount,
                notes=payment.notes, currency_code=_currency_code(payment.currency))

    if search:
        q = search.lower()
        rows = [
            r for r in rows
            if q in (r.get('reference_number') or '').lower()
            or q in (r.get('notes') or '').lower()
            or q in r.get('entry_type_name', '').lower()
        ]

    code = _resolve_currency_filter(currency)
    if code:
        rows = [r for r in rows if (r.get('account_currency') or '').upper() == code]

    return rows


def query_vendor_transactions(vendor, *, search=None, date_from=None, date_to=None, currency=None):
    from django.contrib.contenttypes.models import ContentType

    from api.models.data.loan import Loan, LoanPayment
    from api.models.data.payment import Payment
    from api.models.data.purchases import Purchase as RawMaterialPurchase

    rows = []
    purchase_ct = ContentType.objects.get_for_model(RawMaterialPurchase)

    purchases_qs = RawMaterialPurchase.objects.filter(vendor=vendor).exclude(
        status__in=('draft', 'cancelled', 'pending'),
    )
    for purchase in purchases_qs:
        if _in_date_range(purchase.purchase_date, date_from, date_to):
            _append_tx(
                rows,
                tx_id=f'raw-material-purchase-{purchase.id}',
                entry_date=purchase.purchase_date, created_at=purchase.created_at,
                entry_type_name='Purchase',
                entry_type_key='purchase',
                reference_number=purchase.invoice_number,
                debit=Decimal('0'),
                credit=Decimal(str(purchase.total_amount)),
                notes=purchase.notes,
                currency_code=_currency_code(purchase.currency),
            )
        for payment in Payment.objects.filter(
            content_type=purchase_ct,
            object_id=purchase.pk,
            payment_type='purchase',
            is_credit_application=False,
        ):
            if _in_date_range(payment.payment_date, date_from, date_to):
                _append_tx(
                    rows,
                    tx_id=f'payment-{payment.id}',
                    entry_date=payment.payment_date, created_at=payment.created_at,
                    entry_type_name='Payment',
                    entry_type_key='payment',
                    reference_number=payment.reference_number or f'PAY-{payment.id}',
                    debit=Decimal(str(payment.amount)),
                    credit=Decimal('0'),
                    notes=payment.notes,
                    currency_code=_currency_code(payment.currency),
                )

    loans_qs = Loan.objects.filter(vendor=vendor, loaner_type='vendor')
    for loan in loans_qs:
        if _in_date_range(loan.loan_date, date_from, date_to):
            is_in = loan.loan_type == 'loan_in'
            # Vendor ledger perspective: loan_in = we owe vendor (credit), loan_out = vendor owes us (debit)
            _append_tx(
                rows,
                tx_id=f'loan-{loan.id}',
                entry_date=loan.loan_date, created_at=loan.created_at,
                entry_type_name='Loan',
                entry_type_key='loan',
                reference_number=loan.bill_number or f'LOAN-{loan.id}',
                debit=Decimal('0') if is_in else Decimal(str(loan.amount)),
                credit=Decimal(str(loan.amount)) if is_in else Decimal('0'),
                notes=loan.notes,
                currency_code=_currency_code(loan.currency),
            )
        for lp in LoanPayment.objects.filter(loan=loan):
            if _in_date_range(lp.payment_date, date_from, date_to):
                is_in = loan.loan_type == 'loan_in'
                # Loan payment: loan_in payment = we pay vendor (debit), loan_out collection = vendor pays us (credit)
                _append_tx(
                    rows,
                    tx_id=f'loan-payment-{lp.id}',
                    entry_date=lp.payment_date, created_at=lp.created_at,
                    entry_type_name='Loan Payment',
                    entry_type_key='loan_payment',
                    reference_number=lp.reference_number or f'LPAY-{lp.id}',
                    debit=Decimal(str(lp.amount)) if is_in else Decimal('0'),
                    credit=Decimal('0') if is_in else Decimal(str(lp.amount)),
                    notes=lp.notes,
                    currency_code=_currency_code(loan.currency),
                )

    for payment in Payment.objects.filter(is_advance=True, general_payment__vendor=vendor):
        if _in_date_range(payment.payment_date, date_from, date_to):
            _append_tx(rows, tx_id=f'advance-{payment.id}', entry_date=payment.payment_date, created_at=payment.general_payment.source_sale.created_at if payment.general_payment.source_sale_id else payment.created_at,
                entry_type_name=('Purchase return' if payment.general_payment.source_sale.vendor_transaction == 'purchase_return' else 'Raw material sale to vendor') if payment.general_payment.source_sale_id else 'Advance payment',
                entry_type_key='vendor_goods' if payment.general_payment.source_sale_id else 'payment',
                reference_number=payment.reference_number or f'GPAY-{payment.general_payment_id}',
                debit=payment.amount, credit=Decimal("0"),
                notes=payment.notes, currency_code=_currency_code(payment.currency))

    if search:
        q = search.lower()
        rows = [
            r for r in rows
            if q in (r.get('reference_number') or '').lower()
            or q in (r.get('notes') or '').lower()
            or q in r.get('entry_type_name', '').lower()
        ]

    code = _resolve_currency_filter(currency)
    if code:
        rows = [r for r in rows if (r.get('account_currency') or '').upper() == code]

    return rows


def get_contact_balances_report(*, customers_qs=None, vendors_qs=None, search=None):
    from api.models.data.customers import Customer
    from api.models.data.vendors import Vendor

    customers_qs = customers_qs or Customer.objects.all()
    vendors_qs = vendors_qs or Vendor.objects.all()

    if search:
        customers_qs = customers_qs.filter(
            Q(name__icontains=search) | Q(
                phone__icontains=search) | Q(email__icontains=search)
        )
        vendors_qs = vendors_qs.filter(Q(name__icontains=search))

    results = []
    for customer in customers_qs:
        finance = get_customer_finance(customer)
        for code, bucket in finance.items():
            if code == 'overall':
                continue
            balance = bucket['balance']
            if balance == 0:
                continue
            results.append({
                'id': customer.id,
                'contact_type': 'customer',
                'holder_name': customer.name,
                'account_type': 'customer',
                'currency': code.upper(),
                'total_debit': bucket['total_debit'],
                'total_credit': bucket['total_credit'],
                'balance': balance,
                'entries_count': len(query_customer_transactions(customer)),
            })

    for vendor in vendors_qs:
        finance = get_vendor_finance(vendor)
        for code, bucket in finance.items():
            if code == 'overall':
                continue
            balance = bucket['balance']
            if balance == 0:
                continue
            results.append({
                'id': vendor.id,
                'contact_type': 'vendor',
                'holder_name': vendor.name,
                'account_type': 'vendor',
                'currency': code.upper(),
                'total_debit': bucket['total_debit'],
                'total_credit': bucket['total_credit'],
                'balance': balance,
                'entries_count': len(query_vendor_transactions(vendor)),
            })

    return results
