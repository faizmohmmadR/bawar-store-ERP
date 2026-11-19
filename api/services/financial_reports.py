"""Unified financial overview for dashboard and reports."""

from decimal import Decimal

from django.db.models import Sum

from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS, CURRENCY_BY_CODE, get_currency
from api.models.data.expenses import Expense
from api.models.data.journal import JournalLine
from api.models.data.loan import Loan, LoanPayment
from api.models.data.payment import Payment
from api.models.data.payroll import Payroll
from api.models.data.returns import Return
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.sales import Sales
from api.utils.currency import convert_currency

SKIP_SALE_STATUSES = {'draft', 'cancelled'}
SKIP_PURCHASE_STATUSES = {'draft', 'cancelled', 'pending'}
SALE_CASH_STATUSES = {'confirmed', 'shipped', 'delivered', 'invoiced'}
PURCHASE_CASH_STATUSES = {'received'}


def _d(value):
    return Decimal(str(value or 0))


def _float(value):
    return float(_d(value))


def _convert(amount, from_currency_id, to_currency_id, date=None):
    if not amount or not from_currency_id or not to_currency_id:
        return _d(amount)
    if int(from_currency_id) == int(to_currency_id):
        return _d(amount)
    return convert_currency(_d(amount), from_currency_id, to_currency_id, date)


def _gl_account_balance(base_code, currency_id, *, end_date=None, category='asset'):
    """
    Net balance for a GL account by bare code + currency id.

    Currency-specific accounts (Cash/Bank/Sarafi) use native line amounts.
    Shared chart accounts use AFN base_* when viewing AFN, native lines when
    viewing a foreign currency book.
    """
    from api.constants.gl_roles import is_currency_specific_gl_code
    from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS
    from api.models.data.journal import GLAccount

    currency_id = int(
        currency_id) if currency_id is not None else BASE_CURRENCY_ID
    qs = GLAccount.objects.filter(code=base_code, is_active=True)

    if is_currency_specific_gl_code(base_code):
        qs = qs.filter(currency=currency_id)
        account = qs.first()
    else:
        account = qs.filter(currency=BASE_CURRENCY_ID).first() or qs.first()

    if not account:
        legacy_code = f'{base_code}-{CURRENCY_DEFINITIONS.get(currency_id, {}).get("code", "")}'
        account = GLAccount.objects.filter(
            code=legacy_code, is_active=True).first()
    if account:
        category = account.category

    lines = JournalLine.objects.filter(
        gl_account=account) if account else JournalLine.objects.none()
    if end_date:
        lines = lines.filter(journal_entry__entry_date__lte=end_date)

    if account and is_currency_specific_gl_code(account.code):
        lines = lines.filter(currency=currency_id)
        agg = lines.aggregate(total_debit=Sum('debit'),
                              total_credit=Sum('credit'))
    elif currency_id == BASE_CURRENCY_ID:
        agg = lines.aggregate(total_debit=Sum(
            'base_debit'), total_credit=Sum('base_credit'))
    else:
        lines = lines.filter(currency=currency_id)
        agg = lines.aggregate(total_debit=Sum('debit'),
                              total_credit=Sum('credit'))

    debit = _d(agg['total_debit'])
    credit = _d(agg['total_credit'])
    if category in ('liability', 'equity', 'revenue'):
        return credit - debit
    return debit - credit


def _consolidated_gl_balance(base_code, target_currency_id, *, end_date=None, category='asset'):
    """Sum GL balances across currencies, converted to target."""
    total = Decimal('0')
    for cid in CURRENCY_DEFINITIONS:
        balance = _gl_account_balance(
            base_code, cid, end_date=end_date, category=category
        )
        if balance:
            total += _convert(balance, cid, target_currency_id, end_date)
    return total


def _consolidated_contact_balances(target_currency_id, *, contact_type):
    """Sum customer receivables or vendor payables with per-currency conversion."""
    from api.models.data.customers import Customer
    from api.models.data.vendors import Vendor
    from api.services.contact_ledger import get_customer_finance, get_vendor_finance

    total = Decimal('0')
    if contact_type == 'customer':
        contacts = Customer.objects.all()
        get_finance = get_customer_finance
    else:
        contacts = Vendor.objects.all()
        get_finance = get_vendor_finance

    for contact in contacts:
        finance = get_finance(contact)
        for code, bucket in finance.items():
            if code == 'overall':
                continue
            c = CURRENCY_BY_CODE.get(code.upper())
            if not c:
                continue
            balance = _d(bucket['balance'])
            if balance <= 0:
                continue
            total += _convert(balance, c['id'], target_currency_id)

    return total


def _filter_by_date_range(qs, field_name, start_date, end_date):
    from api.utils.date_filters import apply_date_range
    return apply_date_range(qs, field_name, start_date, end_date)


def _period_sales(start_date, end_date):
    return _filter_by_date_range(
        Sales.objects.exclude(status__in=SKIP_SALE_STATUSES).exclude(vendor_transaction='purchase_return'),
        'sale_date',
        start_date,
        end_date,
    )


def _period_purchases(start_date, end_date):
    """Received raw-material purchases (AP / inventory intake)."""
    return _filter_by_date_range(
        RawMaterialPurchase.objects.filter(status='received'),
        'purchase_date',
        start_date,
        end_date,
    )


def _period_returns(start_date, end_date):
    return _filter_by_date_range(Return.objects.all(), 'return_date', start_date, end_date)


def _period_expenses(start_date, end_date):
    return _filter_by_date_range(Expense.objects.all(), 'expense_date', start_date, end_date)


def _period_payroll(start_date, end_date):
    return _filter_by_date_range(
        Payroll.objects.filter(payroll_type='salary'),
        'payment_date',
        start_date,
        end_date,
    )


def _period_advances(start_date, end_date):
    return _filter_by_date_range(
        Payroll.objects.filter(payroll_type='advance'),
        'payment_date',
        start_date,
        end_date,
    )


