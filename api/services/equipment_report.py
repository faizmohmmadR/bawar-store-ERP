"""Section report for Equipment — asset position, acquisitions, depreciation.

Money is kept in native currency and never mixed across currencies.
AFN equivalents are provided alongside for consolidation only.
"""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS, get_currency
from api.models.data.equipment import Equipment, EquipmentDepreciation
from api.services.financial_reports import _convert, _d, _float
from api.services.report_period import parse_report_datetime
from api.utils.date_filters import apply_date_range, normalize_date_from, normalize_date_to

ZERO = Decimal('0')
CENT = Decimal('0.01')


def _money(value):
    return _float(_d(value).quantize(CENT, rounding=ROUND_HALF_UP))


def _cost_native(equipment):
    return _d(equipment.quantity) * _d(equipment.unit_cost)


def _to_afn(amount, currency_id, at_date):
    amount = _d(amount)
    if not amount:
        return ZERO
    if int(currency_id or BASE_CURRENCY_ID) == BASE_CURRENCY_ID:
        return amount
    return _d(_convert(
        amount,
        currency_id,
        BASE_CURRENCY_ID,
        parse_report_datetime(at_date),
    ))


def _dep_native(equipment):
    return _d(equipment.accumulated_depreciation)


def _currency_meta(currency_id):
    meta = get_currency(currency_id) or CURRENCY_DEFINITIONS.get(BASE_CURRENCY_ID) or {'code': 'AFN'}
    return {
        'currency_id': int(currency_id or BASE_CURRENCY_ID),
        'code': meta.get('code') or 'AFN',
        'symbol': meta.get('symbol') or meta.get('code') or 'AFN',
        'name': meta.get('name') or meta.get('code') or 'AFN',
    }


def _empty_currency_bucket(info):
    return {
        **info,
        'active_count': 0,
        'disposed_count': 0,
        'gross_native': ZERO,
        'accum_dep_native': ZERO,
        'nbv_native': ZERO,
        'gross_afn': ZERO,
        'accum_dep_afn': ZERO,
        'nbv_afn': ZERO,
        'period_count': 0,
        'period_asset_native': ZERO,
        'period_expense_native': ZERO,
        'period_cash_out_native': ZERO,
        'period_asset_afn': ZERO,
        'period_expense_afn': ZERO,
        'period_cash_out_afn': ZERO,
        'period_dep_native': ZERO,
        'period_dep_afn': ZERO,
        'period_dep_count': 0,
    }


def _years_in_range(start_date, end_date):
    start = normalize_date_from(start_date)
    end = normalize_date_to(end_date)
    if start is None and end is None:
        return None

    def _year(value):
        return value.year if hasattr(value, 'year') else value

    if start is None:
        return {_year(end)}
    if end is None:
        return {_year(start)}
    return set(range(_year(start), _year(end) + 1))


def _sort_currency_codes(by_currency):
    return sorted(
        by_currency.keys(),
        key=lambda code: (
            0 if code == 'AFN' else 1,
            -float(by_currency[code].get('gross_afn') or by_currency[code].get('period_asset_afn') or 0),
            code,
        ),
    )


