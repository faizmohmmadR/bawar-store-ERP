"""Section report for Expenses — totals by currency, category, and payment method.

Native amounts stay in the currency each expense was saved in and are never mixed.
AFN equivalents use stored amount_base when present.
"""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS, get_currency
from api.models.data.expenses import Expense
from api.services.financial_reports import _convert, _d, _float
from api.services.report_period import parse_report_datetime
from api.utils.date_filters import apply_date_range

ZERO = Decimal('0')
CENT = Decimal('0.01')


def _money(value):
    return _float(_d(value).quantize(CENT, rounding=ROUND_HALF_UP))


def _currency_meta(currency_id):
    meta = get_currency(currency_id) or CURRENCY_DEFINITIONS.get(BASE_CURRENCY_ID) or {'code': 'AFN'}
    return {
        'currency_id': int(currency_id or BASE_CURRENCY_ID),
        'code': meta.get('code') or 'AFN',
        'symbol': meta.get('symbol') or meta.get('code') or 'AFN',
        'name': meta.get('name') or meta.get('code') or 'AFN',
    }


def _amount_native(expense):
    return _d(expense.amount)


def _amount_afn(expense):
    base = _d(getattr(expense, 'amount_base', None) or 0)
    if base:
        return base
    native = _amount_native(expense)
    if not native:
        return ZERO
    if int(expense.currency or BASE_CURRENCY_ID) == BASE_CURRENCY_ID:
        return native
    return _d(_convert(
        native,
        expense.currency,
        BASE_CURRENCY_ID,
        parse_report_datetime(expense.expense_date),
    ))


def _empty_currency(info):
    return {
        **info,
        'count': 0,
        'with_receipt_count': 0,
        'total_native': ZERO,
        'total_afn': ZERO,
        'cash_native': ZERO,
        'bank_native': ZERO,
        'sarafi_native': ZERO,
        'cash_afn': ZERO,
        'bank_afn': ZERO,
        'sarafi_afn': ZERO,
    }


def _sort_codes(by_currency):
    return sorted(
        by_currency.keys(),
        key=lambda code: (
            0 if code == 'AFN' else 1,
            -float(by_currency[code]['total_afn']),
            code,
        ),
    )