def _period_sale_payments(start_date, end_date):
    return _filter_by_date_range(
        Payment.objects.filter(payment_type='sale', is_credit_application=False),
        'payment_date',
        start_date,
        end_date,
    )


def _period_purchase_payments(start_date, end_date):
    return _filter_by_date_range(
        Payment.objects.filter(payment_type='purchase', is_credit_application=False, general_payment__source_sale__isnull=True),
        'payment_date',
        start_date,
        end_date,
    )


def _period_loans(start_date, end_date):
    return _filter_by_date_range(Loan.objects.all(), 'loan_date', start_date, end_date)


def _period_loan_payments(start_date, end_date):
    return _filter_by_date_range(LoanPayment.objects.all(), 'payment_date', start_date, end_date)


def _period_withdrawals(start_date, end_date):
    from api.models.data.withdrawal import Withdrawal

    return _filter_by_date_range(
        Withdrawal.objects.all(), 'withdrawal_date', start_date, end_date
    )


def _sum_remaining_base(qs, total_field, paid_field):
    """Sum unpaid remainder in base currency for sales/purchases in a period."""
    total = Decimal('0')
    for row in qs.only(total_field, paid_field):
        remaining = max(_d(getattr(row, total_field)) -
                        _d(getattr(row, paid_field)), Decimal('0'))
        if remaining > 0:
            total += remaining
    return total


def _sum_remaining_native(qs, total_field, paid_field):
    total = Decimal('0')
    for row in qs.only(total_field, paid_field):
        remaining = max(_d(getattr(row, total_field)) -
                        _d(getattr(row, paid_field)), Decimal('0'))
        if remaining > 0:
            total += remaining
    return total


def _period_receivable_base(start_date, end_date):
    """Unpaid sales balance for transactions in the selected period."""
    return _sum_remaining_base(
        _period_sales(start_date, end_date).filter(vendor__isnull=True),
        'total_amount_base',
        'paid_amount_base',
    )


def _period_payable_base(start_date, end_date):
    """Unpaid purchase balance for transactions in the selected period."""
    return _sum_remaining_base(
        _period_purchases(start_date, end_date),
        'total_amount_base',
        'paid_amount_base',
    )


def _period_loans_outstanding_base(start_date, end_date, loan_type):
    """Outstanding principal on loans originated in the selected period."""
    return _sum_remaining_base(
        _period_loans(start_date, end_date).filter(loan_type=loan_type),
        'amount_base',
        'amount_paid_base',
    )


def _period_receivable_native(start_date, end_date, currency):
    return _sum_remaining_native(
        _period_sales(start_date, end_date).filter(currency=currency, vendor__isnull=True),
        'total_amount',
        'paid_amount',
    )


def _period_payable_native(start_date, end_date, currency):
    return _sum_remaining_native(
        _period_purchases(start_date, end_date).filter(currency=currency),
        'total_amount',
        'paid_amount',
    )


def _period_loans_outstanding_native(start_date, end_date, currency, loan_type):
    return _sum_remaining_native(
        _period_loans(start_date, end_date).filter(
            currency=currency, loan_type=loan_type),
        'amount',
        'amount_paid',
    )


def _loan_outstanding_at(currency, end_date, loan_type):
    """Outstanding principal by loan type, using amount_paid on each loan."""
    qs = Loan.objects.filter(currency=currency, loan_type=loan_type)
    if end_date:
        qs = qs.filter(loan_date__lte=end_date)
    outstanding = Decimal('0')
    for loan in qs:
        outstanding += max(_d(loan.amount) -
                           _d(loan.amount_paid), Decimal('0'))
    return outstanding


def _breakdown_entry(label, amount, count):
    return {'type': label, 'amount': _float(amount), 'count': count}


def _contact_balance_for_currency(currency_code, *, contact_type):
    """Sum receivable/payable for one currency from contact ledger."""
    from api.models.data.customers import Customer
    from api.models.data.vendors import Vendor
    from api.services.contact_ledger import get_customer_finance, get_vendor_finance

    total = Decimal('0')
    key = str(currency_code or '').upper()
    contacts = Customer.objects.all() if contact_type == 'customer' else Vendor.objects.all()
    get_finance = get_customer_finance if contact_type == 'customer' else get_vendor_finance

    for contact in contacts:
        finance = get_finance(contact)
        bucket = finance.get(key) or finance.get(key.lower())
        if not bucket:
            continue
        balance = _d(bucket['balance'])
        if balance > 0:
            total += balance
    return total


def _sum_base(qs, field):
    """Sum a *_base amount column (already in reporting base currency)."""
    return _d(qs.aggregate(t=Sum(field))['t'])


