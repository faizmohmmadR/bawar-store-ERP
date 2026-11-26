"""Section report for Purchases — received bills, paid/unpaid, by currency."""
from api.models.data.currency import CURRENCY_DEFINITIONS, get_currency
from api.services.financial_reports import _float
from api.services.trade_reporting import get_trade_report


def _currency_meta(currency_id):
    meta = get_currency(currency_id) or CURRENCY_DEFINITIONS[1]
    return {
        'currency_id': int(currency_id),
        'code': meta['code'],
        'symbol': meta.get('symbol') or meta['code'],
        'name': meta.get('name') or meta['code'],
    }


def _purchase_bucket(row):
    billed = float(row.get('total') or 0)
    returns = float(row.get('returns_in_period') or 0)
    collected = float(row.get('paid') or 0)
    uncollected = float(row.get('unpaid') or 0)
    return {
        'billed': billed,
        'returns': returns,
        'net_billed': float(row.get('net_invoiced_in_period') or (billed - returns)),
        'paid': collected,
        'unpaid': uncollected,
        'invoice_count': int(row.get('count') or 0),
        'free_count': int(row.get('free_count') or 0),
        'paid_count': int(row.get('paid_count') or 0),
        'partial_count': int(row.get('partial_count') or 0),
        'unpaid_count': int(row.get('unpaid_count') or 0),
        'cash_paid_in_period': float(row.get('payments_in_period') or 0),
    }


def get_purchase_report(start_date=None, end_date=None):
    trade_afn = get_trade_report(start_date, end_date)
    purchases_afn = _purchase_bucket(trade_afn['purchases'])

    by_currency = {}
    for currency_id in CURRENCY_DEFINITIONS:
        trade = get_trade_report(start_date, end_date, currency=currency_id)
        bucket = _purchase_bucket(trade['purchases'])
        if not any((
            bucket['billed'],
            bucket['paid'],
            bucket['unpaid'],
            bucket['invoice_count'],
            bucket['cash_paid_in_period'],
        )):
            continue
        info = _currency_meta(currency_id)
        by_currency[info['code']] = {
            **info,
            'billed_native': bucket['billed'],
            'returns_native': bucket['returns'],
            'net_billed_native': bucket['net_billed'],
            'paid_native': bucket['paid'],
            'unpaid_native': bucket['unpaid'],
            'invoice_count': bucket['invoice_count'],
            'paid_count': bucket['paid_count'],
            'partial_count': bucket['partial_count'],
            'unpaid_count': bucket['unpaid_count'],
            'cash_paid_in_period_native': bucket['cash_paid_in_period'],
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
        'report_type': 'purchases',
        'currency': 'AFN',
        'currency_symbol': '؋',
        'kpis': {
            'billed_afn': _float(purchases_afn['billed']),
            'returns_afn': _float(purchases_afn['returns']),
            'net_billed_afn': _float(purchases_afn['net_billed']),
            'paid_afn': _float(purchases_afn['paid']),
            'unpaid_afn': _float(purchases_afn['unpaid']),
            'cash_paid_in_period_afn': _float(purchases_afn['cash_paid_in_period']),
            'invoice_count': purchases_afn['invoice_count'],
            'paid_count': purchases_afn['paid_count'],
            'partial_count': purchases_afn['partial_count'],
            'unpaid_count': purchases_afn['unpaid_count'],
            'currency_count': len(currency_codes),
        },
        'by_currency': by_currency,
        'currency_codes': currency_codes,
        'currency_count': len(currency_codes),
        'notes': [
            'Only received purchases are billed in the period.',
            'Paid / unpaid are settlement on those invoices as of period end.',
            'Cash paid in period includes payments on older bills.',
            'Currencies are shown in native amounts and are never mixed.',
        ],
    }