def get_expense_report(start_date=None, end_date=None):
    qs = apply_date_range(
        Expense.objects.select_related('category', 'user'),
        'expense_date',
        start_date,
        end_date,
    )

    by_currency = {}
    category_buckets = defaultdict(
        lambda: defaultdict(lambda: {
            'count': 0, 'total_native': ZERO, 'total_afn': ZERO, 'name': '',
        })
    )
    method_buckets = defaultdict(
        lambda: defaultdict(lambda: {
            'count': 0, 'total_native': ZERO, 'total_afn': ZERO,
        })
    )

    total_afn = ZERO
    expense_count = 0
    with_receipt_count = 0
    cash_afn = ZERO
    bank_afn = ZERO
    sarafi_afn = ZERO
    lines = []

    for expense in qs.iterator(chunk_size=200):
        info = _currency_meta(expense.currency)
        code = info['code']
        bucket = by_currency.get(code)
        if bucket is None:
            bucket = _empty_currency(info)
            by_currency[code] = bucket

        native = _amount_native(expense)
        afn = _amount_afn(expense)
        method = expense.payment_method or Expense.PAYMENT_CASH
        category = expense.category
        category_id = category.pk if category else 0
        category_name = (category.name if category else '') or 'Uncategorized'

        expense_count += 1
        total_afn += afn
        bucket['count'] += 1
        bucket['total_native'] += native
        bucket['total_afn'] += afn

        if expense.receipt:
            with_receipt_count += 1
            bucket['with_receipt_count'] += 1

        if method == Expense.PAYMENT_BANK:
            bucket['bank_native'] += native
            bucket['bank_afn'] += afn
            bank_afn += afn
        elif method == Expense.PAYMENT_SARAFI:
            bucket['sarafi_native'] += native
            bucket['sarafi_afn'] += afn
            sarafi_afn += afn
        else:
            bucket['cash_native'] += native
            bucket['cash_afn'] += afn
            cash_afn += afn

        cat = category_buckets[category_id][code]
        cat['count'] += 1
        cat['total_native'] += native
        cat['total_afn'] += afn
        cat['name'] = category_name

        meth = method_buckets[method][code]
        meth['count'] += 1
        meth['total_native'] += native
        meth['total_afn'] += afn

        user = expense.user
        user_name = ''
        if user is not None:
            full = ''
            if hasattr(user, 'get_full_name'):
                full = (user.get_full_name() or '').strip()
            user_name = full or getattr(user, 'username', None) or getattr(user, 'email', None) or ''
        lines.append({
            'id': expense.pk,
            'category_id': category_id or None,
            'category_name': category_name,
            'description': (expense.description or '').strip(),
            'payment_method': method,
            'has_receipt': bool(expense.receipt),
            'amount_native': _money(native),
            'amount_afn': _money(afn),
            'currency_code': code,
            'expense_date': expense.expense_date.isoformat() if expense.expense_date else None,
            'user_name': user_name,
        })

    lines.sort(key=lambda row: (-row['amount_afn'], row['category_name'] or ''))
    lines = lines[:50]

    currency_codes = _sort_codes(by_currency)
    by_currency_out = {}
    for code in currency_codes:
        row = by_currency[code]
        by_currency_out[code] = {
            'currency_id': row['currency_id'],
            'code': row['code'],
            'symbol': row['symbol'],
            'name': row['name'],
            'count': row['count'],
            'with_receipt_count': row['with_receipt_count'],
            'total_native': _money(row['total_native']),
            'total_afn': _money(row['total_afn']),
            'cash_native': _money(row['cash_native']),
            'bank_native': _money(row['bank_native']),
            'sarafi_native': _money(row['sarafi_native']),
            'cash_afn': _money(row['cash_afn']),
            'bank_afn': _money(row['bank_afn']),
            'sarafi_afn': _money(row['sarafi_afn']),
        }

    by_category = []
    for category_id, currency_map in category_buckets.items():
        for code, bucket in currency_map.items():
            by_category.append({
                'category_id': category_id or None,
                'name': bucket['name'],
                'currency_code': code,
                'count': bucket['count'],
                'total_native': _money(bucket['total_native']),
                'total_afn': _money(bucket['total_afn']),
            })
    by_category.sort(key=lambda row: (-row['total_afn'], row['name'] or '', row['currency_code']))

    method_order = (
        Expense.PAYMENT_CASH,
        Expense.PAYMENT_BANK,
        Expense.PAYMENT_SARAFI,
    )
    by_payment_method = []
    for method in method_order:
        currency_map = method_buckets.get(method) or {}
        for code, bucket in sorted(
            currency_map.items(),
            key=lambda item: (0 if item[0] == 'AFN' else 1, -float(item[1]['total_afn']), item[0]),
        ):
            by_payment_method.append({
                'payment_method': method,
                'currency_code': code,
                'count': bucket['count'],
                'total_native': _money(bucket['total_native']),
                'total_afn': _money(bucket['total_afn']),
            })

    return {
        'report_type': 'expenses',
        'currency': 'AFN',
        'currency_symbol': '؋',
        'kpis': {
            'expense_count': expense_count,
            'category_count': len(category_buckets),
            'currency_count': len(currency_codes),
            'with_receipt_count': with_receipt_count,
            'total_afn': _money(total_afn),
            'cash_afn': _money(cash_afn),
            'bank_afn': _money(bank_afn),
            'sarafi_afn': _money(sarafi_afn),
        },
        'by_currency': by_currency_out,
        'currency_codes': currency_codes,
        'by_category': by_category,
        'by_payment_method': by_payment_method,
        'expenses': lines,
        'notes': [
            'Amounts stay in the currency each expense was saved in — currencies are never mixed.',
            'AFN columns use stored amount_base when available, otherwise acquisition-date conversion.',
            'Payment method shows which cash book was credited (cash / bank / sarafi).',
            'Includes all operating expenses recorded in the Expenses module for the period.',
        ],
    }
