from api.models.data.currency import get_currency as _get_currency


def _ccode(cid):
    c = _get_currency(cid)
    return c["code"] if c else str(cid)


"""Report drill-down history — business records behind dashboard/reports metrics."""

from decimal import Decimal

from django.utils import timezone

from api.services.financial_reports import (
    SKIP_SALE_STATUSES,
    _period_advances,
    _period_expenses,
    _period_loan_payments,
    _period_loans,
    _period_payroll,
    _period_purchase_payments,
    _period_returns,
    _period_sale_payments,
    _period_sales,
)


def _d(value):
    return Decimal(str(value or 0))


def _float(value):
    return float(_d(value))


def _parse_filter_datetime(value, *, end=False):
    from api.services.report_period import parse_report_datetime
    return parse_report_datetime(value, end=end)


SECTION_LABELS = {
    'sales': 'Sales',
    'returns': 'Returns',
    'sales_payments': 'Sales Payments',
    'purchase_payments': 'Purchase Payments',
    'purchases': 'Purchases',
    'expenses': 'Operating Expenses',
    'withdrawals': 'Withdrawals',
    'payroll': 'Payroll',
    'advances': 'Advances',
    'return_refunds': 'Return Refunds',
    'loans_given': 'Loans Given',
    'loans_received': 'Loans Received',
    'loan_collections': 'Loan Collections',
    'loan_repayments': 'Loan Repayments',
    'equipment': 'Equipment',
    'commission_payments': 'Commission Payments',
    'currency_exchanges': 'Currency Exchanges',
    'production': 'Production',
    'accounts_receivable': 'Accounts Receivable',
    'accounts_payable': 'Accounts Payable',
    'loans_receivable': 'Loans Receivable',
    'loans_payable': 'Loans Payable',
    'principal_given': 'Principal Given',
    'principal_received': 'Principal Received',
    'purchases_invoice_total': 'Purchase Invoices (Total)',
    'purchases_invoice_paid': 'Purchase Invoices (Paid)',
    'purchases_invoice_unpaid': 'Purchase Invoices (Unpaid)',
}

BREAKDOWN_TO_SECTION = {
    'Sales': 'sales',
    'Sales Revenue': 'sales',
    'Returns': 'returns',
    'Sales Payments': 'sales_payments',
    'Purchase Payments': 'purchase_payments',
    'Purchases': 'purchases',
    'Expenses': 'expenses',
    'Operating Expenses': 'expenses',
    'Payroll': 'payroll',
    'Advances': 'advances',
    'Return Refunds': 'return_refunds',
    'Loans Given': 'loans_given',
    'Loans Received': 'loans_received',
    'Loan Collections': 'loan_collections',
    'Collections (Loan Out)': 'loan_collections',
    'Loan Repayments': 'loan_repayments',
    'Repayments (Loan In)': 'loan_repayments',
    'Withdrawals': 'withdrawals',
    'Equipment': 'equipment',
    'Commission Payments': 'commission_payments',
    'Currency Exchanges': 'currency_exchanges',
    'Production': 'production',
}

METRIC_TO_SECTIONS = {
    'total_income': ['sales', 'returns'],
    # Gross profit is ledger revenue − COGS; purchases are inventory intake, not COGS.
    'gross_profit': ['sales', 'returns'],
    'cogs': ['sales'],
    # Cash balance is GL cash position; cash flow drill-down stays on movement sections.
    'cash_balance': [
        'sales_payments', 'purchase_payments', 'expenses', 'payroll', 'advances',
        'return_refunds', 'withdrawals', 'loans_given', 'loans_received', 'loan_collections', 'loan_repayments',
    ],
    'net_cash_flow': [
        'sales_payments', 'purchase_payments', 'expenses', 'payroll', 'advances',
        'return_refunds', 'withdrawals', 'loans_given', 'loans_received', 'loan_collections', 'loan_repayments',
    ],
    'accounts_receivable': ['accounts_receivable'],
    'accounts_payable': ['accounts_payable'],
    'loans_receivable': ['loans_receivable'],
    'loans_payable': ['loans_payable'],
    'loans_given': ['loans_given'],
    'loans_received': ['loans_received'],
    'loan_collections': ['loan_collections'],
    'loan_repayments': ['loan_repayments'],
    'principal_given': ['principal_given'],
    'principal_received': ['principal_received'],
    'purchases_invoice_total': ['purchases_invoice_total'],
    'purchases_invoice_paid': ['purchases_invoice_paid'],
    'purchases_invoice_unpaid': ['purchases_invoice_unpaid'],
}

