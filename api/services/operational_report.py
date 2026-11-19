"""
Operational business performance report (AFN).

Single clean AFN view covering:
  - Income billed, sources, collected vs uncollected
  - Expenses (cash + P&L) with category breakdown
  - Production & packing volumes and AFN costs
  - Purchases, cash flow, financing, profit snapshot
"""
from decimal import Decimal

from django.db.models import Count, Sum

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
    _period_payable_base,
    _period_receivable_base,
    _period_returns,
    _period_sale_payments,
    _period_sales,
    _period_withdrawals,
    _sum_base,
    get_expense_by_category,
    get_top_products,
    _build_base_summary,
)


SOURCE_LABELS = {
    'stock': 'Packed stock sales',
    'tank': 'Tank fill sales',
    'raw_material': 'Raw material sales',
}


def _qty_row(*, label, quantity=0, unit='', amount_afn=0, count=0, extra=None):
    row = {
        'label': label,
        'quantity': _float(quantity),
        'unit': unit,
        'amount_afn': _float(amount_afn),
        'count': int(count or 0),
    }
    if extra:
        row.update(extra)
    return row


def _income_by_source(start_date, end_date):
    """AFN revenue by SalesItems.sale_source for period sales."""
    from api.models.data.sales import SalesItems

    qs = SalesItems.objects.filter(
        sales__in=_period_sales(start_date, end_date),
    ).select_related('sales')

    labels = dict(SOURCE_LABELS)
    buckets = {key: Decimal('0') for key in labels}
    counts = {key: 0 for key in labels}
    for item in qs.iterator(chunk_size=500):
        source = item.sale_source or 'stock'
        if source not in buckets:
            buckets[source] = Decimal('0')
            counts[source] = 0
            labels[source] = source.replace('_', ' ').title()
        buckets[source] += _item_revenue_base(item)
        counts[source] += 1

    rows = []
    for key, amount in buckets.items():
        if amount <= 0 and counts.get(key, 0) == 0:
            continue
        rows.append(_breakdown_entry(labels.get(key, key), amount, counts.get(key, 0)))
    rows.sort(key=lambda r: r['amount'], reverse=True)
    return rows


def _production_stats(start_date, end_date):
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
    agg = qs.aggregate(
        runs=Count('id'),
        liters=Sum('output_quantity_liters'),
        kg=Sum('output_quantity_kg'),
        materials_kg=Sum('materials_quantity_kg'), chemistry_kg=Sum('chemistry_quantity_kg'),
        water_kg=Sum('water_quantity_kg'), input_kg=Sum('total_input_quantity_kg'),
        material_cost=Sum('material_cost_afn'),
        extra_expense=Sum('extra_expense_afn'),
        total_cost=Sum('total_cost_afn'),
    )
    return {
        'runs': int(agg['runs'] or 0),
        'output_liters': _float(agg['liters']),
        'output_kg': _float(agg['kg']),
        'materials_kg': _float(agg['materials_kg']), 'chemistry_kg': _float(agg['chemistry_kg']),
        'water_kg': _float(agg['water_kg']), 'total_input_kg': _float(agg['input_kg']),
        'material_cost_afn': _float(agg['material_cost']),
        'extra_expense_afn': _float(agg['extra_expense']),
        'total_cost_afn': _float(agg['total_cost']),
        'rows': [
            _qty_row(
                label='Production output',
                quantity=agg['kg'] or 0,
                unit='kg',
                amount_afn=agg['total_cost'] or 0,
                count=agg['runs'] or 0,
                extra={'kg': _float(agg['kg'])},
            ),
        ],
    }


def _packing_stats(start_date, end_date):
    from api.models.data.packing import PackingRun
    from api.services.financial_reports import _filter_by_date_range

    qs = _filter_by_date_range(
        PackingRun.objects.all(),
        'created_at',
        start_date,
        end_date,
    )
    agg = qs.aggregate(
        runs=Count('id'),
        liters=Sum('quantity_liters'),
        kg=Sum('quantity_kg'),
        bottles=Sum('bottle_count'),
        liquid_cost=Sum('liquid_cost_afn'),
        packaging_cost=Sum('packaging_cost_afn'),
        total_cost=Sum('total_cost_afn'),
    )
    return {
        'runs': int(agg['runs'] or 0),
        'quantity_liters': _float(agg['liters']),
        'quantity_kg': _float(agg['kg']),
        'bottle_count': int(agg['bottles'] or 0),
        'liquid_cost_afn': _float(agg['liquid_cost']),
        'packaging_cost_afn': _float(agg['packaging_cost']),
        'total_cost_afn': _float(agg['total_cost']),
        'rows': [
            _qty_row(
                label='Packed finished goods',
                quantity=agg['bottles'] or 0,
                unit='bottles',
                amount_afn=agg['total_cost'] or 0,
                count=agg['runs'] or 0,
                extra={
                    'liters': _float(agg['liters']),
                    'kg': _float(agg['kg']),
                },
            ),
        ],
    }


