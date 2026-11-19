"""Section report for Sales — paid KPIs + free goods section, by currency."""
from decimal import Decimal

from api.models.data.currency import CURRENCY_DEFINITIONS, get_currency
from api.services.financial_reports import _float, _item_cogs_base
from api.services.trade_reporting import get_trade_report
from api.utils.date_filters import apply_date_range
from api.utils.packaging import (
    bottles_per_carton,
    sales_item_pieces,
    split_pieces,
)


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
        'free_count': int(row.get('free_count') or 0),
        'paid_count': int(row.get('paid_count') or 0),
        'partial_count': int(row.get('partial_count') or 0),
        'unpaid_count': int(row.get('unpaid_count') or 0),
    }


def _free_item_identity(item):
    """Stable key + display name for aggregating free sale lines."""
    stock = getattr(item, 'stock', None)
    product = getattr(stock, 'product', None) if stock else None
    if product is not None:
        return (
            f'product:{product.pk}',
            product.name or '—',
            'product',
            product.pk,
            product.barcode or '',
        )

    rm_stock = getattr(item, 'raw_material_stock', None)
    material = getattr(rm_stock, 'raw_material', None) if rm_stock else None
    if material is not None:
        return (
            f'raw_material:{material.pk}',
            material.name or '—',
            'raw_material',
            material.pk,
            '',
        )

    tank = getattr(item, 'storage_tank', None)
    if tank is not None:
        label = getattr(tank, 'name', None) or f'Tank #{tank.pk}'
        return (f'tank:{tank.pk}', label, 'tank', tank.pk, '')

    return (f'line:{item.pk}', '—', 'other', None, '')


def _free_line_pack_amounts(item):
    """Carton / bottle / plastic / liter / kg quantities for one free line."""
    unit = (getattr(item, 'unit', None) or '').lower()
    qty = Decimal(str(getattr(item, 'quantity', 0) or 0))
    pieces = Decimal(sales_item_pieces(item) or 0)
    product = getattr(getattr(item, 'stock', None), 'product', None)
    packaging_type = (
        getattr(product, 'packaging_type', None)
        or getattr(product, 'stock_kind', None)
        or ''
    ).lower()

    cartons = bottles = plastics = liters = kg = Decimal('0')

    if getattr(item, 'sale_source', None) == 'tank' or unit == 'liter':
        liters = Decimal(str(getattr(item, 'liter_amount', 0) or qty or 0))
        return cartons, bottles, plastics, liters, kg, pieces

    if unit == 'kg' and getattr(item, 'sale_source', None) != 'stock':
        kg = qty
        return cartons, bottles, plastics, liters, kg, pieces

    # Packaging / piece-stock materials: attribute qty to that package type.
    if packaging_type in ('carton', 'plastic', 'bottle') or getattr(product, 'is_piece_stock', False):
        kind = packaging_type or 'bottle'
        if unit == 'carton' or kind == 'carton':
            cartons = qty if unit == 'carton' else pieces
        elif unit == 'plastic' or kind == 'plastic':
            plastics = qty if unit == 'plastic' else pieces
        else:
            bottles = qty if unit in ('bottle', 'dana', 'piece', 'pieces') else pieces
        return cartons, bottles, plastics, liters, kg, pieces

    # Finished goods: stock-style carton + loose bottle, or native plastic.
    bpc = bottles_per_carton(product)
    if unit == 'carton':
        cartons = qty
    elif unit == 'plastic':
        plastics = qty
    else:
        cartons, bottles = split_pieces(pieces, bpc)

    return cartons, bottles, plastics, liters, kg, pieces


def _free_sales_queryset(start_date=None, end_date=None, *, currency=None):
    from api.models.data.sales import Sales

    sales = Sales.objects.exclude(status__in=['draft', 'cancelled']).filter(
        transaction_type='free',
    ).exclude(vendor_transaction='purchase_return')
    sales = apply_date_range(sales, 'sale_date', start_date, end_date)
    if currency is not None:
        sales = sales.filter(currency=currency)
    return sales


