"""Section report for Sales — billed, collected, returns, and gross profit."""
from decimal import Decimal

from api.models.data.currency import CURRENCY_DEFINITIONS, get_currency
from api.services.financial_reports import (
    _float,
    _item_cogs_base,
    _item_revenue_base,
    _period_returns,
    _period_sales,
    get_top_products,
)
from api.services.trade_reporting import get_trade_report


ZERO = Decimal('0')


def _d(value):
    return Decimal(str(value or 0))


def _currency_meta(currency_id):
    meta = get_currency(currency_id) or CURRENCY_DEFINITIONS[1]
    return {
        'currency_id': int(currency_id),
        'code': meta['code'],
        'symbol': meta.get('symbol') or meta['code'],
        'name': meta.get('name') or meta['code'],
    }


def _sales_bucket(row):
    billed = float(row.get('total') or 0)
    returns = float(row.get('returns_in_period') or 0)
    collected = float(row.get('paid') or 0)
    uncollected = float(row.get('unpaid') or 0)
    return {
        'billed': billed,
        'returns': returns,
        'net_billed': float(row.get('net_invoiced_in_period') or (billed - returns)),
        'collected': collected,
        'uncollected': uncollected,
        'invoice_count': int(row.get('count') or 0),
        'paid_count': int(row.get('paid_count') or 0),
        'partial_count': int(row.get('partial_count') or 0),
        'unpaid_count': int(row.get('unpaid_count') or 0),
    }


def _return_cogs_afn(start_date=None, end_date=None, *, currency=None):
    """COGS reversed by returns in the period (sale unit_cost × returned base qty)."""
    from api.models.data.returns import ReturnItems

    returns = _period_returns(start_date, end_date)
    if currency is not None:
        returns = returns.filter(currency=currency)
    items = ReturnItems.objects.filter(return_order__in=returns).select_related('sales_item')
    total = ZERO
    for item in items.iterator(chunk_size=500):
        sale_item = item.sales_item
        if sale_item is None:
            continue
        unit_cost = _d(getattr(sale_item, 'unit_cost', 0))
        base_qty = _d(getattr(item, 'base_quantity', 0) or getattr(item, 'liter_amount', 0))
        if unit_cost <= 0 or base_qty <= 0:
            continue
        total += (base_qty * unit_cost).quantize(Decimal('0.0001'))
    return total


def _line_profit_afn(start_date=None, end_date=None, *, currency=None):
    """
    Period sales gross profit from line items.

    Revenue and COGS are both in AFN:
      - revenue from sale-line totals converted with the invoice base ratio
      - COGS from snapshotted AVCO unit_cost × base quantity
      - returns reduce both revenue (via caller net_billed) and COGS here
    """
    from api.models.data.sales import SalesItems

    sales = _period_sales(start_date, end_date).exclude(transaction_type='free')
    if currency is not None:
        sales = sales.filter(currency=currency)

    revenue = ZERO
    cogs = ZERO
    for item in SalesItems.objects.filter(sales__in=sales).select_related('sales').iterator(
        chunk_size=500,
    ):
        revenue += _item_revenue_base(item)
        cogs += _item_cogs_base(item)

    return_cogs = _return_cogs_afn(start_date, end_date, currency=currency)
    net_cogs = cogs - return_cogs
    if net_cogs < 0:
        net_cogs = ZERO
    return revenue, net_cogs, cogs, return_cogs


def _profit_block(revenue_afn, cogs_afn, *, cogs_before_returns=None, return_cogs=None):
    revenue = max(_d(revenue_afn), ZERO)
    cogs = max(_d(cogs_afn), ZERO)
    gross = revenue - cogs
    margin = (gross / revenue * Decimal('100')) if revenue > 0 else ZERO
    return {
        'revenue_afn': _float(revenue),
        'cogs_afn': _float(cogs),
        'cogs_before_returns_afn': _float(cogs_before_returns if cogs_before_returns is not None else cogs),
        'return_cogs_afn': _float(return_cogs or 0),
        'gross_profit_afn': _float(gross),
        'margin_pct': _float(margin),
    }


