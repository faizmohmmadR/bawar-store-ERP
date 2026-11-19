"""Standard raw-material inventory report.

Covers:
  - Current stock position (qty, AFN unit cost, value, issues)
  - Period purchases / sales in native currency (never mixed)
  - AFN consumption (production + packing) and consolidated KPIs
  - Per-material movement bridge and type / vendor summaries
"""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS, get_currency
from api.models.data.packing import PackingRunComponent
from api.models.data.raw_material_process import RawMaterialProcessItem
from api.models.data.raw_materials import (
    RawMaterial,
    RawMaterialPurchase,
    RawMaterialPurchaseItem,
    RawMaterialStock,
)
from api.models.data.sales import SalesItems
from api.services.financial_reports import _d, _float, _item_cogs_base, _item_revenue_base
from api.services.raw_material_sales import raw_stock_quantity
from api.utils.date_filters import apply_date_range
from api.utils.packaging import sales_item_line_total

ZERO = Decimal('0')
CENT = Decimal('0.01')
QTY = Decimal('0.0001')


def _q(value, places=QTY):
    return _d(value).quantize(places, rounding=ROUND_HALF_UP)


def _money(value):
    return _float(_d(value).quantize(CENT, rounding=ROUND_HALF_UP))


def _qty(value):
    return _float(_q(value))


def _currency_meta(currency_id):
    meta = get_currency(currency_id) or CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]
    return {
        'currency_id': int(currency_id or BASE_CURRENCY_ID),
        'code': meta['code'],
        'symbol': meta.get('symbol') or meta['code'],
        'name': meta.get('name') or meta['code'],
    }


def _currency_bucket(currency_id):
    meta = _currency_meta(currency_id)
    return {
        **meta,
        'purchased_native': ZERO,
        'purchased_afn': ZERO,
        'purchase_count': 0,
        'purchase_lines': 0,
        'unpaid_native': ZERO,
        'unpaid_afn': ZERO,
        'sold_revenue_native': ZERO,
        'sold_revenue_afn': ZERO,
        'sold_cost_afn': ZERO,
        'sold_margin_afn': ZERO,
        'sale_count': 0,
        'sale_lines': 0,
        'vendors': defaultdict(lambda: {
            'vendor_id': None,
            'vendor_name': '',
            'purchase_count': 0,
            'item_count': 0,
            'value_native': ZERO,
            'value_afn': ZERO,
        }),
    }


def _material_bucket():
    return {
        'purchased_qty': ZERO,
        'purchased_value': ZERO,
        'purchase_count': 0,
        'produced_qty': ZERO,
        'produced_value': ZERO,
        'production_count': 0,
        'packed_qty': ZERO,
        'packed_value': ZERO,
        'packing_count': 0,
        'sold_qty': ZERO,
        'sold_revenue': ZERO,
        'sold_cost': ZERO,
        'sale_count': 0,
    }


def _packing_quantity(component, material):
    """Prefer allocated kg weight for kg materials; otherwise piece count."""
    if material.unit == RawMaterial.UNIT_KG:
        allocations = component.inventory_allocations or []
        qty = sum((_d(row.get('quantity')) for row in allocations), ZERO)
        if qty > ZERO:
            return qty, RawMaterial.UNIT_KG
    return _d(component.quantity_pieces), material.unit or 'piece'