def _free_sales_summary(start_date=None, end_date=None, *, currency=None, include_items=False):
    """Free goods: invoice count, pieces, AFN cost, optional per-item breakdown."""
    from api.models.data.sales import SalesItems

    sales = _free_sales_queryset(start_date, end_date, currency=currency)
    invoice_count = sales.count()
    cost_afn = Decimal('0')
    pieces_total = Decimal('0')
    carton_total = Decimal('0')
    bottle_total = Decimal('0')
    plastic_total = Decimal('0')
    buckets = {}

    items = SalesItems.objects.filter(sales__in=sales).select_related(
        'sales',
        'stock__product',
        'raw_material_stock__raw_material',
        'storage_tank',
    )
    for item in items.iterator(chunk_size=500):
        line_cost = _item_cogs_base(item)
        cartons, bottles, plastics, liters, kg, pieces = _free_line_pack_amounts(item)
        cost_afn += line_cost
        pieces_total += pieces
        carton_total += cartons
        bottle_total += bottles
        plastic_total += plastics

        if not include_items:
            continue

        key, name, kind, ref_id, barcode = _free_item_identity(item)
        bucket = buckets.get(key)
        if bucket is None:
            bucket = {
                'key': key,
                'name': name,
                'item_type': kind,
                'ref_id': ref_id,
                'barcode': barcode,
                'invoice_count': set(),
                'line_count': 0,
                'carton_amount': Decimal('0'),
                'bottle_amount': Decimal('0'),
                'plastic_amount': Decimal('0'),
                'liter_amount': Decimal('0'),
                'kg_amount': Decimal('0'),
                'pieces': Decimal('0'),
                'cost_afn': Decimal('0'),
            }
            buckets[key] = bucket
        bucket['invoice_count'].add(item.sales_id)
        bucket['line_count'] += 1
        bucket['carton_amount'] += cartons
        bucket['bottle_amount'] += bottles
        bucket['plastic_amount'] += plastics
        bucket['liter_amount'] += liters
        bucket['kg_amount'] += kg
        bucket['pieces'] += pieces
        bucket['cost_afn'] += line_cost

    result = {
        'invoice_count': invoice_count,
        'pieces': float(pieces_total),
        'carton_amount': float(carton_total),
        'bottle_amount': float(bottle_total),
        'plastic_amount': float(plastic_total),
        'cost_afn': float(cost_afn),
    }
    if include_items:
        rows = []
        for bucket in buckets.values():
            rows.append({
                'key': bucket['key'],
                'name': bucket['name'],
                'item_type': bucket['item_type'],
                'ref_id': bucket['ref_id'],
                'barcode': bucket['barcode'],
                'invoice_count': len(bucket['invoice_count']),
                'line_count': bucket['line_count'],
                'carton_amount': _float(bucket['carton_amount']),
                'bottle_amount': _float(bucket['bottle_amount']),
                'plastic_amount': _float(bucket['plastic_amount']),
                'liter_amount': _float(bucket['liter_amount']),
                'kg_amount': _float(bucket['kg_amount']),
                'pieces': _float(bucket['pieces']),
                'cost_afn': _float(bucket['cost_afn']),
            })
        rows.sort(key=lambda row: (-row['cost_afn'], -row['pieces'], row['name']))
        result['items'] = rows
    return result


def get_sales_report(start_date=None, end_date=None):
    trade_afn = get_trade_report(start_date, end_date)
    sales_afn = _sales_bucket(trade_afn['sales'])
    free_afn = _free_sales_summary(start_date, end_date, include_items=True)

    by_currency = {}
    free_by_currency = {}
    for currency_id, meta in CURRENCY_DEFINITIONS.items():
        trade = get_trade_report(start_date, end_date, currency=currency_id)
        bucket = _sales_bucket(trade['sales'])
        free_bucket = _free_sales_summary(start_date, end_date, currency=currency_id)
        info = _currency_meta(currency_id)

        if any((
            bucket['billed'],
            bucket['returns'],
            bucket['collected'],
            bucket['uncollected'],
            bucket['invoice_count'],
        )):
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
            }

        if free_bucket['invoice_count'] or free_bucket['pieces'] or free_bucket['cost_afn']:
            free_by_currency[info['code']] = {
                **info,
                'invoice_count': free_bucket['invoice_count'],
                'pieces': free_bucket['pieces'],
                'carton_amount': free_bucket['carton_amount'],
                'bottle_amount': free_bucket['bottle_amount'],
                'plastic_amount': free_bucket['plastic_amount'],
                'cost_afn': free_bucket['cost_afn'],
            }

    currency_codes = sorted(
        by_currency.keys(),
        key=lambda code: (
            0 if code == 'AFN' else 1,
            -by_currency[code]['net_billed_native'],
            code,
        ),
    )
    free_currency_codes = sorted(
        free_by_currency.keys(),
        key=lambda code: (
            0 if code == 'AFN' else 1,
            -free_by_currency[code]['cost_afn'],
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
            'invoice_count': sales_afn['invoice_count'],
            'free_invoice_count': free_afn['invoice_count'],
            'free_pieces': free_afn['pieces'],
            'free_carton_amount': free_afn['carton_amount'],
            'free_bottle_amount': free_afn['bottle_amount'],
            'free_plastic_amount': free_afn['plastic_amount'],
            'free_cost_afn': _float(free_afn['cost_afn']),
            'currency_count': len(currency_codes),
        },
        'by_currency': by_currency,
        'currency_codes': currency_codes,
        'currency_count': len(currency_codes),
        'free': {
            'invoice_count': free_afn['invoice_count'],
            'pieces': free_afn['pieces'],
            'carton_amount': free_afn['carton_amount'],
            'bottle_amount': free_afn['bottle_amount'],
            'plastic_amount': free_afn['plastic_amount'],
            'cost_afn': _float(free_afn['cost_afn']),
            'items': free_afn.get('items') or [],
            'by_currency': free_by_currency,
            'currency_codes': free_currency_codes,
        },
        'notes': [
            'Paid sales exclude free goods invoices.',
            'Free section uses distribution cost (COGS in AFN), not sell price.',
            'Free items show carton / bottle / plastic amounts for packed goods.',
            'Collected and uncollected are settlement on period invoices as of period end.',
            'Currencies are shown in native amounts and are never mixed.',
        ],
    }