def _build_base_summary(start_date, end_date):
    """Consolidated report in reporting base currency — uses stored *_base fields."""
    from api.services.report_period import parse_report_datetime, validate_report_range
    start_date, end_date = validate_report_range(parse_report_datetime(start_date), parse_report_datetime(end_date, end=True))
    sales = _period_sales(start_date, end_date)
    purchases = _period_purchases(start_date, end_date)
    returns = _period_returns(start_date, end_date)
    expenses = _period_expenses(start_date, end_date)
    payroll = _period_payroll(start_date, end_date)
    advances = _period_advances(start_date, end_date)
    sale_payments = _period_sale_payments(start_date, end_date)
    purchase_payments = _period_purchase_payments(start_date, end_date)
    period_loans = _period_loans(start_date, end_date)
    period_loan_payments = _period_loan_payments(start_date, end_date)

    loans_given = period_loans.filter(
        loan_type='loan_out', is_opening_balance=False, source_payment__isnull=True,
    )
    loans_received = period_loans.filter(
        loan_type='loan_in', is_opening_balance=False, source_payment__isnull=True,
    )
    collections_on_given = period_loan_payments.filter(
        loan__loan_type='loan_out')
    repayments_on_received = period_loan_payments.filter(
        loan__loan_type='loan_in')

    from api.services.loan_reporting import get_loan_summary
    loan_summary = get_loan_summary(start_date, end_date)
    loans_given_total = _d(loan_summary['loans_given'])
    loans_received_total = _d(loan_summary['loans_received'])
    loan_collections_total = _d(loan_summary['loan_collections'])
    loan_repayments_total = _d(loan_summary['loan_repayments'])
    loans_receivable = _d(loan_summary['loans_receivable'])
    loans_payable = _d(loan_summary['loans_payable'])

    revenue = _sum_base(sales, 'total_amount_base')
    purchase_total = _sum_base(purchases, 'total_amount_base')
    returns_total = _sum_base(returns, 'total_amount_base')
    expense_total = _sum_base(expenses, 'amount_base')
    payroll_total = _sum_base(payroll, 'amount_base')
    advance_total = _sum_base(advances, 'amount_base')
    sales_payments_total = _sum_base(sale_payments, 'amount_base')
    purchase_payments_total = _sum_base(purchase_payments, 'amount_base')
    return_refunds_total = _sum_base(returns, 'refund_amount_base')

    withdrawals = _period_withdrawals(start_date, end_date)
    withdrawal_total = _sum_base(withdrawals, 'amount_base')

    net_revenue = revenue - returns_total
    gross_profit = net_revenue - purchase_total

    cash_from_sales = sales_payments_total
    credit_sales = _period_receivable_base(start_date, end_date)

    total_cash_in = cash_from_sales + loans_received_total + loan_collections_total
    total_cash_out = (
        purchase_payments_total + expense_total + payroll_total + advance_total
        + return_refunds_total + loans_given_total + loan_repayments_total + withdrawal_total
    )
    net_cash_flow = total_cash_in - total_cash_out

    base_code = CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]['code']

    accounts_receivable = _period_receivable_base(start_date, end_date)
    accounts_payable = _period_payable_base(start_date, end_date)
    cash_balance = net_cash_flow

    from api.services.accounting.reports import (
        REPORT_MODE_BASE,
        get_account_code_balance,
        get_profit_and_loss,
    )

    ledger_pl = get_profit_and_loss(
        start_date=start_date,
        end_date=end_date,
        mode=REPORT_MODE_BASE,
    )
    ledger_ar = get_account_code_balance(
        '1200', start_date=None, end_date=end_date, mode=REPORT_MODE_BASE,
    )
    ledger_ap = get_account_code_balance(
        '2000', start_date=None, end_date=end_date, mode=REPORT_MODE_BASE,
    )
    ledger_cash = (
        get_account_code_balance(
            '1000', start_date=None, end_date=end_date, mode=REPORT_MODE_BASE,
        )
        + get_account_code_balance(
            '1050', start_date=None, end_date=end_date, mode=REPORT_MODE_BASE,
        )
        + get_account_code_balance(
            '1060', start_date=None, end_date=end_date, mode=REPORT_MODE_BASE,
        )
    )

    return {
        'total_revenue': _float(ledger_pl['revenue']),
        'total_returns': _float(returns_total),
        'total_income': _float(ledger_pl['revenue']),
        'cash_from_sales': _float(cash_from_sales),
        'credit_sales': _float(credit_sales),
        'total_purchases': _float(purchase_total),
        'gross_profit': _float(ledger_pl['gross_profit']),
        'operating_expenses': _float(ledger_pl['expenses']),
        'total_payroll': _float(payroll_total),
        'total_advances': _float(advance_total),
        'total_expenses': _float(ledger_pl['expenses'] + ledger_pl['cogs']),
        'net_profit': _float(ledger_pl['net_income']),
        'total_cash_in': _float(total_cash_in),
        'total_cash_out': _float(total_cash_out),
        'net_cash_flow': _float(net_cash_flow),
        'cash_balance': _float(ledger_cash),
        'accounts_receivable': _float(ledger_ar),
        'accounts_payable': _float(ledger_ap),
        'loans_receivable': _float(loans_receivable),
        'loans_payable': _float(loans_payable),
        'loans_given': _float(loans_given_total),
        'loans_received': _float(loans_received_total),
        'loan_collections': _float(loan_collections_total),
        'loan_repayments': _float(loan_repayments_total),
        'loan_summary': loan_summary,
        'base_currency_code': base_code,
        'cash_in_breakdown': [
            _breakdown_entry('Sales Payments',
                             sales_payments_total, sale_payments.count()),
            _breakdown_entry('Loans Received',
                             loans_received_total, loans_received.count()),
            _breakdown_entry(
                'Loan Collections', loan_collections_total, collections_on_given.count()),
        ],
        'cash_out_breakdown': [
            _breakdown_entry(
                'Purchase Payments', purchase_payments_total, purchase_payments.count()),
            _breakdown_entry('Expenses', expense_total, expenses.count()),
            _breakdown_entry('Payroll', payroll_total, payroll.count()),
            _breakdown_entry('Advances', advance_total, advances.count()),
            _breakdown_entry('Return Refunds', return_refunds_total,
                             returns.filter(refund_amount__gt=0).count()),
            _breakdown_entry('Withdrawals', withdrawal_total,
                             withdrawals.count()),
            _breakdown_entry('Loans Given', loans_given_total,
                             loans_given.count()),
            _breakdown_entry(
                'Loan Repayments', loan_repayments_total, repayments_on_received.count()),
        ],
        'expense_breakdown': [
            _breakdown_entry('COGS', ledger_pl['cogs'], 0),
            _breakdown_entry('Operating Expenses',
                             expense_total, expenses.count()),
            _breakdown_entry('Payroll', payroll_total, payroll.count()),
            _breakdown_entry('Advances (cash, not P&L)',
                             advance_total, advances.count()),
        ],
        'loan_breakdown': [
            _breakdown_entry('Loans Given', loans_given_total,
                             loans_given.count()),
            _breakdown_entry('Loans Received',
                             loans_received_total, loans_received.count()),
            _breakdown_entry('Collections (Loan Out)',
                             loan_collections_total, collections_on_given.count()),
            _breakdown_entry(
                'Repayments (Loan In)', loan_repayments_total, repayments_on_received.count()),
        ],
        'sales_total': _float(revenue),
        'cogs': _float(ledger_pl['cogs']),
    }