def get_equipment_report(start_date=None, end_date=None):
    assets = Equipment.objects.exclude(
        acquisition_type=Equipment.ACQUISITION_EXPENSE,
    ).select_related('assigned_to')

    active_assets = assets.exclude(status=Equipment.STATUS_DISPOSED).filter(is_active=True)
    disposed_assets = assets.filter(status=Equipment.STATUS_DISPOSED)

    by_currency = {}
    active_count = 0
    gross_afn_total = ZERO
    accum_afn_total = ZERO
    nbv_afn_total = ZERO

    status_buckets = defaultdict(
        lambda: defaultdict(lambda: {
            'count': 0, 'cost_native': ZERO, 'nbv_native': ZERO,
            'cost_afn': ZERO, 'nbv_afn': ZERO,
        })
    )
    category_buckets = defaultdict(
        lambda: defaultdict(lambda: {
            'count': 0, 'cost_native': ZERO, 'nbv_native': ZERO,
            'cost_afn': ZERO, 'nbv_afn': ZERO,
        })
    )

    for eq in assets.iterator(chunk_size=200):
        info = _currency_meta(eq.currency)
        code = info['code']
        bucket = by_currency.get(code)
        if bucket is None:
            bucket = _empty_currency_bucket(info)
            by_currency[code] = bucket

        cost_native = _cost_native(eq)
        dep_native = _dep_native(eq)
        cost_afn = _to_afn(cost_native, eq.currency, eq.acquired_date)
        dep_afn = _to_afn(dep_native, eq.currency, eq.acquired_date)
        nbv_native = max(cost_native - dep_native, ZERO)
        nbv_afn = max(cost_afn - dep_afn, ZERO)

        is_active_asset = (
            eq.status != Equipment.STATUS_DISPOSED and eq.is_active
        )
        if eq.status == Equipment.STATUS_DISPOSED:
            bucket['disposed_count'] += 1
        if is_active_asset:
            active_count += 1
            bucket['active_count'] += 1
            bucket['gross_native'] += cost_native
            bucket['accum_dep_native'] += dep_native
            bucket['nbv_native'] += nbv_native
            bucket['gross_afn'] += cost_afn
            bucket['accum_dep_afn'] += dep_afn
            bucket['nbv_afn'] += nbv_afn
            gross_afn_total += cost_afn
            accum_afn_total += dep_afn
            nbv_afn_total += nbv_afn

            cat = category_buckets[eq.category or Equipment.CATEGORY_OTHER][code]
            cat['count'] += 1
            cat['cost_native'] += cost_native
            cat['nbv_native'] += nbv_native
            cat['cost_afn'] += cost_afn
            cat['nbv_afn'] += nbv_afn

        status = eq.status or Equipment.STATUS_IN_USE
        st = status_buckets[status][code]
        st['count'] += 1
        st['cost_native'] += cost_native
        st['nbv_native'] += nbv_native
        st['cost_afn'] += cost_afn
        st['nbv_afn'] += nbv_afn

    by_status = []
    for status, _label in Equipment.STATUS_CHOICES:
        currency_map = status_buckets.get(status) or {}
        for code, bucket in sorted(
            currency_map.items(),
            key=lambda item: (0 if item[0] == 'AFN' else 1, -float(item[1]['cost_afn']), item[0]),
        ):
            info = by_currency.get(code) or _currency_meta(BASE_CURRENCY_ID)
            by_status.append({
                'status': status,
                'currency_code': code,
                'currency_id': info.get('currency_id', BASE_CURRENCY_ID),
                'count': bucket['count'],
                'cost_native': _money(bucket['cost_native']),
                'nbv_native': _money(bucket['nbv_native']),
                'cost_afn': _money(bucket['cost_afn']),
                'nbv_afn': _money(bucket['nbv_afn']),
            })

    by_category = []
    category_flat = []
    for category, currency_map in category_buckets.items():
        for code, bucket in currency_map.items():
            category_flat.append((category, code, bucket))
    category_flat.sort(key=lambda item: (-item[2]['cost_afn'], item[0], item[1]))
    for category, code, bucket in category_flat:
        info = by_currency.get(code) or _currency_meta(BASE_CURRENCY_ID)
        by_category.append({
            'category': category,
            'currency_code': code,
            'currency_id': info.get('currency_id', BASE_CURRENCY_ID),
            'count': bucket['count'],
            'cost_native': _money(bucket['cost_native']),
            'nbv_native': _money(bucket['nbv_native']),
            'cost_afn': _money(bucket['cost_afn']),
            'nbv_afn': _money(bucket['nbv_afn']),
        })

    # Period acquisitions
    period_qs = apply_date_range(
        Equipment.objects.all().select_related('assigned_to'),
        'acquired_date', start_date, end_date,
    )
    period_count = 0
    period_asset_afn = ZERO
    period_expense_afn = ZERO
    period_cash_out_afn = ZERO
    by_acquisition = defaultdict(
        lambda: defaultdict(lambda: {
            'count': 0, 'cost_native': ZERO, 'cost_afn': ZERO,
        })
    )
    acquisitions = []

    for eq in period_qs.iterator(chunk_size=200):
        info = _currency_meta(eq.currency)
        code = info['code']
        bucket = by_currency.get(code)
        if bucket is None:
            bucket = _empty_currency_bucket(info)
            by_currency[code] = bucket

        cost_native = _cost_native(eq)
        cost_afn = _to_afn(cost_native, eq.currency, eq.acquired_date)
        dep_native = _dep_native(eq)
        nbv_native = max(cost_native - dep_native, ZERO)
        acq = eq.acquisition_type or Equipment.ACQUISITION_NEW

        period_count += 1
        bucket['period_count'] += 1
        acq_bucket = by_acquisition[acq][code]
        acq_bucket['count'] += 1
        acq_bucket['cost_native'] += cost_native
        acq_bucket['cost_afn'] += cost_afn

        if acq == Equipment.ACQUISITION_EXPENSE:
            bucket['period_expense_native'] += cost_native
            bucket['period_expense_afn'] += cost_afn
            period_expense_afn += cost_afn
        else:
            bucket['period_asset_native'] += cost_native
            bucket['period_asset_afn'] += cost_afn
            period_asset_afn += cost_afn

        if acq in (Equipment.ACQUISITION_NEW, Equipment.ACQUISITION_EXPENSE):
            bucket['period_cash_out_native'] += cost_native
            bucket['period_cash_out_afn'] += cost_afn
            period_cash_out_afn += cost_afn

        acquisitions.append({
            'id': eq.pk,
            'name': eq.name,
            'category': eq.category or '',
            'status': eq.status,
            'acquisition_type': acq,
            'serial_number': eq.serial_number or '',
            'quantity': _float(eq.quantity),
            'cost_native': _money(cost_native),
            'nbv_native': _money(nbv_native),
            'cost_afn': _money(cost_afn),
            'nbv_afn': _money(max(cost_afn - _to_afn(dep_native, eq.currency, eq.acquired_date), ZERO)),
            'currency_code': code,
            'acquired_date': eq.acquired_date.isoformat() if eq.acquired_date else None,
            'assigned_to': getattr(eq.assigned_to, 'full_name', None) or '',
        })

    acquisitions.sort(key=lambda row: (-row['cost_afn'], row['name'] or ''))
    acquisitions = acquisitions[:40]

    acquisition_rows = []
    for acq, _label in Equipment.ACQUISITION_CHOICES:
        currency_map = by_acquisition.get(acq) or {}
        for code, bucket in sorted(
            currency_map.items(),
            key=lambda item: (0 if item[0] == 'AFN' else 1, -float(item[1]['cost_afn']), item[0]),
        ):
            info = by_currency.get(code) or _currency_meta(BASE_CURRENCY_ID)
            acquisition_rows.append({
                'acquisition_type': acq,
                'currency_code': code,
                'currency_id': info.get('currency_id', BASE_CURRENCY_ID),
                'count': bucket['count'],
                'cost_native': _money(bucket['cost_native']),
                'cost_afn': _money(bucket['cost_afn']),
            })

    # Period depreciation
    years = _years_in_range(start_date, end_date)
    dep_qs = EquipmentDepreciation.objects.select_related('equipment')
    if years is not None:
        dep_qs = dep_qs.filter(year__in=years)
    period_dep_afn = ZERO
    dep_count = 0
    depreciation_rows = []
    for entry in dep_qs.iterator(chunk_size=200):
        eq = entry.equipment
        info = _currency_meta(eq.currency)
        code = info['code']
        bucket = by_currency.get(code)
        if bucket is None:
            bucket = _empty_currency_bucket(info)
            by_currency[code] = bucket

        amount_native = _d(entry.amount)
        amount_afn = _to_afn(amount_native, eq.currency, eq.acquired_date)
        period_dep_afn += amount_afn
        dep_count += 1
        bucket['period_dep_native'] += amount_native
        bucket['period_dep_afn'] += amount_afn
        bucket['period_dep_count'] += 1
        depreciation_rows.append({
            'id': entry.pk,
            'equipment_id': eq.pk,
            'equipment_name': eq.name,
            'year': entry.year,
            'amount_native': _money(amount_native),
            'amount_afn': _money(amount_afn),
            'currency_code': code,
        })
    depreciation_rows.sort(
        key=lambda row: (-row['year'], -row['amount_afn'], row['equipment_name'])
    )
    depreciation_rows = depreciation_rows[:40]

    currency_codes = _sort_currency_codes(by_currency)
    by_currency_out = {}
    for code in currency_codes:
        row = by_currency[code]
        by_currency_out[code] = {
            **{k: v for k, v in row.items() if k in (
                'currency_id', 'code', 'symbol', 'name',
                'active_count', 'disposed_count', 'period_count', 'period_dep_count',
            )},
            'gross_native': _money(row['gross_native']),
            'accum_dep_native': _money(row['accum_dep_native']),
            'nbv_native': _money(row['nbv_native']),
            'gross_afn': _money(row['gross_afn']),
            'accum_dep_afn': _money(row['accum_dep_afn']),
            'nbv_afn': _money(row['nbv_afn']),
            'period_asset_native': _money(row['period_asset_native']),
            'period_expense_native': _money(row['period_expense_native']),
            'period_cash_out_native': _money(row['period_cash_out_native']),
            'period_asset_afn': _money(row['period_asset_afn']),
            'period_expense_afn': _money(row['period_expense_afn']),
            'period_cash_out_afn': _money(row['period_cash_out_afn']),
            'period_dep_native': _money(row['period_dep_native']),
            'period_dep_afn': _money(row['period_dep_afn']),
        }

    return {
        'report_type': 'equipment',
        'currency': 'AFN',
        'currency_symbol': '؋',
        'kpis': {
            'active_count': active_count,
            'disposed_count': disposed_assets.count(),
            'gross_cost_afn': _money(gross_afn_total),
            'accumulated_depreciation_afn': _money(accum_afn_total),
            'net_book_value_afn': _money(nbv_afn_total),
            'period_acquisition_count': period_count,
            'period_asset_cost_afn': _money(period_asset_afn),
            'period_expense_cost_afn': _money(period_expense_afn),
            'period_cash_out_afn': _money(period_cash_out_afn),
            'period_depreciation_afn': _money(period_dep_afn),
            'period_depreciation_count': dep_count,
            'currency_count': len(currency_codes),
        },
        'by_status': by_status,
        'by_category': by_category,
        'by_acquisition': acquisition_rows,
        'by_currency': by_currency_out,
        'currency_codes': currency_codes,
        'acquisitions': acquisitions,
        'depreciation': depreciation_rows,
        'notes': [
            'Amounts stay in the currency each asset was saved in — currencies are never mixed.',
            'AFN columns are equivalents at the acquisition-date rate for consolidation only.',
            'Gross cost / NBV exclude expense acquisitions and disposed/inactive assets from active totals.',
            'Period cash-out includes new purchases and expense items only.',
        ],
    }