def get_raw_material_report(start_date=None, end_date=None):
    stocks = {
        stock.raw_material_id: stock
        for stock in RawMaterialStock.objects.select_related(
            'raw_material', 'raw_material__category',
        )
    }
    materials = {
        material.pk: material
        for material in RawMaterial.objects.select_related('category').all()
    }
    # Include materials that have activity but no stock row yet.
    for material_id in materials:
        stocks.setdefault(material_id, None)

    activity = defaultdict(_material_bucket)
    by_currency = {}

    def currency_row(currency_id):
        key = int(currency_id or BASE_CURRENCY_ID)
        if key not in by_currency:
            by_currency[key] = _currency_bucket(key)
        return by_currency[key]

    purchase_qs = apply_date_range(
        RawMaterialPurchase.objects.filter(
            status='received',
            deleted_at__isnull=True,
        ),
        'purchase_date',
        start_date,
        end_date,
    ).select_related('vendor')
    purchase_ids = list(purchase_qs.values_list('id', flat=True))
    purchase_items = RawMaterialPurchaseItem.objects.filter(
        purchase_id__in=purchase_ids,
        deleted_at__isnull=True,
        quantity__gt=0,
    ).select_related('purchase', 'purchase__vendor', 'raw_material')

    for item in purchase_items:
        purchase = item.purchase
        bucket = activity[item.raw_material_id]
        value_afn = _d(item.total_price_base)
        if value_afn == ZERO:
            value_afn = _d(item.quantity) * _d(item.price_per_unit_base)
        value_native = _d(item.total_price)
        if value_native == ZERO:
            value_native = _d(item.quantity) * _d(item.price_per_unit)
        bucket['purchased_qty'] += _d(item.quantity)
        bucket['purchased_value'] += value_afn
        bucket['purchase_count'] += 1
        materials.setdefault(item.raw_material_id, item.raw_material)

        crow = currency_row(purchase.currency)
        crow['purchased_native'] += value_native
        crow['purchased_afn'] += value_afn
        crow['purchase_lines'] += 1

        vendor = purchase.vendor
        vendor_key = vendor.pk if vendor else 0
        vrow = crow['vendors'][vendor_key]
        vrow['vendor_id'] = vendor.pk if vendor else None
        vrow['vendor_name'] = vendor.name if vendor else '—'
        vrow['value_native'] += value_native
        vrow['value_afn'] += value_afn
        vrow['item_count'] += 1

    for purchase in purchase_qs:
        crow = currency_row(purchase.currency)
        crow['purchase_count'] += 1
        unpaid_native = max(_d(purchase.total_amount) - _d(purchase.paid_amount), ZERO)
        unpaid_afn = max(_d(purchase.total_amount_base) - _d(purchase.paid_amount_base), ZERO)
        crow['unpaid_native'] += unpaid_native
        crow['unpaid_afn'] += unpaid_afn
        vendor_key = purchase.vendor_id or 0
        vrow = crow['vendors'][vendor_key]
        vrow['purchase_count'] += 1
        if purchase.vendor_id and not vrow['vendor_name']:
            vrow['vendor_id'] = purchase.vendor_id
            vrow['vendor_name'] = purchase.vendor.name

    process_items = apply_date_range(
        RawMaterialProcessItem.objects.filter(
            process__deleted_at__isnull=True,
            deleted_at__isnull=True,
        ).select_related('process', 'raw_material'),
        'process__process_date',
        start_date,
        end_date,
    )
    for item in process_items:
        bucket = activity[item.raw_material_id]
        bucket['produced_qty'] += _d(item.quantity)
        bucket['produced_value'] += _d(item.material_cost_afn)
        bucket['production_count'] += 1
        materials.setdefault(item.raw_material_id, item.raw_material)

    packing_components = apply_date_range(
        PackingRunComponent.objects.filter(
            packing_run__deleted_at__isnull=True,
            deleted_at__isnull=True,
            raw_material_stock__isnull=False,
        ).select_related(
            'packing_run',
            'raw_material_stock__raw_material',
        ),
        'packing_run__created_at',
        start_date,
        end_date,
    )
    for component in packing_components:
        material = component.raw_material_stock.raw_material
        qty, _unit = _packing_quantity(component, material)
        bucket = activity[material.pk]
        bucket['packed_qty'] += qty
        bucket['packed_value'] += _d(component.total_cost_afn)
        bucket['packing_count'] += 1
        materials.setdefault(material.pk, material)

    sale_items = apply_date_range(
        SalesItems.objects.filter(
            sale_source=SalesItems.SOURCE_RAW_MATERIAL,
            sales__deleted_at__isnull=True,
            deleted_at__isnull=True,
        ).exclude(
            sales__status__in={'draft', 'cancelled'},
        ).select_related(
            'sales',
            'raw_material_stock__raw_material',
        ),
        'sales__sale_date',
        start_date,
        end_date,
    )
    sale_ids_by_currency = defaultdict(set)
    for item in sale_items:
        stock = item.raw_material_stock
        if stock is None:
            continue
        material = stock.raw_material
        qty = _d(raw_stock_quantity(item))
        revenue_afn = _item_revenue_base(item)
        revenue_native = sales_item_line_total(item)
        cost = _item_cogs_base(item)
        bucket = activity[material.pk]
        bucket['sold_qty'] += qty
        bucket['sold_revenue'] += revenue_afn
        bucket['sold_cost'] += cost
        bucket['sale_count'] += 1
        materials.setdefault(material.pk, material)

        currency_id = getattr(item.sales, 'currency', None) or BASE_CURRENCY_ID
        crow = currency_row(currency_id)
        crow['sold_revenue_native'] += revenue_native
        crow['sold_revenue_afn'] += revenue_afn
        crow['sold_cost_afn'] += cost
        crow['sale_lines'] += 1
        sale_ids_by_currency[int(currency_id)].add(item.sales_id)

    for currency_id, sale_ids in sale_ids_by_currency.items():
        currency_row(currency_id)['sale_count'] = len(sale_ids)

    position_rows = []
    movement_rows = []
    by_type = defaultdict(lambda: {
        'material_type': '',
        'sku_count': 0,
        'stock_qty': ZERO,
        'stock_value': ZERO,
        'purchased_value': ZERO,
        'consumed_value': ZERO,
        'sold_revenue': ZERO,
    })
    issues = []
    stock_value = ZERO
    stock_skus = 0
    low_stock = 0
    zero_stock = 0
    unknown_cost = 0
    negative_stock = 0

    material_ids = sorted(
        set(materials) | set(stocks) | set(activity),
        key=lambda pk: (materials.get(pk).name if materials.get(pk) else f'#{pk}'),
    )

    for material_id in material_ids:
        material = materials.get(material_id)
        if material is None:
            continue
        stock = stocks.get(material_id)
        qty = _d(stock.quantity) if stock is not None else ZERO
        unit_cost = _d(stock.last_purchase_price) if stock is not None else ZERO
        zero_cost_ok = bool(getattr(stock, 'zero_cost_allowed', False)) if stock else False
        known = qty == ZERO or unit_cost > ZERO or zero_cost_ok
        value = qty * unit_cost if known else None
        row_issues = []
        if qty < ZERO:
            row_issues.append('negative_stock')
            negative_stock += 1
        elif qty == ZERO:
            zero_stock += 1
        elif qty > ZERO and qty < Decimal('1') and material.unit == RawMaterial.UNIT_PIECE:
            low_stock += 1
        if qty > ZERO and not known:
            row_issues.append('cost_unknown')
            unknown_cost += 1
        if value is not None:
            stock_value += value
        if stock is not None or qty != ZERO:
            stock_skus += 1

        act = activity[material_id]
        consumed_qty = act['produced_qty'] + act['packed_qty']
        consumed_value = act['produced_value'] + act['packed_value']
        net_qty = act['purchased_qty'] - consumed_qty - act['sold_qty']
        # Estimated opening from current close and period net movement.
        opening_qty = qty - net_qty

        position_rows.append({
            'material_id': material_id,
            'name': material.name,
            'material_type': material.material_type,
            'category': material.category.name if material.category_id else None,
            'unit': material.unit,
            'quantity': _qty(qty),
            'unit_cost_afn': _money(unit_cost) if known else None,
            'value_afn': _money(value) if value is not None else None,
            'last_purchase_date': (
                stock.last_purchase_date.isoformat()
                if stock and stock.last_purchase_date else None
            ),
            'issues': row_issues,
            'source_path': f'/raw-materials/{material_id}',
        })

        has_movement = any((
            act['purchased_qty'], act['produced_qty'], act['packed_qty'], act['sold_qty'],
        ))
        if has_movement or qty != ZERO:
            movement_rows.append({
                'material_id': material_id,
                'name': material.name,
                'material_type': material.material_type,
                'unit': material.unit,
                'opening_qty': _qty(opening_qty),
                'purchased_qty': _qty(act['purchased_qty']),
                'purchased_value_afn': _money(act['purchased_value']),
                'production_qty': _qty(act['produced_qty']),
                'production_value_afn': _money(act['produced_value']),
                'packing_qty': _qty(act['packed_qty']),
                'packing_value_afn': _money(act['packed_value']),
                'sold_qty': _qty(act['sold_qty']),
                'sold_revenue_afn': _money(act['sold_revenue']),
                'sold_cost_afn': _money(act['sold_cost']),
                'net_qty': _qty(net_qty),
                'closing_qty': _qty(qty),
                'closing_value_afn': _money(value) if value is not None else None,
                'source_path': f'/raw-materials/{material_id}',
            })

        type_row = by_type[material.material_type]
        type_row['material_type'] = material.material_type
        type_row['sku_count'] += 1
        type_row['stock_qty'] += qty
        if value is not None:
            type_row['stock_value'] += value
        type_row['purchased_value'] += act['purchased_value']
        type_row['consumed_value'] += consumed_value
        type_row['sold_revenue'] += act['sold_revenue']

        for issue in row_issues:
            issues.append({
                'code': issue,
                'material_id': material_id,
                'name': material.name,
                'quantity': _qty(qty),
                'source_path': f'/raw-materials/{material_id}',
            })

    purchased_value = sum((activity[mid]['purchased_value'] for mid in activity), ZERO)
    produced_value = sum((activity[mid]['produced_value'] for mid in activity), ZERO)
    packed_value = sum((activity[mid]['packed_value'] for mid in activity), ZERO)
    sold_revenue = sum((activity[mid]['sold_revenue'] for mid in activity), ZERO)
    sold_cost = sum((activity[mid]['sold_cost'] for mid in activity), ZERO)
    consumed_value = produced_value + packed_value

    purchase_count = purchase_qs.count()
    purchase_item_count = purchase_items.count()

    position_rows.sort(key=lambda r: (-(r['value_afn'] or 0), r['name']))
    movement_rows.sort(key=lambda r: (-r['purchased_value_afn'], -r['sold_revenue_afn'], r['name']))

    by_type_rows = [
        {
            'material_type': row['material_type'],
            'sku_count': row['sku_count'],
            'stock_qty': _qty(row['stock_qty']),
            'stock_value_afn': _money(row['stock_value']),
            'purchased_value_afn': _money(row['purchased_value']),
            'consumed_value_afn': _money(row['consumed_value']),
            'sold_revenue_afn': _money(row['sold_revenue']),
        }
        for row in sorted(by_type.values(), key=lambda r: -r['stock_value'])
    ]

    by_currency_payload = {}
    by_vendor_rows = []
    unpaid_afn_total = ZERO
    for currency_id, crow in by_currency.items():
        crow['sold_margin_afn'] = crow['sold_revenue_afn'] - crow['sold_cost_afn']
        unpaid_afn_total += crow['unpaid_afn']
        vendor_list = []
        for vrow in crow['vendors'].values():
            if not (vrow['value_native'] or vrow['value_afn'] or vrow['purchase_count']):
                continue
            vendor_entry = {
                'vendor_id': vrow['vendor_id'],
                'vendor_name': vrow['vendor_name'],
                'currency_id': crow['currency_id'],
                'currency_code': crow['code'],
                'currency_symbol': crow['symbol'],
                'purchase_count': vrow['purchase_count'],
                'item_count': vrow['item_count'],
                'value_native': _money(vrow['value_native']),
                'value_afn': _money(vrow['value_afn']),
                # Compatibility alias used by the first report UI
                'value_afn_total': _money(vrow['value_afn']),
                'source_path': (
                    f'/vendors/{vrow["vendor_id"]}' if vrow['vendor_id'] else None
                ),
            }
            vendor_list.append(vendor_entry)
            by_vendor_rows.append(vendor_entry)
        vendor_list.sort(key=lambda r: (-r['value_native'], -r['value_afn'], r['vendor_name']))
        by_currency_payload[crow['code']] = {
            'currency_id': crow['currency_id'],
            'code': crow['code'],
            'symbol': crow['symbol'],
            'name': crow['name'],
            'purchased_native': _money(crow['purchased_native']),
            'purchased_afn': _money(crow['purchased_afn']),
            'purchase_count': crow['purchase_count'],
            'purchase_lines': crow['purchase_lines'],
            'unpaid_native': _money(crow['unpaid_native']),
            'unpaid_afn': _money(crow['unpaid_afn']),
            'sold_revenue_native': _money(crow['sold_revenue_native']),
            'sold_revenue_afn': _money(crow['sold_revenue_afn']),
            'sold_cost_afn': _money(crow['sold_cost_afn']),
            'sold_margin_afn': _money(crow['sold_margin_afn']),
            'sale_count': crow['sale_count'],
            'sale_lines': crow['sale_lines'],
            'by_vendor': vendor_list,
        }

    currency_codes = sorted(
        by_currency_payload.keys(),
        key=lambda code: (
            0 if code == 'AFN' else 1,
            -by_currency_payload[code]['purchased_afn'],
            -by_currency_payload[code]['sold_revenue_afn'],
            code,
        ),
    )
    by_vendor_rows.sort(
        key=lambda r: (-r['value_afn'], r['currency_code'], r['vendor_name']),
    )

    return {
        'report_type': 'raw_materials',
        'currency': 'AFN',
        'currency_symbol': '؋',
        'kpis': {
            'stock_value_afn': _money(stock_value),
            'stock_skus': stock_skus,
            'purchased_value_afn': _money(purchased_value),
            'purchase_count': purchase_count,
            'purchase_lines': purchase_item_count,
            'consumed_value_afn': _money(consumed_value),
            'production_consumed_afn': _money(produced_value),
            'packing_consumed_afn': _money(packed_value),
            'sold_revenue_afn': _money(sold_revenue),
            'sold_cost_afn': _money(sold_cost),
            'sold_margin_afn': _money(sold_revenue - sold_cost),
            'purchases_unpaid_afn': _money(unpaid_afn_total),
            'low_stock_count': low_stock,
            'zero_stock_count': zero_stock,
            'negative_stock_count': negative_stock,
            'unknown_cost_count': unknown_cost,
            'issue_count': len(issues),
            'currency_count': len(currency_codes),
        },
        'by_currency': by_currency_payload,
        'currency_codes': currency_codes,
        'currency_count': len(currency_codes),
        'position': position_rows,
        'movement': movement_rows,
        'by_type': by_type_rows,
        'by_vendor': by_vendor_rows,
        'issues': issues,
        'notes': [
            'Purchases and sales are shown in their native currency — currencies are never mixed.',
            'AFN columns are the stored base conversion for consolidation only.',
            'Stock value and production/packing consumption are AFN inventory costs.',
            'Opening quantity is estimated as closing − purchases + consumption + sales in the period.',
            'Sold margin uses AFN revenue − AFN unit cost snapshot.',
        ],
    }