CASH_IN_SECTIONS = {
    'sales_payments',
    'loans_received',
    'loan_collections',
}
CASH_OUT_SECTIONS = {
    'loans_given',
    'loan_repayments',
    'withdrawals',
    'expenses',
    'payroll',
    'advances',
    'purchase_payments',
    'return_refunds',
    'commission_payments',
    # equipment cash-outs are flagged per-row via is_cash_out when acquisition spends cash
}


def resolve_report_sections(*, section=None, metric=None, breakdown=None):
    if section:
        key = section.strip().lower()
        if key not in SECTION_LABELS:
            return None, f'Unknown section: {section}'
        return [key], None

    if breakdown:
        key = BREAKDOWN_TO_SECTION.get(breakdown)
        if not key:
            return None, f'Unknown breakdown: {breakdown}'
        return [key], None

    if metric:
        keys = METRIC_TO_SECTIONS.get(metric)
        if not keys:
            return None, f'Unknown metric: {metric}'
        return keys, None

    return None, 'section, metric, or breakdown query parameter is required'


def _row(
    *,
    row_id,
    section,
    record_type,
    record_type_label,
    entry_date,
    reference_number='',
    description='',
    amount,
    amount_base,
    currency_code,
    contact_name='',
    status='',
    direction='neutral',
    source_path='',
    paid_amount=None,
    remaining_amount=None,
    bill_number='',
    payment_method='',
    bill_file='',
):
    return {
        'id': row_id,
        'section': section,
        'record_type': record_type,
        'record_type_label': record_type_label,
        'entry_date': entry_date,
        'reference_number': reference_number or '',
        'description': description or '',
        'amount': _float(amount),
        'amount_base': _float(amount_base),
        'currency': currency_code,
        'contact_name': contact_name or '',
        'status': status or '',
        'direction': direction,
        'source_path': source_path,
        'paid_amount': _float(paid_amount) if paid_amount is not None else None,
        'remaining_amount': _float(remaining_amount) if remaining_amount is not None else None,
        'bill_number': bill_number or '',
        'payment_method': payment_method or '',
        'bill_file': bill_file or '',
    }


def _filter_currency(qs, currency_code):
    if not currency_code:
        return qs
    from api.models.data.currency import CURRENCY_BY_CODE
    c = CURRENCY_BY_CODE.get(str(currency_code).upper())
    if not c:
        return qs.none()
    return qs.filter(currency=c['id'])


def _customer_name(customer):
    if not customer:
        return ''
    return getattr(customer, 'name', None) or ''


def _payment_status(total, paid):
    total = _d(total)
    paid = _d(paid)
    if paid <= 0:
        return 'unpaid'
    if paid >= total:
        return 'paid'
    return 'partial'


def _query_sales(start_date, end_date, currency_code=None):
    qs = _period_sales(start_date, end_date).select_related('customer')
    qs = _filter_currency(qs, currency_code)
    rows = []
    for sale in qs:
        rows.append(_row(
            row_id=f'sale-{sale.id}',
            section='sales',
            record_type='sale',
            record_type_label='Sale',
            entry_date=sale.sale_date,
            reference_number=sale.invoice_number,
            description=sale.notes,
            amount=sale.total_amount,
            amount_base=sale.total_amount_base,
            currency_code=_ccode(sale.currency),
            contact_name=_customer_name(sale.customer),
            status=sale.status,
            direction='in',
            source_path=f'/sales/{sale.id}',
            paid_amount=sale.paid_amount,
            remaining_amount=_d(sale.total_amount) - _d(sale.paid_amount),
        ))
    return rows