def _loan_outstanding_base(end_date, loan_type):
    """Outstanding loan principal in base currency."""
    qs = Loan.objects.filter(loan_type=loan_type)
    if end_date:
        qs = qs.filter(loan_date__lte=end_date)
    outstanding = Decimal('0')
    for loan in qs:
        outstanding += max(_d(loan.amount_base) -
                           _d(loan.amount_paid_base), Decimal('0'))
    return outstanding


def _build_currencies_report(start_date, end_date):
    """Full per-currency report — no cross-currency conversion."""
    from api.services.report_period import parse_report_datetime, validate_report_range
    start_date, end_date = validate_report_range(parse_report_datetime(start_date), parse_report_datetime(end_date, end=True))
    snapshot = {}
    for cid, cdef in CURRENCY_DEFINITIONS.items():
        code = cdef['code']
        sales = _period_sales(start_date, end_date).filter(currency=cid)
        purchases = _period_purchases(
            start_date, end_date).filter(currency=cid)
        returns = _period_returns(start_date, end_date).filter(currency=cid)
        expenses = _period_expenses(start_date, end_date).filter(currency=cid)
        payroll = _period_payroll(start_date, end_date).filter(currency=cid)
        advances = _period_advances(start_date, end_date).filter(currency=cid)
        sale_payments = _period_sale_payments(
            start_date, end_date).filter(currency=cid)
        purchase_payments = _period_purchase_payments(
            start_date, end_date).filter(currency=cid)
        period_loans = _period_loans(start_date, end_date).filter(currency=cid)
        period_loan_payments = _period_loan_payments(
            start_date, end_date).filter(loan__currency=cid)

        loans_given = period_loans.filter(
            loan_type='loan_out', is_opening_balance=False, source_payment__isnull=True,
        )
        loans_received = period_loans.filter(
            loan_type='loan_in', is_opening_balance=False, source_payment__isnull=True,
        )
        collections_on_given = period_loan_payments.filter(
            loan__loan_type='loan_out')
        repayments_on_received = period_loan_payments.filter(
            loan__loan_type='loan_in')

        from api.services.loan_reporting import get_loan_summary
        from api.services.trade_reporting import get_trade_report
        loan_summary = get_loan_summary(start_date, end_date, currency=cid)
        trade = get_trade_report(start_date, end_date, currency=cid)
        loans_given_total = _d(loan_summary['loans_given'])
        loans_received_total = _d(loan_summary['loans_received'])
        loan_collections_total = _d(loan_summary['loan_collections'])
        loan_repayments_total = _d(loan_summary['loan_repayments'])
        loans_receivable = _d(loan_summary['loans_receivable'])
        loans_payable = _d(loan_summary['loans_payable'])

        revenue = _d(sales.aggregate(t=Sum('total_amount'))['t'])
        purchase_total = _d(purchases.aggregate(t=Sum('total_amount'))['t'])
        returns_total = _d(returns.aggregate(t=Sum('total_amount'))['t'])
        expense_total = _d(expenses.aggregate(t=Sum('amount'))['t'])
        payroll_total = _d(payroll.aggregate(t=Sum('amount'))['t'])
        advance_total = _d(advances.aggregate(t=Sum('amount'))['t'])
        sales_payments_total = _d(
            sale_payments.aggregate(t=Sum('amount'))['t'])
        purchase_payments_total = _d(
            purchase_payments.aggregate(t=Sum('amount'))['t'])
        return_refunds_total = _d(
            returns.aggregate(t=Sum('refund_amount'))['t']
        )

        withdrawals = _period_withdrawals(
            start_date, end_date).filter(currency=cid)
        withdrawal_total = _d(withdrawals.aggregate(t=Sum('amount'))['t'])

        net_revenue = revenue - returns_total

        cash_from_sales = sales_payments_total
        credit_sales = _period_receivable_native(start_date, end_date, cid)

        total_cash_in = cash_from_sales + loans_received_total + loan_collections_total
        total_cash_out = (
            purchase_payments_total + expense_total + payroll_total + advance_total
            + return_refunds_total + loans_given_total + loan_repayments_total + withdrawal_total
        )
        net_cash_flow = total_cash_in - total_cash_out

        accounts_receivable = _period_receivable_native(
            start_date, end_date, cid)
        accounts_payable = _period_payable_native(start_date, end_date, cid)

        # Profit uses ledger COGS (not purchases). Cash balance is cash/bank/sarafi
        # position through end_date — not period cash flow.
        from api.services.accounting.reports import (
            REPORT_MODE_NATIVE,
            get_account_code_balance,
            get_profit_and_loss,
        )
        ledger_pl = get_profit_and_loss(
            start_date=start_date,
            end_date=end_date,
            currency_id=cid,
            mode=REPORT_MODE_NATIVE,
        )
        cogs_total = _d(ledger_pl['cogs'])
        operating_expenses_gl = _d(ledger_pl['expenses'])
        gross_profit = _d(ledger_pl['gross_profit'])
        net_profit = _d(ledger_pl['net_income'])
        total_expenses = cogs_total + operating_expenses_gl
        cash_balance = (
            get_account_code_balance(
                '1000', start_date=None, end_date=end_date,
                currency_id=cid, mode=REPORT_MODE_NATIVE,
            )
            + get_account_code_balance(
                '1050', start_date=None, end_date=end_date,
                currency_id=cid, mode=REPORT_MODE_NATIVE,
            )
            + get_account_code_balance(
                '1060', start_date=None, end_date=end_date,
                currency_id=cid, mode=REPORT_MODE_NATIVE,
            )
        )

        snapshot[code] = {
            'currency_id': cid,
            'symbol': cdef['symbol'],
            'name': cdef['name'],
            'total_revenue': _float(ledger_pl['revenue'] if ledger_pl['revenue'] else revenue),
            'total_returns': _float(returns_total),
            'total_income': _float(ledger_pl['revenue'] if ledger_pl['revenue'] else net_revenue),
            'cash_from_sales': _float(cash_from_sales),
            'credit_sales': _float(credit_sales),
            'total_purchases': _float(purchase_total),
            'cogs': _float(cogs_total),
            'gross_profit': _float(gross_profit),
            'operating_expenses': _float(operating_expenses_gl if operating_expenses_gl else expense_total),
            'total_payroll': _float(payroll_total),
            'total_advances': _float(advance_total),
            'total_expenses': _float(total_expenses),
            'net_profit': _float(net_profit),
            'total_cash_in': _float(total_cash_in),
            'total_cash_out': _float(total_cash_out),
            'net_cash_flow': _float(net_cash_flow),
            'cash_balance': _float(cash_balance),
            'accounts_receivable': _float(accounts_receivable),
            'accounts_payable': _float(accounts_payable),
            'loans_receivable': _float(loans_receivable),
            'loans_payable': _float(loans_payable),
            'loans_given': _float(loans_given_total),
            'loans_received': _float(loans_received_total),
            'loan_collections': _float(loan_collections_total),
            'loan_repayments': _float(loan_repayments_total),
            'loan_summary': loan_summary,
            'trade': trade,
            'cash_in_breakdown': [
                _breakdown_entry('Sales Payments',
                                 sales_payments_total, sale_payments.count()),
                _breakdown_entry('Loans Received',
                                 loans_received_total, loans_received.count()),
                _breakdown_entry(
                    'Loan Collections', loan_collections_total, collections_on_given.count()),
            ],
            'cash_out_breakdown': [
                _breakdown_entry(
                    'Purchase Payments', purchase_payments_total, purchase_payments.count()),
                _breakdown_entry('Expenses', expense_total, expenses.count()),
                _breakdown_entry('Payroll', payroll_total, payroll.count()),
                _breakdown_entry('Advances', advance_total, advances.count()),
                _breakdown_entry('Return Refunds', return_refunds_total, returns.filter(
                    refund_amount__gt=0).count()),
                _breakdown_entry(
                    'Withdrawals', withdrawal_total, withdrawals.count()),
                _breakdown_entry(
                    'Loans Given', loans_given_total, loans_given.count()),
                _breakdown_entry(
                    'Loan Repayments', loan_repayments_total, repayments_on_received.count()),
            ],
            'loan_breakdown': [
                _breakdown_entry(
                    'Loans Given', loans_given_total, loans_given.count()),
                _breakdown_entry('Loans Received',
                                 loans_received_total, loans_received.count()),
                _breakdown_entry(
                    'Collections (Loan Out)', loan_collections_total, collections_on_given.count()),
                _breakdown_entry(
                    'Repayments (Loan In)', loan_repayments_total, repayments_on_received.count()),
            ],
            'expense_breakdown': [
                _breakdown_entry('COGS', cogs_total, 0),
                _breakdown_entry('Operating Expenses',
                                 operating_expenses_gl if operating_expenses_gl else expense_total,
                                 expenses.count()),
                _breakdown_entry('Payroll', payroll_total, payroll.count()),
                _breakdown_entry('Advances', advance_total, advances.count()),
                _breakdown_entry('Purchases (inventory intake)', purchase_total,
                                 purchases.count()),
            ],
        }
    return snapshot