def get_sales_report(start_date=None, end_date=None):
    trade_afn = get_trade_report(start_date, end_date)
    sales_afn = _sales_bucket(trade_afn['sales'])

    # Gross profit is on goods sold (line revenue − AVCO COGS), not on cash collected.
    # Settlement billed may include invoices without lines; those are excluded from profit.
    line_revenue, net_cogs, cogs_raw, return_cogs = _line_profit_afn(start_date, end_date)
    net_billed = _d(sales_afn['net_billed'])
    revenue_for_profit = line_revenue if line_revenue > 0 else net_billed
    profit_afn = _profit_block(
        revenue_for_profit,
        net_cogs,
        cogs_before_returns=cogs_raw,
        return_cogs=return_cogs,
    )
    top_products = sorted(
        get_top_products(start_date=start_date, end_date=end_date, limit=25),
        key=lambda row: (row.get('gross_profit_base') or 0, row.get('revenue_base') or 0),
        reverse=True,
    )[:15]

    by_currency = {}
    for currency_id in CURRENCY_DEFINITIONS:
        trade = get_trade_report(start_date, end_date, currency=currency_id)
        bucket = _sales_bucket(trade['sales'])
        if not any((
            bucket['billed'],
            bucket['returns'],
            bucket['collected'],
            bucket['uncollected'],
            bucket['invoice_count'],
        )):
            continue
        rev, cogs, cogs_raw_c, ret_cogs = _line_profit_afn(
            start_date, end_date, currency=currency_id,
        )
        # Currency table: native settlement + AFN profit for invoices in that currency.
        profit = _profit_block(rev, cogs, cogs_before_returns=cogs_raw_c, return_cogs=ret_cogs)
        info = _currency_meta(currency_id)
        by_currency[info['code']] = {
            **info,
            'billed_native': bucket['billed'],
            'returns_native': bucket['returns'],
            'net_billed_native': bucket['net_billed'],
            'collected_native': bucket['collected'],
            'uncollected_native': bucket['uncollected'],
            'invoice_count': bucket['invoice_count'],
            'paid_count': bucket['paid_count'],
            'partial_count': bucket['partial_count'],
            'unpaid_count': bucket['unpaid_count'],
            'cogs_afn': profit['cogs_afn'],
            'gross_profit_afn': profit['gross_profit_afn'],
            'margin_pct': profit['margin_pct'],
        }

    currency_codes = sorted(
        by_currency.keys(),
        key=lambda code: (
            0 if code == 'AFN' else 1,
            -by_currency[code]['net_billed_native'],
            code,
        ),
    )

    return {
        'report_type': 'sales',
        'currency': 'AFN',
        'currency_symbol': '؋',
        'kpis': {
            'billed_afn': _float(sales_afn['billed']),
            'returns_afn': _float(sales_afn['returns']),
            'net_billed_afn': _float(sales_afn['net_billed']),
            'collected_afn': _float(sales_afn['collected']),
            'uncollected_afn': _float(sales_afn['uncollected']),
            'cogs_afn': profit_afn['cogs_afn'],
            'gross_profit_afn': profit_afn['gross_profit_afn'],
            'margin_pct': profit_afn['margin_pct'],
            'invoice_count': sales_afn['invoice_count'],
            'paid_count': sales_afn['paid_count'],
            'partial_count': sales_afn['partial_count'],
            'unpaid_count': sales_afn['unpaid_count'],
            'currency_count': len(currency_codes),
        },
        'profit': {
            **profit_afn,
            'note': (
                'Gross profit = sold-goods revenue − COGS. '
                'COGS uses AVCO unit cost snapshotted on each sale line (AFN per base unit). '
                'Invoices without line items are excluded from profit.'
            ),
        },
        'top_products': top_products,
        'by_currency': by_currency,
        'currency_codes': currency_codes,
        'currency_count': len(currency_codes),
        'notes': [
            'Collected and uncollected are settlement on period invoices as of period end.',
            'Gross profit uses sale-line AVCO cost (AFN), not cash collected.',
            'Currencies show native billed amounts; COGS and profit are always AFN.',
        ],
    }