def _query_returns(start_date, end_date, currency_code=None, *, refunds_only=False):
    qs = _period_returns(start_date, end_date).select_related('sales', 'sales__customer')
    qs = _filter_currency(qs, currency_code)
    if refunds_only:
        qs = qs.filter(refund_amount__gt=0)
    rows = []
    for ret in qs:
        amount = ret.refund_amount if refunds_only else ret.total_amount
        amount_base = ret.refund_amount_base if refunds_only else ret.total_amount_base
        section = 'return_refunds' if refunds_only else 'returns'
        rows.append(_row(
            row_id=f'return-{ret.id}',
            section=section,
            record_type='return',
            record_type_label='Return Refund' if refunds_only else 'Return',
            entry_date=ret.return_date,
            reference_number=ret.return_number,
            description=ret.reason or ret.notes,
            amount=-_d(amount),
            amount_base=-_d(amount_base),
            currency_code=_ccode(ret.currency),
            contact_name=_customer_name(ret.sales.customer if ret.sales else None),
            status='refunded' if refunds_only else 'returned',
            direction='out' if refunds_only else 'neutral',
            source_path=f'/returns/{ret.id}',
        ))
    return rows


def _query_purchases(start_date, end_date, currency_code=None):
    """Received raw-material purchases (inventory + AP)."""
    from api.services.financial_reports import _period_purchases

    qs = _period_purchases(start_date, end_date).select_related('vendor')
    qs = _filter_currency(qs, currency_code)
    rows = []
    for purchase in qs:
        total = _d(purchase.total_amount)
        paid = _d(purchase.paid_amount)
        rows.append(_row(
            row_id=f'purchase-{purchase.id}',
            section='purchases',
            record_type='purchase',
            record_type_label='Purchase',
            entry_date=purchase.purchase_date,
            reference_number=purchase.invoice_number or f'RMP-{purchase.id}',
            description=purchase.notes or (
                f'Raw material purchase — {purchase.vendor.name}'
                if purchase.vendor_id else 'Raw material purchase'
            ),
            amount=total,
            amount_base=purchase.total_amount_base,
            currency_code=_ccode(purchase.currency),
            contact_name=purchase.vendor.name if purchase.vendor_id else '',
            status=_payment_status(total, paid),
            direction='neutral',
            source_path=f'/raw-material-purchases/{purchase.id}',
            paid_amount=paid,
            remaining_amount=max(total - paid, Decimal('0')),
        ))
    return rows


def _query_expenses(start_date, end_date, currency_code=None):
    qs = _period_expenses(start_date, end_date).select_related('category', 'user')
    qs = _filter_currency(qs, currency_code)
    rows = []
    for expense in qs:
        rows.append(_row(
            row_id=f'expense-{expense.id}',
            section='expenses',
            record_type='expense',
            record_type_label='Expense',
            entry_date=expense.expense_date,
            reference_number=f'EXP-{expense.id}',
            description=expense.description or (expense.category.name if expense.category else ''),
            amount=expense.amount,
            amount_base=expense.amount_base,
            currency_code=_ccode(expense.currency),
            contact_name=_customer_name(expense.user),
            status='posted',
            direction='out',
            source_path=f'/expenses/{expense.id}',
        ))
    return rows




def _query_withdrawals(start_date, end_date, currency_code=None):
    from api.models.data.withdrawal import Withdrawal
    from api.services.financial_reports import _filter_by_date_range

    qs = _filter_by_date_range(
        Withdrawal.objects.all(), 'withdrawal_date', start_date, end_date
    ).select_related('gl_account')
    qs = _filter_currency(qs, currency_code)
    rows = []
    for item in qs:
        acct = getattr(item, 'gl_account', None)
        acct_label = (
            f'{acct.code} {acct.name}' if acct else item.get_payment_method_display()
        )
        rows.append(_row(
            row_id=f'withdrawal-{item.id}',
            section='withdrawals',
            record_type='withdrawal',
            record_type_label='Withdrawal',
            entry_date=item.withdrawal_date,
            reference_number=item.reference_number or f'WD-{item.id}',
            description=item.description or f'Owner withdrawal from {acct_label}',
            amount=item.amount,
            amount_base=item.amount_base,
            currency_code=_ccode(item.currency),
            contact_name=acct_label,
            status='posted',
            direction='out',
            source_path=f'/withdrawals/{item.id}',
        ))
    return rows