def get_operational_report(*, start_date=None, end_date=None, top_limit=10):
    """
    Professional AFN operational report.

    Semantics (documented in payload.notes):
      - Billed income = sales invoices in period (total_amount_base)
      - Collected = settled amount on those invoices as of period end
        (payments/credit applications dated on or before end_date)
      - Uncollected (period) = unpaid remainder on those same invoices
        so Collected + Uncollected = Net billed
      - Customer cash received = sale cash in the period (invoice payments +
        advances); this is cash-flow, not invoice settlement
      - AR outstanding = GL accounts receivable balance at period end
      - Expenses paid = cash operating outflows (expense docs, payroll, …)
      - P&L expenses/COGS = accrual from journals
    """
    from api.services.accounting.reports import REPORT_MODE_BASE, get_profit_and_loss

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

    from api.services.trade_reporting import get_trade_report
    from api.services.loan_reporting import get_loan_summary

    trade = get_trade_report(start_date, end_date)
    loan_summary = get_loan_summary(start_date, end_date)

    billed = _sum_base(sales_qs, 'total_amount_base')
    returns_total = _sum_base(returns_qs, 'total_amount_base')
    net_billed = billed - returns_total
    # Cash received in the period (invoice allocations + customer advances).
    customer_cash_received = _sum_base(sale_payments_qs, 'amount_base')
    invoice_cash_received = _sum_base(
        sale_payments_qs.filter(is_advance=False), 'amount_base',
    )
    advances_received = _sum_base(
        sale_payments_qs.filter(is_advance=True), 'amount_base',
    )
    # Unpaid/settled on period invoices must use payments as-of end_date (trade),
    # not denormalized paid_amount (misses credit applications) and not
    # payment-date cash (mixes advances and other invoices).
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

    from api.models.data.salesman_commission_payment import SalesmanCommissionPayment
    from api.models.data.equipment import Equipment
    from api.utils.date_filters import apply_date_range

    commission_qs = apply_date_range(
        SalesmanCommissionPayment.objects.all(), 'payment_date', start_date, end_date,
    )
    commission_paid = _sum_base(commission_qs, 'amount_base')

    def _as_date(value):
        if value is None:
            return None
        return value.date() if hasattr(value, 'hour') else value

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

    cogs = _d(ledger_pl['cogs'])
    operating_exp_gl = _d(ledger_pl['expenses'])
    revenue_gl = _d(ledger_pl['revenue'])
    gross_profit = _d(ledger_pl['gross_profit'])
    net_profit = _d(ledger_pl['net_income'])

    income_sources = _income_by_source(start_date, end_date)
    expense_by_category = get_expense_by_category(
        start_date=start_date, end_date=end_date,
    )
    production = _production_stats(start_date, end_date)
    packing = _packing_stats(start_date, end_date)
    top_products = get_top_products(
        start_date=start_date, end_date=end_date, limit=top_limit,
    )

    # Operating cash: expenses + commissions (withdrawals/equipment are "other").
    paid_operating = expense_paid + commission_paid
    paid_operating_with_payroll = (
        expense_paid + payroll_paid + advances_paid + refunds + withdrawals_paid + commission_paid
    )
    cash_out_total = (
        _d(base.get('total_cash_out', 0)) + commission_paid + equipment_paid
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
            _breakdown_entry('Settled on period invoices', collected, trade['sales'].get('paid_count', 0) + trade['sales'].get('partial_count', 0)),
            _breakdown_entry('Uncollected (period invoices)', uncollected_period, trade['sales'].get('unpaid_count', 0)),
            _breakdown_entry('Customer cash received (period)', customer_cash_received, sale_payments_qs.count()),
            _breakdown_entry('Invoice cash payments', invoice_cash_received, sale_payments_qs.filter(is_advance=False).count()),
            _breakdown_entry('Customer advances received', advances_received, sale_payments_qs.filter(is_advance=True).count()),
        ],
        'billed_breakdown': [
            _breakdown_entry('Sales invoices', billed, sales_qs.count()),
            _breakdown_entry('Returns', -returns_total if returns_total else Decimal('0'), returns_qs.count()),
        ],
    }

    expense_section = {
        'cogs_afn': _float(cogs),
        'operating_expenses_gl_afn': _float(operating_exp_gl),
        'total_pnl_costs_afn': _float(cogs + operating_exp_gl),
        'expenses_paid_afn': _float(expense_paid),
        'commission_paid_afn': _float(commission_paid),
        'payroll_paid_afn': _float(payroll_paid),
        'advances_paid_afn': _float(advances_paid),
        'refunds_paid_afn': _float(refunds),
        'withdrawals_paid_afn': _float(withdrawals_paid),
        'purchase_payments_afn': _float(purchase_paid),
        'total_cash_out_operating_afn': _float(paid_operating),
        'by_category': expense_by_category,
        'cash_breakdown': [
            _breakdown_entry('Operating expenses', expense_paid, expenses_qs.count()),
            _breakdown_entry('Commissions', commission_paid, commission_qs.count()),
            _breakdown_entry('Payroll', payroll_paid, payroll_qs.count()),
            _breakdown_entry('Advances', advances_paid, advances_qs.count()),
            _breakdown_entry('Return refunds', refunds, returns_qs.filter(refund_amount__gt=0).count()),
            _breakdown_entry('Withdrawals', withdrawals_paid, withdrawals_qs.count()),
            _breakdown_entry('Purchase payments', purchase_paid, purchase_payments_qs.count()),
        ],
        'other_cash_breakdown': [
            _breakdown_entry('Withdrawals', withdrawals_paid, withdrawals_qs.count()),
            _breakdown_entry('Equipment', equipment_paid, equipment_qs.count()),
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
        'production': production,
        'packing': packing,
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
            *([_breakdown_entry('Commissions', commission_paid, commission_qs.count())]
              if commission_paid else []),
            *([_breakdown_entry('Equipment', equipment_paid, equipment_qs.count())]
              if equipment_paid else []),
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
        'free_transactions': {
            'sales_count': sales_qs.filter(transaction_type='free').count(),
            'purchases_count': _period_purchases(start_date, end_date).filter(transaction_type='free').count(),
        },
        'kpis': {
            'net_billed_afn': _float(net_billed),
            'collected_afn': _float(collected),
            'uncollected_period_afn': _float(uncollected_period),
            'customer_cash_received_afn': _float(customer_cash_received),
            'gross_profit_afn': _float(gross_profit),
            'net_profit_afn': _float(net_profit),
            'expenses_paid_afn': _float(paid_operating_with_payroll),
            'production_liters': production['output_liters'],
            'production_kg': production['output_kg'],
            'packing_bottles': packing['bottle_count'],
            'cash_balance_afn': base.get('cash_balance', 0),
            'accounts_receivable_afn': base.get('accounts_receivable', 0),
            'accounts_payable_afn': base.get('accounts_payable', 0),
            # Compatibility aliases used by older management UI / dashboard
            'accrual_revenue': _float(revenue_gl),
            'sales_invoices': _float(billed),
            'returns': _float(returns_total),
            # Cash-from-sales stays payment-date cash (incl. advances).
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
        # Legacy keys for ManagementReportView compatibility during transition
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
            'Collected = settled amount on sales invoices dated in this period (as of period end).',
            'Uncollected (period) = unpaid balance on those same invoices; Collected + Uncollected = Net billed.',
            'Customer cash received = invoice cash payments + customer advances dated in this period (cash flow).',
            'AR outstanding = full accounts receivable balance at period end (GL).',
            'Production/packing costs are inventory costs (not double-counted as P&L expense).',
            'Accrual revenue can exceed billed sales when realized FX gains (or other income) post in the period.',
            'Expenses paid (KPI) includes expenses, payroll, advances, refunds, withdrawals, and commissions.',
        ],
    }