def _currency_row_has_activity(row):
    """True if a per-currency row has non-zero activity in the selected period."""
    keys = (
        'total_revenue', 'total_returns', 'total_income', 'cash_from_sales', 'credit_sales',
        'total_purchases', 'cogs', 'gross_profit',
        'operating_expenses', 'total_payroll', 'total_advances', 'total_expenses',
        'net_profit', 'total_cash_in', 'total_cash_out', 'net_cash_flow', 'cash_balance',
        'accounts_receivable', 'accounts_payable', 'loans_receivable', 'loans_payable',
        'loans_given', 'loans_received', 'loan_collections', 'loan_repayments',
    )
    return any(abs(row.get(k, 0) or 0) > 0.001 for k in keys)


def get_base_currency_report(*, start_date, end_date):
    """
    Consolidated report in the system base currency (AFN).
    All transactional amounts use stored *_base fields — no runtime conversion.
    """
    from api.services.accounting.reports import (
        REPORT_MODE_BASE,
        get_account_code_balance,
        get_profit_and_loss,
    )

    base = CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]
    summary = _build_base_summary(start_date, end_date)
    return {
        'report_type': 'base',
        'base_currency': {
            'id': BASE_CURRENCY_ID,
            'code': base['code'],
            'symbol': base['symbol'],
            'name': base['name'],
        },
        'currency': base['code'],
        'currency_symbol': base['symbol'],
        'summary': summary,
        'cash_in_breakdown': summary.get('cash_in_breakdown', []),
        'cash_out_breakdown': summary.get('cash_out_breakdown', []),
        'expense_breakdown': summary.get('expense_breakdown', []),
        'loan_breakdown': summary.get('loan_breakdown', []),
    }


def get_by_currency_report(*, start_date, end_date):
    """
    Per-currency report — native amounts only, no cross-currency conversion.
    Only currencies with activity in the period are included.
    """
    raw = _build_currencies_report(start_date, end_date)
    by_currency = {
        code: row for code, row in raw.items() if _currency_row_has_activity(row)
    }
    # Sort by net income descending for clearer presentation
    sorted_codes = sorted(
        by_currency.keys(),
        key=lambda c: by_currency[c].get('total_income', 0),
        reverse=True,
    )
    return {
        'report_type': 'by_currency',
        'by_currency': by_currency,
        'currency_codes': sorted_codes,
        'currency_count': len(by_currency),
    }


