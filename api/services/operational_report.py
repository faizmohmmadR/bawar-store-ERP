"""
Operational business performance report (AFN) for supermarket ERP.

Built from sales, purchases, expenses, payroll, loans, stock, and GL —
not from legacy production/packing modules.
"""
from decimal import Decimal

from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS, get_currency
from api.services.financial_reports import (
    _breakdown_entry,
    _d,
    _float,
    _item_revenue_base,
    _period_advances,
    _period_expenses,
    _period_payroll,
    _period_purchase_payments,
    _period_purchases,
    _period_returns,
    _period_sale_payments,
    _period_sales,
    _period_withdrawals,
    _sum_base,
    get_expense_by_category,
    get_top_products,
    _build_base_summary,
)


def _income_by_party(start_date, end_date):
    """AFN revenue grouped by sale party (walk-in / customer / vendor / employee)."""
    from api.models.data.sales import SalesItems

    qs = SalesItems.objects.filter(
        sales__in=_period_sales(start_date, end_date),
    ).select_related('sales', 'sales__customer', 'sales__vendor', 'sales__employee')

    labels = {
        'walk_in': 'Walk-in sales',
        'customer': 'Customer sales',
        'vendor': 'Vendor sales',
        'employee': 'Employee (salary goods)',
    }
    buckets = {key: Decimal('0') for key in labels}
    counts = {key: 0 for key in labels}

    for item in qs.iterator(chunk_size=500):
        sale = item.sales
        if getattr(sale, 'transaction_type', None) == 'free':
            continue
        if sale.employee_id:
            key = 'employee'
        elif sale.vendor_id:
            key = 'vendor'
        elif sale.customer_id:
            key = 'customer'
        else:
            key = 'walk_in'
        buckets[key] += _item_revenue_base(item)
        counts[key] += 1

    rows = []
    for key, amount in buckets.items():
        if amount <= 0 and counts.get(key, 0) == 0:
            continue
        rows.append(_breakdown_entry(labels[key], amount, counts[key]))
    rows.sort(key=lambda r: r['amount'], reverse=True)
    return rows


def _stock_ops_snapshot():
    from api.services.stock_report import get_stock_report

    stock = get_stock_report()
    kpis = stock.get('kpis') or {}
    return {
        'product_balance_count': int(kpis.get('product_balance_count') or 0),
        'total_on_hand': _float(kpis.get('total_on_hand') or 0),
        'total_value_afn': _float(kpis.get('total_value_afn') or 0),
        'low_stock_count': int(kpis.get('low_stock_count') or 0),
    }