def _query_payroll(start_date, end_date, currency_code=None, *, advances_only=False):
    qs = _period_advances(start_date, end_date) if advances_only else _period_payroll(start_date, end_date)
    qs = qs.select_related('employee')
    if currency_code:
        from api.models.data.currency import CURRENCY_BY_CODE
        c = CURRENCY_BY_CODE.get(str(currency_code).upper())
        if c:
            qs = qs.filter(currency=c['id'])
        else:
            qs = qs.none()
    section = 'advances' if advances_only else 'payroll'
    label = 'Advance' if advances_only else 'Payroll'
    rows = []
    for record in qs:
        rows.append(_row(
            row_id=f'payroll-{record.id}',
            section=section,
            record_type='advance' if advances_only else 'payroll',
            record_type_label=label,
            entry_date=record.payment_date,
            reference_number=f'PAY-{record.id}',
            description=record.notes or f'{record.month} {record.year}',
            amount=record.amount,
            amount_base=record.amount_base,
            currency_code=_ccode(record.currency),
            contact_name=str(record.employee) if record.employee else '',
            status=record.payroll_type,
            direction='out',
            source_path=f'/payroll/{record.id}',
        ))
    return rows


def _query_payments(start_date, end_date, currency_code=None, *, payment_type):
    qs = (
        _period_sale_payments(start_date, end_date)
        if payment_type == 'sale'
        else _period_purchase_payments(start_date, end_date)
    )
    qs = qs
    qs = _filter_currency(qs, currency_code)
    section = 'sales_payments' if payment_type == 'sale' else 'purchase_payments'
    label = 'Sales Payment' if payment_type == 'sale' else 'Purchase Payment'
    path_prefix = 'sale-payments' if payment_type == 'sale' else 'purchase-payments'
    rows = []
    for payment in qs:
        rows.append(_row(
            row_id=f'payment-{payment.id}',
            section=section,
            record_type='payment',
            record_type_label=label,
            entry_date=payment.payment_date,
            reference_number=payment.reference_number or f'PAY-{payment.id}',
            description=payment.notes,
            amount=payment.amount,
            amount_base=payment.amount_base,
            currency_code=_ccode(payment.currency),
            status=payment.payment_type,
            direction='in' if payment_type == 'sale' else 'out',
            source_path=f'/{path_prefix}/{payment.id}',
        ))
    return rows


def _query_loans(start_date, end_date, currency_code=None, *, loan_type, cash_only=True):
    qs = _period_loans(start_date, end_date).filter(loan_type=loan_type)
    if cash_only:
        qs = qs.filter(is_opening_balance=False, source_payment__isnull=True)
    qs = qs.select_related('customer', 'vendor')
    qs = _filter_currency(qs, currency_code)
    section = 'loans_given' if loan_type == 'loan_out' else 'loans_received'
    if not cash_only:
        section = 'principal_given' if loan_type == 'loan_out' else 'principal_received'
    label = 'Loan Given' if loan_type == 'loan_out' else 'Loan Received'
    if not cash_only:
        label = 'Principal Given' if loan_type == 'loan_out' else 'Principal Received'
    rows = []
    for loan in qs:
        contact = loan.get_loaner_name()
        rows.append(_row(
            row_id=f'loan-{loan.id}',
            section=section,
            record_type='loan',
            record_type_label=label,
            entry_date=loan.loan_date,
            reference_number=loan.bill_number or f'LOAN-{loan.id}',
            description=loan.notes,
            amount=loan.amount,
            amount_base=loan.amount_base,
            currency_code=_ccode(loan.currency),
            contact_name=contact,
            status='paid' if loan.is_paid else 'open',
            # Principal drill-downs are balance metrics, not cash movement.
            # Cash loans still appear under loans_given / loans_received.
            direction='neutral' if not cash_only else (
                'out' if loan_type == 'loan_out' else 'in'
            ),
            source_path=f'/loans/{loan.id}',
            paid_amount=loan.amount_paid,
            remaining_amount=loan.balance_due,
        ))
    return rows


def _query_loan_payments(start_date, end_date, currency_code=None, *, loan_type):
    qs = _period_loan_payments(start_date, end_date).filter(loan__loan_type=loan_type)
    qs = qs.select_related('loan', 'loan__customer', 'loan__vendor')
    if currency_code:
        from api.models.data.currency import CURRENCY_BY_CODE
        c = CURRENCY_BY_CODE.get(str(currency_code).upper())
        if c:
            qs = qs.filter(loan__currency=c['id'])
        else:
            qs = qs.none()
    section = 'loan_collections' if loan_type == 'loan_out' else 'loan_repayments'
    label = 'Loan Collection' if loan_type == 'loan_out' else 'Loan Repayment'
    rows = []
    for payment in qs:
        loan = payment.loan
        rows.append(_row(
            row_id=f'loan-payment-{payment.id}',
            section=section,
            record_type='loan_payment',
            record_type_label=label,
            entry_date=payment.payment_date,
            reference_number=payment.reference_number or f'LP-{payment.id}',
            description=payment.notes or (loan.get_loaner_name() if loan else ''),
            amount=payment.amount,
            amount_base=payment.amount_base or payment.amount,
            currency_code=_ccode(loan.currency) if loan else '',
            contact_name=loan.get_loaner_name() if loan else '',
            status='posted',
            direction='in' if loan_type == 'loan_out' else 'out',
            source_path=f'/loan-payments/{payment.id}/edit',
            bill_number=getattr(payment, 'bill_number', '') or '',
            payment_method=getattr(payment, 'payment_method', '') or '',
            bill_file=str(getattr(payment, 'bill_file', '') or ''),
        ))
    return rows