def _item_revenue_base(item) -> Decimal:
    """Convert a sale line total to AFN using the parent sale's stored base ratio."""
    from api.utils.packaging import sales_item_line_total

    sale = item.sales
    line_native = sales_item_line_total(item)
    if line_native <= 0:
        return Decimal('0')

    sale_total = _d(getattr(sale, 'total_amount', 0))
    sale_base = _d(getattr(sale, 'total_amount_base', 0))
    if sale_total > 0 and sale_base > 0:
        return (line_native * (sale_base / sale_total)).quantize(Decimal('0.0001'))

    rate = _d(getattr(sale, 'exchange_rate', 1) or 1)
    return (line_native * rate).quantize(Decimal('0.0001'))


def _item_cogs_base(item) -> Decimal:
    from api.utils.packaging import sales_item_pieces

    if item.sale_source == 'raw_material':
        from api.services.raw_material_sales import raw_stock_quantity
        pieces = raw_stock_quantity(item)
    else:
        pieces = sales_item_pieces(item)
    unit_cost = _d(getattr(item, 'unit_cost', 0))
    if pieces <= 0 or unit_cost <= 0:
        return Decimal('0')

    # unit_cost is snapshotted in AFN (base); do not apply the sale FX rate again.
    return (pieces * unit_cost).quantize(Decimal('0.0001'))


def get_top_products(*, start_date=None, end_date=None, limit=10):
    """Top sold products in period by quantity (pieces), with AFN revenue."""
    from api.models.data.sales import SalesItems
    from api.utils.packaging import sales_item_pieces

    qs = SalesItems.objects.filter(
        sales__in=_period_sales(start_date, end_date),
    ).select_related('stock__product', 'sales')

    buckets = {}
    for item in qs.iterator(chunk_size=500):
        product = getattr(getattr(item, 'stock', None), 'product', None)
        if not product:
            continue
        pid = product.id
        bucket = buckets.get(pid)
        if bucket is None:
            bucket = {
                'product_id': pid,
                'name': product.name or '—',
                'barcode': getattr(product, 'barcode', '') or '',
                'quantity_pieces': Decimal('0'),
                'revenue_base': Decimal('0'),
                'cogs_base': Decimal('0'),
                'line_count': 0,
            }
            buckets[pid] = bucket
        bucket['quantity_pieces'] += sales_item_pieces(item)
        bucket['revenue_base'] += _item_revenue_base(item)
        bucket['cogs_base'] += _item_cogs_base(item)
        bucket['line_count'] += 1

    ranked = sorted(
        buckets.values(),
        key=lambda row: (row['quantity_pieces'], row['revenue_base']),
        reverse=True,
    )[: max(1, min(int(limit or 10), 50))]

    return [
        {
            'product_id': row['product_id'],
            'name': row['name'],
            'barcode': row['barcode'],
            'quantity_pieces': _float(row['quantity_pieces']),
            'revenue_base': _float(row['revenue_base']),
            'cogs_base': _float(row['cogs_base']),
            'gross_profit_base': _float(row['revenue_base'] - row['cogs_base']),
            'line_count': row['line_count'],
        }
        for row in ranked
    ]