def get_operational_report(*, start_date=None, end_date=None, top_limit=10, **kwargs):
    """
    Professional AFN operational report from supermarket section data.

    Semantics:
      - Billed = sales invoices in period (total_amount_base)
      - Collected = settled amount on those invoices as of period end
      - Uncollected (period) = unpaid remainder on those same invoices
      - Expenses / payroll / loans / purchases from their section documents
      - Stock snapshot = current on-hand value (not period-limited)
    """
    from api.services.accounting.reports import (
        REPORT_MODE_BASE,
        get_account_code_balance,
        get_profit_and_loss,
    )
    from api.services.loan_reporting import get_loan_summary
    from api.services.trade_reporting import get_trade_report
    from api.utils.date_filters import apply_date_range

    base = _build_base_summary(start_date, end_date)
    ledger_pl = get_profit_and_loss(
        start_date=start_date,
        end_date=end_date,
        mode=REPORT_MODE_BASE,
    )

    sales_qs = _period_sales(start_date, end_date)
    returns_qs = _period_returns(start_date, end_date)
    expenses_qs = _period_expenses(start_date, end_date)
    payroll_qs = _period_payroll(start_date, end_date)
    advances_qs = _period_advances(start_date, end_date)
    sale_payments_qs = _period_sale_payments(start_date, end_date)
    purchase_payments_qs = _period_purchase_payments(start_date, end_date)
    purchases_qs = _period_purchases(start_date, end_date)
    withdrawals_qs = _period_withdrawals(start_date, end_date)

    trade = get_trade_report(start_date, end_date)
    loan_summary = get_loan_summary(start_date, end_date)
    stock_ops = _stock_ops_snapshot()

    billed = _sum_base(sales_qs, 'total_amount_base')
    returns_total = _sum_base(returns_qs, 'total_amount_base')
    net_billed = billed - returns_total
    customer_cash_received = _sum_base(sale_payments_qs, 'amount_base')
    invoice_cash_received = _sum_base(
        sale_payments_qs.filter(is_advance=False), 'amount_base',
    )
    advances_received = _sum_base(
        sale_payments_qs.filter(is_advance=True), 'amount_base',
    )
    uncollected_period = _d(trade['sales']['unpaid'])
    period_invoice_paid = _d(trade['sales']['paid'])
    collected = period_invoice_paid
    refunds = _sum_base(returns_qs, 'refund_amount_base')

    expense_paid = _sum_base(expenses_qs, 'amount_base')
    payroll_paid = _sum_base(payroll_qs, 'amount_base')
    advances_paid = _sum_base(advances_qs, 'amount_base')
    purchase_paid = _sum_base(purchase_payments_qs, 'amount_base')
    purchases_received = _sum_base(purchases_qs, 'total_amount_base')
    withdrawals_paid = _sum_base(withdrawals_qs, 'amount_base')

    def _as_date(value):
        if value is None:
            return None
        return value.date() if hasattr(value, 'hour') else value

    equipment_paid = Decimal('0')
    equipment_count = 0
    try:
        from api.models.data.equipment import Equipment

        equipment_qs = Equipment.objects.all()
        start_day, end_day = _as_date(start_date), _as_date(end_date)
        if start_day is not None:
            equipment_qs = equipment_qs.filter(acquired_date__gte=start_day)
        if end_day is not None:
            equipment_qs = equipment_qs.filter(acquired_date__lte=end_day)
        equipment_paid = sum(
            (_d(eq.unit_cost) * _d(getattr(eq, 'quantity', 1) or 1) for eq in equipment_qs),
            Decimal('0'),
        )
        equipment_count = equipment_qs.count()
    except Exception:
        equipment_qs = None

    cogs = _d(ledger_pl['cogs'])
    operating_exp_gl = _d(ledger_pl['expenses'])
    revenue_gl = _d(ledger_pl['revenue'])
    gross_profit = _d(ledger_pl['gross_profit'])
    net_profit = _d(ledger_pl['net_income'])

    income_sources = _income_by_party(start_date, end_date)
    expense_by_category = get_expense_by_category(
        start_date=start_date, end_date=end_date,
    )
    top_products = get_top_products(
        start_date=start_date, end_date=end_date, limit=top_limit,
    )

    paid_operating = expense_paid
    paid_operating_with_payroll = (
        expense_paid + payroll_paid + advances_paid + refunds + withdrawals_paid
    )
    cash_out_total = (
        _d(base.get('total_cash_out', 0)) + equipment_paid
    )

    base_meta = get_currency(BASE_CURRENCY_ID) or CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]
    period_invoice_total = _d(trade['sales']['total'])
    collection_rate = (
        (period_invoice_paid / period_invoice_total * Decimal('100'))
        if period_invoice_total > 0 else Decimal('0')
    )

    income_section = {
        'billed_afn': _float(billed),
        'returns_afn': _float(returns_total),
        'net_billed_afn': _float(net_billed),
        'accrual_revenue_afn': _float(revenue_gl),
        'collected_afn': _float(collected),
        'uncollected_period_afn': _float(uncollected_period),
        'customer_cash_received_afn': _float(customer_cash_received),
        'invoice_cash_received_afn': _float(invoice_cash_received),
        'advances_received_afn': _float(advances_received),
        'accounts_receivable_outstanding_afn': base.get('accounts_receivable', 0),
        'collection_rate_pct': _float(collection_rate),
        'sources': income_sources,
        'collection_breakdown': [
            _breakdown_entry(
                'Settled on period invoices',
                collected,
                trade['sales'].get('paid_count', 0) + trade['sales'].get('partial_count', 0),
            ),
            _breakdown_entry(
                'Uncollected (period invoices)',
                uncollected_period,
                trade['sales'].get('unpaid_count', 0),
            ),
            _breakdown_entry(
                'Customer cash received (period)',
                customer_cash_received,
                sale_payments_qs.count(),
            ),
            _breakdown_entry(
                'Invoice cash payments',
                invoice_cash_received,
                sale_payments_qs.filter(is_advance=False).count(),
            ),
            _breakdown_entry(
                'Customer advances received',
                advances_received,
                sale_payments_qs.filter(is_advance=True).count(),
            ),
        ],
        'billed_breakdown': [
            _breakdown_entry('Sales invoices', billed, sales_qs.count()),
            _breakdown_entry(
                'Returns',
                -returns_total if returns_total else Decimal('0'),
                returns_qs.count(),
            ),
        ],
    }

    expense_section = {
        'cogs_afn': _float(cogs),
        'operating_expenses_gl_afn': _float(operating_exp_gl),
        'total_pnl_costs_afn': _float(cogs + operating_exp_gl),
        'expenses_paid_afn': _float(expense_paid),
        'payroll_paid_afn': _float(payroll_paid),
        'advances_paid_afn': _float(advances_paid),
        'refunds_paid_afn': _float(refunds),
        'withdrawals_paid_afn': _float(withdrawals_paid),
        'purchase_payments_afn': _float(purchase_paid),
        'total_cash_out_operating_afn': _float(paid_operating),
        'by_category': expense_by_category,
        'cash_breakdown': [
            _breakdown_entry('Operating expenses', expense_paid, expenses_qs.count()),
            _breakdown_entry('Payroll', payroll_paid, payroll_qs.count()),
            _breakdown_entry('Advances', advances_paid, advances_qs.count()),
            _breakdown_entry(
                'Return refunds',
                refunds,
                returns_qs.filter(refund_amount__gt=0).count(),
            ),
            _breakdown_entry('Withdrawals', withdrawals_paid, withdrawals_qs.count()),
            _breakdown_entry('Purchase payments', purchase_paid, purchase_payments_qs.count()),
        ],
        'other_cash_breakdown': [
            _breakdown_entry('Withdrawals', withdrawals_paid, withdrawals_qs.count()),
            _breakdown_entry('Equipment', equipment_paid, equipment_count),
        ],
        'pnl_breakdown': [
            _breakdown_entry('COGS', cogs, 0),
            _breakdown_entry('Operating expenses (GL)', operating_exp_gl, 0),
            *[
                {'type': row['name'], 'amount': row['amount'], 'count': row['count']}
                for row in expense_by_category
            ],
        ],
    }

    operations_section = {
        'purchases_received_afn': _float(purchases_received),
        'purchase_payments_afn': _float(purchase_paid),
        'purchases_unpaid_afn': _float(trade['purchases']['unpaid']),
        'accounts_payable_outstanding_afn': base.get('accounts_payable', 0),
        'stock': stock_ops,
        'payroll_paid_afn': _float(payroll_paid),
        'advances_paid_afn': _float(advances_paid),
        'expenses_paid_afn': _float(expense_paid),
    }

    profit_section = {
        'revenue_afn': _float(revenue_gl),
        'cogs_afn': _float(cogs),
        'gross_profit_afn': _float(gross_profit),
        'operating_expenses_afn': _float(operating_exp_gl),
        'net_profit_afn': _float(net_profit),
        'bridge': [
            {'label': 'Revenue', 'amount': _float(revenue_gl)},
            {'label': 'COGS', 'amount': _float(-cogs)},
            {'label': 'Gross Profit', 'amount': _float(gross_profit)},
            {'label': 'Operating Expenses', 'amount': _float(-operating_exp_gl)},
            {'label': 'Net Profit', 'amount': _float(net_profit)},
        ],
    }

    cash_section = {
        'cash_in_afn': base.get('total_cash_in', 0),
        'cash_out_afn': _float(cash_out_total),
        'net_cash_flow_afn': _float(_d(base.get('total_cash_in', 0)) - cash_out_total),
        'cash_balance_afn': base.get('cash_balance', 0),
        'in_breakdown': base.get('cash_in_breakdown', []),
        'out_breakdown': [
            *base.get('cash_out_breakdown', []),
            *([_breakdown_entry('Equipment', equipment_paid, equipment_count)]
              if equipment_paid else []),
        ],
    }

    def _activity(key, label, amount, *, count=0, kind='neutral', group='operations'):
        return {
            'key': key,
            'label': label,
            'amount_afn': _float(amount),
            'count': int(count or 0),
            'kind': kind,  # income | expense | profit | financing | neutral
            'group': group,
        }

    loans_received = _d(loan_summary.get('loans_received', 0))
    loans_given = _d(loan_summary.get('loans_given', 0))
    loan_collections = _d(loan_summary.get('loan_collections', 0))
    loan_repayments = _d(loan_summary.get('loan_repayments', 0))
    cash_in = _d(base.get('total_cash_in', 0))
    net_cash = cash_in - cash_out_total

    sales_count = sales_qs.count()
    returns_count = returns_qs.count()
    purchases_count = purchases_qs.count()
    purchase_pay_count = purchase_payments_qs.count()
    expenses_count = expenses_qs.count()
    payroll_count = payroll_qs.count()
    advances_count = advances_qs.count()
    withdrawals_count = withdrawals_qs.count()
    settled_count = (
        trade['sales'].get('paid_count', 0) + trade['sales'].get('partial_count', 0)
    )
    unpaid_count = trade['sales'].get('unpaid_count', 0)

    # Period activity: reporting summary of amounts that occurred in the range.
    # Reuses values/counts already loaded above (no extra heavy queries).
    activity_rows = [
        _activity(
            'sales_billed', 'Sales billed', billed,
            count=sales_count, kind='income', group='sales',
        ),
        _activity(
            'sales_returns', 'Sales returns', returns_total,
            count=returns_count, kind='expense', group='sales',
        ),
        _activity(
            'sales_net', 'Net sales', net_billed,
            count=sales_count, kind='income', group='sales',
        ),
        _activity(
            'sales_collected', 'Collected on period invoices', collected,
            count=settled_count, kind='income', group='sales',
        ),
        _activity(
            'sales_uncollected', 'Uncollected (period invoices)', uncollected_period,
            count=unpaid_count, kind='neutral', group='sales',
        ),
        _activity(
            'purchases_received', 'Purchases received', purchases_received,
            count=purchases_count, kind='expense', group='purchases',
        ),
        _activity(
            'purchase_payments', 'Purchase payments', purchase_paid,
            count=purchase_pay_count, kind='expense', group='purchases',
        ),
        _activity(
            'expenses_paid', 'Operating expenses paid', expense_paid,
            count=expenses_count, kind='expense', group='expenses',
        ),
        _activity(
            'payroll_paid', 'Payroll paid', payroll_paid,
            count=payroll_count, kind='expense', group='hr',
        ),
        _activity(
            'advances_paid', 'Employee advances', advances_paid,
            count=advances_count, kind='expense', group='hr',
        ),
        _activity(
            'loans_received', 'Loans received', loans_received,
            kind='financing', group='loans',
        ),
        _activity(
            'loans_given', 'Loans given', loans_given,
            kind='financing', group='loans',
        ),
        _activity(
            'loan_collections', 'Loan collections', loan_collections,
            kind='financing', group='loans',
        ),
        _activity(
            'loan_repayments', 'Loan repayments', loan_repayments,
            kind='financing', group='loans',
        ),
        _activity(
            'withdrawals', 'Owner withdrawals', withdrawals_paid,
            count=withdrawals_count, kind='expense', group='finance',
        ),
        _activity(
            'equipment', 'Equipment acquired', equipment_paid,
            count=equipment_count, kind='expense', group='finance',
        ),
        _activity(
            'gross_profit', 'Gross profit', gross_profit,
            kind='profit', group='profit',
        ),
        _activity(
            'net_profit', 'Net profit', net_profit,
            kind='profit', group='profit',
        ),
        _activity(
            'cash_in', 'Cash in', cash_in,
            kind='income', group='cash',
        ),
        _activity(
            'cash_out', 'Cash out', cash_out_total,
            kind='expense', group='cash',
        ),
        _activity(
            'net_cash_flow', 'Net cash flow', net_cash,
            kind='profit' if net_cash >= 0 else 'expense', group='cash',
        ),
    ]

    # Current position (not period activity) — keep separate so the UI does not confuse users.
    cash_gl = get_account_code_balance(
        '1000', start_date=None, end_date=end_date, mode=REPORT_MODE_BASE,
    )
    bank_gl = get_account_code_balance(
        '1050', start_date=None, end_date=end_date, mode=REPORT_MODE_BASE,
    )
    sarafi_gl = get_account_code_balance(
        '1060', start_date=None, end_date=end_date, mode=REPORT_MODE_BASE,
    )
    # Cash Register (دخل) and AFN Cash GL 1000 are the same money position.
    cash_register_afn = cash_gl

    activity = {
        'currency': base_meta.get('code', 'AFN'),
        'rows': activity_rows,
        'totals': {
            'sales_net_afn': _float(net_billed),
            'purchases_afn': _float(purchases_received),
            'expenses_afn': _float(expense_paid + payroll_paid + advances_paid),
            'gross_profit_afn': _float(gross_profit),
            'net_profit_afn': _float(net_profit),
            'net_cash_flow_afn': _float(net_cash),
        },
        'balances': {
            # Alias kept for older clients; always equals cash_afn.
            'safe_drawer_afn': _float(cash_register_afn),
            'cash_register_afn': _float(cash_register_afn),
            'cash_afn': _float(cash_gl),
            'bank_afn': _float(bank_gl),
            'sarafi_afn': _float(sarafi_gl),
            'liquid_total_afn': _float(cash_gl + bank_gl + sarafi_gl),
        },
        'notes': [
            'Period activity = amounts dated in the selected range only.',
            'Cash Register (دخل) balance is AFN Cash (GL 1000). Bank is separate.',
        ],
    }

    return {
        'report_type': 'operational',
        'currency': base_meta.get('code', 'AFN'),
        'currency_symbol': base_meta.get('symbol', '؋'),
        'base_currency': {
            'id': BASE_CURRENCY_ID,
            'code': base_meta.get('code', 'AFN'),
            'symbol': base_meta.get('symbol', '؋'),
            'name': base_meta.get('name', 'Afghani'),
        },
        'activity': activity,
        'kpis': {
            'net_billed_afn': _float(net_billed),
            'collected_afn': _float(collected),
            'uncollected_period_afn': _float(uncollected_period),
            'customer_cash_received_afn': _float(customer_cash_received),
            'gross_profit_afn': _float(gross_profit),
            'net_profit_afn': _float(net_profit),
            'expenses_paid_afn': _float(paid_operating_with_payroll),
            'payroll_paid_afn': _float(payroll_paid),
            'purchases_received_afn': _float(purchases_received),
            'stock_value_afn': stock_ops['total_value_afn'],
            'stock_on_hand': stock_ops['total_on_hand'],
            'cash_balance_afn': base.get('cash_balance', 0),
            'accounts_receivable_afn': base.get('accounts_receivable', 0),
            'accounts_payable_afn': base.get('accounts_payable', 0),
            'accrual_revenue': _float(revenue_gl),
            'sales_invoices': _float(billed),
            'returns': _float(returns_total),
            'cash_from_sales': _float(customer_cash_received),
            'credit_sales': _float(uncollected_period),
            'total_purchases': _float(purchases_received),
            'cogs': _float(cogs),
            'gross_profit': _float(gross_profit),
            'operating_expenses': _float(operating_exp_gl),
            'total_expenses': _float(cogs + operating_exp_gl),
            'net_profit': _float(net_profit),
            'total_cash_in': base.get('total_cash_in', 0),
            'total_cash_out': _float(cash_out_total),
            'net_cash_flow': _float(_d(base.get('total_cash_in', 0)) - cash_out_total),
            'cash_balance': base.get('cash_balance', 0),
            'accounts_receivable': base.get('accounts_receivable', 0),
            'accounts_payable': base.get('accounts_payable', 0),
        },
        'income': income_section,
        'expenses': expense_section,
        'operations': operations_section,
        'profit': profit_section,
        'cash': cash_section,
        'trade': trade,
        'financing': {
            'loans_received': loan_summary.get('loans_received', 0),
            'loans_given': loan_summary.get('loans_given', 0),
            'principal_received': loan_summary.get('principal_received', 0),
            'principal_given': loan_summary.get('principal_given', 0),
            'noncash_received': loan_summary.get('noncash_received', 0),
            'noncash_given': loan_summary.get('noncash_given', 0),
            'loan_collections': loan_summary.get('loan_collections', 0),
            'loan_repayments': loan_summary.get('loan_repayments', 0),
            'loans_receivable': loan_summary.get('loans_receivable', 0),
            'loans_payable': loan_summary.get('loans_payable', 0),
            'loan_breakdown': base.get('loan_breakdown', []),
            'note': (
                'Loans are financing — not sales income or operating profit. '
                'Cash loans exclude opening-balance and intermediary principal.'
            ),
        },
        'top_products': top_products,
        'income_breakdown': income_section['billed_breakdown'],
        'collection_breakdown': income_section['collection_breakdown'],
        'expense_breakdown': [
            e for e in expense_section['pnl_breakdown'] if _d(e.get('amount', 0)) != 0
        ],
        'expense_by_category': expense_by_category,
        'profit_bridge': profit_section['bridge'],
        'cash_in_breakdown': cash_section['in_breakdown'],
        'cash_out_breakdown': cash_section['out_breakdown'],
        'notes': [
            'All amounts are in AFN (reporting base).',
            'Built from Sales, Purchases, Stock, Expenses, HR/Payroll, and Loans.',
            'Collected = settled amount on sales invoices dated in this period (as of period end).',
            'Uncollected (period) = unpaid balance on those same invoices; Collected + Uncollected = Net billed.',
            'Stock on-hand / value is a current warehouse snapshot (not period-limited).',
            'AR outstanding = full accounts receivable balance at period end (GL).',
            'Expenses paid (KPI) includes expenses, payroll, advances, refunds, and withdrawals.',
        ],
    }