def _query_accounts_receivable(start_date, end_date, currency_code=None):
    from api.models.data.sales import Sales

    qs = _period_sales(start_date, end_date).select_related('customer')
    qs = _filter_currency(qs, currency_code)
    rows = []
    for sale in qs:
        remaining = _d(sale.total_amount) - _d(sale.paid_amount)
        if remaining <= 0:
            continue
        rows.append(_row(
            row_id=f'sale-{sale.id}',
            section='accounts_receivable',
            record_type='sale',
            record_type_label='Receivable',
            entry_date=sale.sale_date,
            reference_number=sale.invoice_number,
            description=sale.notes,
            amount=remaining,
            amount_base=max(Decimal('0'), _d(sale.total_amount_base) - _d(sale.paid_amount_base)),
            currency_code=_ccode(sale.currency),
            contact_name=_customer_name(sale.customer),
            status=_payment_status(sale.total_amount, sale.paid_amount),
            direction='in',
            source_path=f'/sales/{sale.id}',
            paid_amount=sale.paid_amount,
            remaining_amount=remaining,
        ))
    return rows


def _query_accounts_payable(start_date, end_date, currency_code=None):
    """Outstanding AP on received raw-material purchases in the period."""
    from api.services.financial_reports import _period_purchases

    qs = _period_purchases(start_date, end_date).select_related('vendor')
    qs = _filter_currency(qs, currency_code)
    rows = []
    for purchase in qs:
        remaining = _d(purchase.total_amount) - _d(purchase.paid_amount)
        if remaining <= 0:
            continue
        rows.append(_row(
            row_id=f'ap-purchase-{purchase.id}',
            section='accounts_payable',
            record_type='purchase',
            record_type_label='Payable',
            entry_date=purchase.purchase_date,
            reference_number=purchase.invoice_number or f'RMP-{purchase.id}',
            description=purchase.notes,
            amount=remaining,
            amount_base=max(Decimal('0'), _d(purchase.total_amount_base) - _d(purchase.paid_amount_base)),
            currency_code=_ccode(purchase.currency),
            contact_name=purchase.vendor.name if purchase.vendor_id else '',
            status=_payment_status(purchase.total_amount, purchase.paid_amount),
            direction='out',
            source_path=f'/raw-material-purchases/{purchase.id}',
            paid_amount=purchase.paid_amount,
            remaining_amount=remaining,
        ))
    return rows


def _query_equipment(start_date, end_date, currency_code=None):
    from api.models.data.equipment import Equipment
    from api.services.financial_reports import _filter_by_date_range

    qs = _filter_by_date_range(
        Equipment.objects.all(), 'acquired_date', start_date, end_date,
    )
    qs = _filter_currency(qs, currency_code)
    rows = []
    for item in qs:
        amount = _d(item.quantity) * _d(item.unit_cost)
        if amount <= 0:
            continue
        # Acquisition journals preserve the booked historical AFN amount.
        from django.contrib.contenttypes.models import ContentType
        from django.db.models import Sum
        from api.models.data.journal import JournalLine
        from api.models.data.currency import BASE_CURRENCY_ID
        from api.services.financial_reports import _convert
        from api.services.report_period import parse_report_datetime
        booked = JournalLine.objects.filter(
            journal_entry__content_type=ContentType.objects.get_for_model(item),
            journal_entry__object_id=item.pk,
            journal_entry__reference_number=f'EQ-{item.pk}',
        ).aggregate(total=Sum('base_debit'))['total']
        amount_base = booked if booked is not None else _convert(
            amount, item.currency, BASE_CURRENCY_ID, parse_report_datetime(item.acquired_date),
        )
        acq = getattr(item, 'acquisition_type', None) or 'new_purchase'
        spends_cash = acq in ('new_purchase', 'expense')
        rows.append(_row(
            row_id=f'equipment-{item.id}',
            section='equipment',
            record_type='equipment',
            record_type_label='Equipment',
            entry_date=item.acquired_date,
            reference_number=item.serial_number or f'EQ-{item.id}',
            description=item.notes or item.name,
            amount=amount,
            amount_base=amount_base,
            currency_code=_ccode(item.currency),
            contact_name=item.name,
            status=acq,
            direction='out' if spends_cash else 'neutral',
            source_path=f'/equipment/{item.id}',
        ))
    return rows