def get_products_sold_by_month(*, start_date=None, end_date=None, limit_per_month=10):
    """
    Calendar months → top-sold products.

    For a single calendar year in the period, always returns all 12 months
    (empty months included). Quantity is pieces (1 carton = 8); revenue is AFN.
    """
    from calendar import month_name

    from api.models.data.sales import SalesItems
    from api.utils.packaging import PIECES_PER_CARTON, sales_item_pieces

    limit = max(1, min(int(limit_per_month or 10), 50))

    def _month_slots():
        from django.db.models import Min, Max
        from api.services.report_period import get_report_timezone, parse_report_datetime
        start = parse_report_datetime(start_date)
        end = parse_report_datetime(end_date, end=True)
        if start is None or end is None:
            bounds = _period_sales(start, end).aggregate(first=Min('sale_date'), last=Max('sale_date'))
            start = start or bounds['first']
            end = end or bounds['last']
        if start is None or end is None:
            return []
        start = start.astimezone(get_report_timezone()).date()
        end = end.astimezone(get_report_timezone()).date()
        if start.year == end.year:
            return [(start.year, m) for m in range(1, 13)]
        slots = []
        y, m = start.year, start.month
        while (y, m) <= (end.year, end.month):
            slots.append((y, m))
            if m == 12:
                y, m = y + 1, 1
            else:
                m += 1
        return slots

    def _rank_products(products):
        ranked = sorted(
            products,
            key=lambda p: (_d(p['quantity_pieces']), _d(p['revenue_base'])),
            reverse=True,
        )
        top = ranked[:limit]
        total_cartons = sum((_d(p['cartons']) for p in ranked), Decimal('0'))
        total_pieces = sum((_d(p['quantity_pieces'])
                           for p in ranked), Decimal('0'))
        total_revenue = sum((_d(p['revenue_base'])
                            for p in ranked), Decimal('0'))
        return {
            'product_count': len(ranked),
            'top_product': top[0] if top else None,
            'total_cartons': _float(total_cartons),
            'total_pieces': _float(total_pieces),
            'total_revenue_base': _float(total_revenue),
            'products': top,
            '_all_products': ranked,
        }

    def _merge_products(product_lists, *, limit_n):
        merged = {}
        for products in product_lists:
            for p in products or []:
                pid = p.get('product_id')
                if pid is None:
                    continue
                bucket = merged.get(pid)
                if bucket is None:
                    bucket = {
                        'product_id': pid,
                        'name': p.get('name') or '—',
                        'barcode': p.get('barcode') or '',
                        'quantity_pieces': Decimal('0'),
                        'revenue_base': Decimal('0'),
                        'line_count': 0,
                    }
                    merged[pid] = bucket
                bucket['quantity_pieces'] += _d(p.get('quantity_pieces'))
                bucket['revenue_base'] += _d(p.get('revenue_base'))
                bucket['line_count'] += int(p.get('line_count') or 0)
        ranked = sorted(
            merged.values(),
            key=lambda row: (row['quantity_pieces'], row['revenue_base']),
            reverse=True,
        )[:limit_n]
        out = []
        for row in ranked:
            cartons = (
                (row['quantity_pieces'] /
                 PIECES_PER_CARTON).quantize(Decimal('0.0001'))
                if row['quantity_pieces'] > 0
                else Decimal('0')
            )
            out.append(
                {
                    'product_id': row['product_id'],
                    'name': row['name'],
                    'barcode': row['barcode'],
                    'quantity_pieces': _float(row['quantity_pieces']),
                    'cartons': _float(cartons),
                    'revenue_base': _float(row['revenue_base']),
                    'line_count': row['line_count'],
                }
            )
        return out

    def _month_block(month_product_map, slots):
        months = []
        all_products = []
        for year, month in slots:
            products = month_product_map.get((year, month), [])
            ranked = _rank_products(products)
            all_products.append(ranked.pop('_all_products'))
            months.append(
                {
                    'year': year,
                    'month': month,
                    'month_label': month_name[month].lower(),
                    **ranked,
                }
            )
        top_products = _merge_products(all_products, limit_n=limit)
        return {
            'months': months,
            'totals': {
                'month_count': len(slots),
                'months_with_sales': sum(1 for m in months if m['product_count'] > 0),
                'total_cartons': _float(
                    sum((_d(m['total_cartons']) for m in months), Decimal('0'))
                ),
                'total_pieces': _float(
                    sum((_d(m['total_pieces']) for m in months), Decimal('0'))
                ),
                'total_revenue_base': _float(
                    sum((_d(m['total_revenue_base'])
                        for m in months), Decimal('0'))
                ),
                'top_product': top_products[0] if top_products else None,
            },
            'top_products': top_products,
        }

    slots = _month_slots()
    if not slots:
        return {
            'currency': 'AFN',
            'year': None,
            'months': [],
            'totals': {
                'month_count': 0,
                'total_cartons': 0.0,
                'total_pieces': 0.0,
                'total_revenue_base': 0.0,
            },
            'limit_per_month': limit,
        }

    qs = SalesItems.objects.filter(
        sales__in=_period_sales(start_date, end_date),
    ).select_related('stock__product', 'sales')

    month_product_map = {}
    slot_set = set(slots)

    for item in qs.iterator(chunk_size=500):
        sale = getattr(item, 'sales', None)
        product = getattr(getattr(item, 'stock', None), 'product', None)
        if not sale or not product or not getattr(sale, 'sale_date', None):
            continue

        from api.services.report_period import get_report_timezone
        dt = sale.sale_date.astimezone(get_report_timezone())
        year = dt.year
        month = dt.month
        if (year, month) not in slot_set:
            continue

        plist = month_product_map.setdefault((year, month), {})
        pid = product.id
        row = plist.get(pid)
        if row is None:
            row = {
                'product_id': pid,
                'name': product.name or '—',
                'barcode': getattr(product, 'barcode', '') or '',
                'quantity_pieces': Decimal('0'),
                'revenue_base': Decimal('0'),
                'line_count': 0,
            }
            plist[pid] = row
        row['quantity_pieces'] += sales_item_pieces(item)
        row['revenue_base'] += _item_revenue_base(item)
        row['line_count'] += 1

    # Convert product dicts to float rows with cartons
    converted_map = {}
    for key, products in month_product_map.items():
        rows = []
        for row in products.values():
            cartons = (
                (row['quantity_pieces'] /
                 PIECES_PER_CARTON).quantize(Decimal('0.0001'))
                if row['quantity_pieces'] > 0
                else Decimal('0')
            )
            rows.append(
                {
                    'product_id': row['product_id'],
                    'name': row['name'],
                    'barcode': row['barcode'],
                    'quantity_pieces': _float(row['quantity_pieces']),
                    'cartons': _float(cartons),
                    'revenue_base': _float(row['revenue_base']),
                    'line_count': row['line_count'],
                }
            )
        converted_map[key] = rows

    months_block = _month_block(converted_map, slots)
    grand_cartons = _d(months_block['totals']['total_cartons'])
    grand_pieces = _d(months_block['totals']['total_pieces'])
    grand_revenue = _d(months_block['totals']['total_revenue_base'])

    year = slots[0][0] if len({y for y, _ in slots}) == 1 else None
    return {
        'currency': 'AFN',
        'year': year,
        'month_slots': [
            {'year': y, 'month': m, 'month_label': month_name[m].lower()}
            for y, m in slots
        ],
        'months': months_block,
        'totals': {
            'month_count': len(slots),
            'total_cartons': _float(grand_cartons),
            'total_pieces': _float(grand_pieces),
            'total_revenue_base': _float(grand_revenue),
        },
        'limit_per_month': limit,
    }


def get_expense_by_category(*, start_date=None, end_date=None):
    """Operating expenses rolled up by ExpenseCategory (AFN base)."""
    from django.db.models import Count

    expenses = _period_expenses(start_date, end_date)
    rows = (
        expenses.values('category_id', 'category__name')
        .annotate(total=Sum('amount_base'), count=Count('id'))
        .order_by('-total')
    )
    return [
        {
            'category_id': row['category_id'],
            'name': row['category__name'] or 'Uncategorized',
            'amount': _float(row['total']),
            'count': row['count'],
        }
        for row in rows
        if _d(row['total']) > 0
    ]


def get_management_report(*, start_date=None, end_date=None, top_limit=10):
    """
    Professional AFN management/operational report.

    Delegates to operational_report for a single accurate source of truth
    (income sources, collected/uncollected, expenses, production, packing).
    """
    from api.services.operational_report import get_operational_report

    return get_operational_report(
        start_date=start_date,
        end_date=end_date,
        top_limit=top_limit,
    )