def _query_commission_payments(start_date, end_date, currency_code=None):
    from api.models.data.salesman_commission_payment import SalesmanCommissionPayment
    from api.services.financial_reports import _filter_by_date_range

    qs = _filter_by_date_range(
        SalesmanCommissionPayment.objects.select_related('salesman'),
        'payment_date',
        start_date,
        end_date,
    )
    qs = _filter_currency(qs, currency_code)
    rows = []
    for payment in qs:
        rows.append(_row(
            row_id=f'commission-payment-{payment.id}',
            section='commission_payments',
            record_type='commission_payment',
            record_type_label='Commission Payment',
            entry_date=payment.payment_date,
            reference_number=payment.reference_number or f'SCP-{payment.id}',
            description=payment.notes or 'Salesman commission payment',
            amount=payment.amount,
            amount_base=payment.amount_base or payment.amount,
            currency_code=_ccode(payment.currency),
            contact_name=getattr(payment.salesman, 'name', '') or '',
            status=payment.payment_method or 'posted',
            direction='out',
            source_path=f'/salesman-commission-payments/{payment.id}',
        ))
    return rows


def _query_currency_exchanges(start_date, end_date, currency_code=None):
    from django.db.models import Q

    from api.models.data.currency_exchange import CurrencyExchange
    from api.services.financial_reports import _filter_by_date_range

    qs = _filter_by_date_range(
        CurrencyExchange.objects.filter(status=CurrencyExchange.STATUS_POSTED),
        'exchange_date',
        start_date,
        end_date,
    )
    if currency_code:
        from api.models.data.currency import CURRENCY_BY_CODE
        c = CURRENCY_BY_CODE.get(str(currency_code).upper())
        if not c:
            return []
        qs = qs.filter(Q(from_currency=c['id']) | Q(to_currency=c['id']))
    rows = []
    for fx in qs:
        from_code = _ccode(fx.from_currency)
        to_code = _ccode(fx.to_currency)
        rows.append(_row(
            row_id=f'fx-{fx.id}',
            section='currency_exchanges',
            record_type='currency_exchange',
            record_type_label='Currency Exchange',
            entry_date=fx.exchange_date,
            reference_number=fx.reference_number or f'FX-{fx.id}',
            description=(
                fx.notes
                or f'{fx.from_amount} {from_code} → {fx.to_amount} {to_code}'
            ),
            amount=fx.from_amount,
            amount_base=_d(fx.from_amount) * _d(fx.from_exchange_rate or 1),
            currency_code=from_code,
            contact_name=f'{from_code} → {to_code}',
            status=fx.status,
            direction='neutral',
            source_path=f'/currency-exchanges/{fx.id}',
        ))
    return rows


def _query_production(start_date, end_date, currency_code=None):
    """Production runs with material/overhead cost (capitalized into inventory)."""
    from api.models.data.raw_material_process import RawMaterialProcess
    from api.services.financial_reports import _filter_by_date_range

    qs = _filter_by_date_range(
        RawMaterialProcess.objects.exclude(
            status=RawMaterialProcess.STATUS_IN_PROCESS,
        ),
        'process_date',
        start_date,
        end_date,
    )
    if currency_code and str(currency_code).upper() not in ('AFN', '1'):
        from api.models.data.currency import CURRENCY_BY_CODE
        c = CURRENCY_BY_CODE.get(str(currency_code).upper())
        if c and c['id'] != 1:
            return []
    rows = []
    for process in qs:
        total = _d(process.total_cost_afn)
        if total <= 0:
            continue
        rows.append(_row(
            row_id=f'production-{process.id}',
            section='production',
            record_type='production',
            record_type_label='Production',
            entry_date=process.process_date,
            reference_number=process.process_number,
            description=(
                process.notes
                or f'{process.product_name} — {process.output_quantity_kg} kg'
            ),
            amount=total,
            amount_base=total,
            currency_code='AFN',
            contact_name=process.product_name,
            status=process.status,
            direction='neutral',
            source_path=f'/raw-material-process/{process.id}',
        ))
    return rows