def _company_ops_counts(*, start_date=None, end_date=None):
    """Customer count + period sales count for the company."""
    from api.models.data.customers import Customer

    customers_qs = Customer.objects.filter(is_active=True)
    sales_qs = _period_sales(start_date, end_date)
    return {
        'customer_count': customers_qs.count(),
        'sales_count': sales_qs.count(),
    }


def _sum_kpis(rows: list[dict]) -> dict:
    """Sum numeric KPI fields across rows."""
    keys = [
        'accrual_revenue',
        'sales_invoices',
        'returns',
        'cash_from_sales',
        'credit_sales',
        'cogs',
        'gross_profit',
        'operating_expenses',
        'total_expenses',
        'net_profit',
        'total_cash_in',
        'total_cash_out',
        'net_cash_flow',
        'cash_balance',
        'accounts_receivable',
        'accounts_payable',
        'customer_count',
        'sales_count',
    ]
    totals = {k: 0.0 for k in keys}
    for row in rows:
        kpis = row.get('kpis') or {}
        for k in keys:
            totals[k] += float(kpis.get(k) or 0)
    return totals


def _merge_breakdowns(rows: list[dict], field: str) -> list[dict]:
    """Merge named breakdown rows by type/name."""
    buckets: dict[str, dict] = {}
    for row in rows:
        for item in row.get(field) or []:
            key = item.get('type') or item.get('name') or '—'
            bucket = buckets.get(key)
            if bucket is None:
                bucket = {'type': key, 'amount': 0.0, 'count': 0}
                buckets[key] = bucket
            bucket['amount'] += float(item.get('amount') or 0)
            bucket['count'] += int(item.get('count') or 0)
    return sorted(buckets.values(), key=lambda x: x['amount'], reverse=True)


def _merge_top_products(rows: list[dict], limit: int = 10) -> list[dict]:
    buckets: dict[int, dict] = {}
    for row in rows:
        for item in row.get('top_products') or []:
            pid = item.get('product_id')
            if pid is None:
                continue
            bucket = buckets.get(pid)
            if bucket is None:
                bucket = {
                    'product_id': pid,
                    'name': item.get('name') or '—',
                    'barcode': item.get('barcode') or '',
                    'quantity_pieces': 0.0,
                    'revenue_base': 0.0,
                    'cogs_base': 0.0,
                    'gross_profit_base': 0.0,
                    'line_count': 0,
                }
                buckets[pid] = bucket
            bucket['quantity_pieces'] += float(
                item.get('quantity_pieces') or 0)
            bucket['revenue_base'] += float(item.get('revenue_base') or 0)
            bucket['cogs_base'] += float(item.get('cogs_base') or 0)
            bucket['gross_profit_base'] += float(
                item.get('gross_profit_base') or 0)
            bucket['line_count'] += int(item.get('line_count') or 0)
    ranked = sorted(
        buckets.values(),
        key=lambda r: (r['quantity_pieces'], r['revenue_base']),
        reverse=True,
    )
    return ranked[: max(1, min(int(limit or 10), 50))]


def _build_owner_row(*, start_date=None, end_date=None, top_limit=8):
    """Full owner KPI + breakdowns for the company."""
    report = get_management_report(
        start_date=start_date,
        end_date=end_date,
        top_limit=top_limit,
    )
    counts = _company_ops_counts(
        start_date=start_date,
        end_date=end_date,
    )
    kpis = dict(report.get('kpis') or {})
    kpis.update(counts)
    return {
        'kpis': kpis,
        'expense_breakdown': report.get('expense_breakdown') or [],
        'expense_by_category': report.get('expense_by_category') or [],
        'collection_breakdown': report.get('collection_breakdown') or [],
        'income_breakdown': report.get('income_breakdown') or [],
        'profit_bridge': report.get('profit_bridge') or [],
        'cash_in_breakdown': report.get('cash_in_breakdown') or [],
        'cash_out_breakdown': report.get('cash_out_breakdown') or [],
        'financing': report.get('financing') or {},
        'top_products': report.get('top_products') or [],
    }


def get_owner_detail(*, start_date=None, end_date=None, top_limit=10):
    """Owner detail report for the company."""
    from api.models.data.currency import get_currency

    row = _build_owner_row(
        start_date=start_date,
        end_date=end_date,
        top_limit=top_limit,
    )
    base_meta = get_currency(
        BASE_CURRENCY_ID) or CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]
    return {
        'report_type': 'owner_detail',
        'currency': base_meta.get('code', 'AFN'),
        'currency_symbol': base_meta.get('symbol', '؋'),
        'base_currency': {
            'id': BASE_CURRENCY_ID,
            'code': base_meta.get('code', 'AFN'),
            'symbol': base_meta.get('symbol', '؋'),
            'name': base_meta.get('name', 'Afghani'),
        },
        'company': row,
    }


def get_owner_report(*, start_date=None, end_date=None, top_limit=5):
    """
    Owner / super-admin report: company-wide KPIs + totals.
    """
    from api.models.data.currency import get_currency

    row = _build_owner_row(
        start_date=start_date,
        end_date=end_date,
        top_limit=top_limit,
    )

    base_meta = get_currency(
        BASE_CURRENCY_ID) or CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]

    return {
        'report_type': 'owner_report',
        'currency': base_meta.get('code', 'AFN'),
        'currency_symbol': base_meta.get('symbol', '؋'),
        'base_currency': {
            'id': BASE_CURRENCY_ID,
            'code': base_meta.get('code', 'AFN'),
            'symbol': base_meta.get('symbol', '؋'),
            'name': base_meta.get('name', 'Afghani'),
        },
        'company_totals': {
            'kpis': row['kpis'],
            'expense_breakdown': row['expense_breakdown'],
            'collection_breakdown': row['collection_breakdown'],
            'income_breakdown': row['income_breakdown'],
            'top_products': row['top_products'],
        },
    }