def _query_outstanding_loans(start_date, end_date, currency_code=None, *, loan_type):
    """Outstanding principal at end_date for loans originated on/before end_date."""
    from api.models.data.loan import Loan
    from api.models.data.currency import CURRENCY_BY_CODE
    from api.services.loan_reporting import loan_balances_at
    from api.utils.date_filters import normalize_date_to

    end_date = normalize_date_to(end_date)
    qs = Loan.objects.filter(loan_type=loan_type)
    if end_date is not None:
        qs = qs.filter(loan_date__lte=end_date)
    if start_date is not None:
        # Keep loans that still have a balance in the selected window even if
        # they originated earlier — outstanding is a cutoff, not period intake.
        pass
    if currency_code:
        c = CURRENCY_BY_CODE.get(str(currency_code).upper())
        qs = qs.filter(currency=c['id']) if c else qs.none()
    section = 'loans_receivable' if loan_type == 'loan_out' else 'loans_payable'
    label = 'Loan Receivable' if loan_type == 'loan_out' else 'Loan Payable'
    rows = []
    for loan, paid, remaining, remaining_base in loan_balances_at(end_date, queryset=qs):
        if remaining <= 0:
            continue
        amount = remaining_base if not currency_code else remaining
        rows.append(_row(
            row_id=f'loan-{loan.id}',
            section=section,
            record_type='loan',
            record_type_label=label,
            entry_date=loan.loan_date,
            reference_number=loan.bill_number or f'LOAN-{loan.id}',
            description=loan.notes,
            amount=remaining if currency_code else remaining_base,
            amount_base=remaining_base,
            currency_code=_ccode(loan.currency),
            contact_name=loan.get_loaner_name(),
            status='open',
            direction='in' if loan_type == 'loan_out' else 'out',
            source_path=f'/loans/{loan.id}',
            paid_amount=paid,
            remaining_amount=remaining,
        ))
    return rows


def _query_purchase_invoices(start_date, end_date, currency_code=None, *, metric='total'):
    """Purchase invoice drill-downs with payment cutoff at end_date."""
    from api.models.data.purchases import Purchase as RawMaterialPurchase
    from api.services.trade_reporting import invoice_balances
    from api.utils.date_filters import apply_date_range

    qs = apply_date_range(
        RawMaterialPurchase.objects.filter(status='received').exclude(
            status__in=['draft', 'cancelled']
        ),
        'purchase_date', start_date, end_date,
    ).select_related('vendor')
    qs = _filter_currency(qs, currency_code)
    section = f'purchases_invoice_{metric}'
    rows = []
    for invoice, paid, unpaid, paid_base, unpaid_base in invoice_balances(qs, end_date):
        total_base = _d(invoice.total_amount_base)
        if metric == 'paid':
            amount, amount_base = paid, paid_base
        elif metric == 'unpaid':
            amount, amount_base = unpaid, unpaid_base
        else:
            amount, amount_base = _d(invoice.total_amount), total_base
        if amount_base == 0 and amount == 0 and metric != 'total':
            continue
        rows.append(_row(
            row_id=f'purchase-{invoice.id}-{metric}',
            section=section,
            record_type='purchase',
            record_type_label='Purchase Invoice',
            entry_date=invoice.purchase_date,
            reference_number=invoice.invoice_number or f'RMP-{invoice.id}',
            description=invoice.notes or (
                f'Raw material purchase — {invoice.vendor.name}'
                if invoice.vendor_id else 'Raw material purchase'
            ),
            amount=amount,
            amount_base=amount_base,
            currency_code=_ccode(invoice.currency),
            contact_name=invoice.vendor.name if invoice.vendor_id else '',
            status='paid' if unpaid <= 0 else 'unpaid' if paid <= 0 else 'partial',
            direction='neutral',
            source_path=f'/raw-material-purchases/{invoice.id}',
            paid_amount=paid,
            remaining_amount=unpaid,
        ))
    return rows


SECTION_QUERIES = {
    'sales': lambda s, e, c: _query_sales(s, e, c),
    'returns': lambda s, e, c: _query_returns(s, e, c),
    'return_refunds': lambda s, e, c: _query_returns(s, e, c, refunds_only=True),
    'purchases': lambda s, e, c: _query_purchases(s, e, c),
    'purchases_invoice_total': lambda s, e, c: _query_purchase_invoices(s, e, c, metric='total'),
    'purchases_invoice_paid': lambda s, e, c: _query_purchase_invoices(s, e, c, metric='paid'),
    'purchases_invoice_unpaid': lambda s, e, c: _query_purchase_invoices(s, e, c, metric='unpaid'),
    'expenses': lambda s, e, c: _query_expenses(s, e, c),
    'withdrawals': lambda s, e, c: _query_withdrawals(s, e, c),
    'payroll': lambda s, e, c: _query_payroll(s, e, c),
    'advances': lambda s, e, c: _query_payroll(s, e, c, advances_only=True),
    'sales_payments': lambda s, e, c: _query_payments(s, e, c, payment_type='sale'),
    'purchase_payments': lambda s, e, c: _query_payments(s, e, c, payment_type='purchase'),
    'loans_given': lambda s, e, c: _query_loans(s, e, c, loan_type='loan_out', cash_only=True),
    'loans_received': lambda s, e, c: _query_loans(s, e, c, loan_type='loan_in', cash_only=True),
    'principal_given': lambda s, e, c: _query_loans(s, e, c, loan_type='loan_out', cash_only=False),
    'principal_received': lambda s, e, c: _query_loans(s, e, c, loan_type='loan_in', cash_only=False),
    'loan_collections': lambda s, e, c: _query_loan_payments(s, e, c, loan_type='loan_out'),
    'loan_repayments': lambda s, e, c: _query_loan_payments(s, e, c, loan_type='loan_in'),
    'equipment': lambda s, e, c: _query_equipment(s, e, c),
    'commission_payments': lambda s, e, c: _query_commission_payments(s, e, c),
    'currency_exchanges': lambda s, e, c: _query_currency_exchanges(s, e, c),
    'production': lambda s, e, c: _query_production(s, e, c),
    'accounts_receivable': lambda s, e, c: _query_accounts_receivable(s, e, c),
    'accounts_payable': lambda s, e, c: _query_accounts_payable(s, e, c),
    'loans_receivable': lambda s, e, c: _query_outstanding_loans(s, e, c, loan_type='loan_out'),
    'loans_payable': lambda s, e, c: _query_outstanding_loans(s, e, c, loan_type='loan_in'),
}


def _matches_search(row, search):
    if not search:
        return True
    term = search.strip().lower()
    if not term:
        return True
    haystack = ' '.join(
        str(row.get(field) or '')
        for field in (
            'reference_number', 'description', 'contact_name',
            'record_type_label', 'section', 'status', 'currency',
            'bill_number', 'payment_method', 'bill_file',
        )
    ).lower()
    return term in haystack


def build_report_history(
    *,
    start_date,
    end_date,
    sections,
    currency=None,
    search=None,
):
    rows = []
    seen_ids = set()
    for section in sections:
        query_fn = SECTION_QUERIES.get(section)
        if not query_fn:
            continue
        for row in query_fn(start_date, end_date, currency):
            if row['id'] in seen_ids:
                continue
            seen_ids.add(row['id'])
            if _matches_search(row, search):
                rows.append(row)

    rows.sort(key=lambda r: (r['entry_date'], r['id']), reverse=True)

    total_amount = sum(_d(r['amount']) for r in rows)
    total_amount_base = sum(_d(r['amount_base']) for r in rows)
    totals = {
        'amount': float(total_amount),
        'amount_base': float(total_amount_base),
        'record_count': len(rows),
        'cash_in': float(sum(_d(r['amount']) for r in rows if r['direction'] == 'in')),
        'cash_out': float(sum(abs(_d(r['amount'])) for r in rows if r['direction'] == 'out')),
    }
    return rows, totals


def history_meta_title(*, sections, metric=None, breakdown=None):
    if breakdown:
        return breakdown
    if metric:
        return metric.replace('_', ' ').title()
    if len(sections) == 1:
        return SECTION_LABELS.get(sections[0], sections[0])
    return 'Report History'
