"""Section report for finished Stock — position by condition + period damages."""
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum

from api.models.data.damaged_materials import DamagedMaterialItem, DamagedMaterialRecord
from api.models.data.stock import Stock
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.stock_bottle_damage import StockBottleDamage
from api.models.data.stock_transfer import StockTransfer
from api.models.data.storage_tank_leak import StorageTankLeak
from api.services.financial_reports import _d, _float
from api.services.stock_valuation import stock_valuation
from api.utils.date_filters import apply_date_range

ZERO = Decimal('0')
CENT = Decimal('0.01')
QTY = Decimal('0.0001')


def _money(value):
    return _float(_d(value).quantize(CENT, rounding=ROUND_HALF_UP))


def _qty(value):
    return _float(_d(value).quantize(QTY, rounding=ROUND_HALF_UP))


def _bottle_stock_cost(sources) -> Decimal:
    total = ZERO
    for src in sources or []:
        pieces = _d(src.get('bottle_count') or src.get('pieces') or 0)
        unit = _d(src.get('unit_cost_afn') or src.get('unit_cost') or 0)
        total += pieces * unit
    return total


def _position_by_condition():
    """Current on-hand stock snapshot by condition (AFN)."""
    buckets = {
        condition: {
            'condition': condition,
            'sku_count': 0,
            'quantity': ZERO,
            'available': ZERO,
            'value_afn': ZERO,
        }
        for condition in (
            Stock.CONDITION_GOOD,
            Stock.CONDITION_DAMAGED,
            Stock.CONDITION_WASTE,
        )
    }
    stocks = Stock.objects.select_related('product').all()
    for stock in stocks.iterator(chunk_size=200):
        summary = stock_valuation(stock)
        quantity = _d(summary['quantity'])
        if quantity <= 0 and _d(summary['value']) <= 0:
            continue
        bucket = buckets.get(stock.condition) or buckets[Stock.CONDITION_GOOD]
        bucket['sku_count'] += 1
        bucket['quantity'] += quantity
        bucket['available'] += _d(summary['available'])
        bucket['value_afn'] += _d(summary['value'])

    rows = []
    for condition in (Stock.CONDITION_GOOD, Stock.CONDITION_DAMAGED, Stock.CONDITION_WASTE):
        bucket = buckets[condition]
        rows.append({
            'condition': condition,
            'sku_count': bucket['sku_count'],
            'quantity': _qty(bucket['quantity']),
            'available': _qty(bucket['available']),
            'value_afn': _money(bucket['value_afn']),
        })
    return rows


def _period_damages(start_date=None, end_date=None):
    """All damage / loss pathways for the selected period."""
    packaging_records = apply_date_range(
        DamagedMaterialRecord.objects.filter(source=DamagedMaterialRecord.SOURCE_MANUAL),
        'record_date', start_date, end_date,
    )
    packaging_cost = packaging_records.aggregate(total=Sum('total_cost_afn'))['total'] or ZERO
    packaging_count = packaging_records.count()

    packaging_components = []
    for component in (
        DamagedMaterialRecord.COMPONENT_LABEL,
        DamagedMaterialRecord.COMPONENT_PLASTIC,
        DamagedMaterialRecord.COMPONENT_CARTON,
        DamagedMaterialRecord.COMPONENT_LIQUID,
    ):
        items = DamagedMaterialItem.objects.filter(
            record__in=packaging_records,
            component_type=component,
        )
        if not items.exists():
            continue
        agg = items.aggregate(quantity=Sum('quantity_pieces'), cost=Sum('total_cost_afn'))
        packaging_components.append({
            'component_type': component,
            'quantity': _qty(agg['quantity'] or 0),
            'unit': 'kg' if component == DamagedMaterialRecord.COMPONENT_LIQUID else 'piece',
            'cost_afn': _money(agg['cost'] or 0),
            'line_count': items.count(),
        })

    bottle_qs = apply_date_range(
        StockBottleDamage.objects.all(),
        'recorded_at', start_date, end_date,
    )
    bottle_count_events = bottle_qs.count()
    bottles_damaged = ZERO
    bottle_stock_cost = ZERO
    bottle_spill_cost = ZERO
    bottle_spill_kg = ZERO
    for row in bottle_qs.iterator(chunk_size=200):
        bottles_damaged += _d(row.bottle_count)
        bottle_stock_cost += _bottle_stock_cost(row.bottle_sources)
        bottle_spill_cost += _d(row.damaged_liquid_cost_afn)
        bottle_spill_kg += _d(row.damaged_liquid_kg)

    leak_qs = apply_date_range(
        StorageTankLeak.objects.all(),
        'recorded_at', start_date, end_date,
    )
    leak_count = leak_qs.count()
    leak_agg = leak_qs.aggregate(
        cost=Sum('total_cost_afn'),
        kg=Sum('quantity_kg'),
    )
    leak_cost = leak_agg['cost'] or ZERO
    leak_kg = leak_agg['kg'] or ZERO

    transfer_qs = apply_date_range(
        StockTransfer.objects.filter(reason=StockTransfer.REASON_DAMAGED),
        'transfer_date', start_date, end_date,
    )
    transfer_count = transfer_qs.count()
    transfer_agg = transfer_qs.aggregate(
        pieces=Sum('piece_amount'),
        value=Sum('total_value'),
    )
    transfer_pieces = transfer_agg['pieces'] or ZERO
    transfer_value = transfer_agg['value'] or ZERO

    write_off_rows = []
    write_off_total_cost = ZERO
    write_off_total_pieces = ZERO
    write_off_total_count = 0
    for adj_type in (
        StockAdjustment.ADJUSTMENT_TYPE_DAMAGED,
        StockAdjustment.ADJUSTMENT_TYPE_EXPIRED,
        StockAdjustment.ADJUSTMENT_TYPE_LOST,
    ):
        adj_qs = apply_date_range(
            StockAdjustment.objects.filter(adjustment_type=adj_type),
            'adjustment_date', start_date, end_date,
        )
        count = adj_qs.count()
        pieces = ZERO
        cost = ZERO
        for adj in adj_qs.iterator(chunk_size=200):
            change = abs(_d(adj.quantity_change))
            pieces += change
            cost += change * _d(adj.unit_cost or 0)
        write_off_total_count += count
        write_off_total_pieces += pieces
        write_off_total_cost += cost
        if count or pieces or cost:
            write_off_rows.append({
                'kind': f'write_off_{adj_type}',
                'label': adj_type,
                'count': count,
                'quantity': _qty(pieces),
                'unit': 'piece',
                'cost_afn': _money(cost),
            })

    damage_rows = []
    if packaging_count or packaging_cost:
        damage_rows.append({
            'kind': 'packaging_manual',
            'label': 'packaging',
            'count': packaging_count,
            'quantity': _qty(sum((_d(r['quantity']) for r in packaging_components), ZERO)),
            'unit': 'mixed',
            'cost_afn': _money(packaging_cost),
        })
    if bottle_count_events or bottles_damaged or bottle_stock_cost:
        damage_rows.append({
            'kind': 'bottle_damage',
            'label': 'bottle_damage',
            'count': bottle_count_events,
            'quantity': _qty(bottles_damaged),
            'unit': 'bottle',
            'cost_afn': _money(bottle_stock_cost),
        })
    if bottle_spill_kg or bottle_spill_cost:
        damage_rows.append({
            'kind': 'bottle_spill',
            'label': 'bottle_spill',
            'count': bottle_count_events,
            'quantity': _qty(bottle_spill_kg),
            'unit': 'kg',
            'cost_afn': _money(bottle_spill_cost),
        })
    if leak_count or leak_cost:
        damage_rows.append({
            'kind': 'tank_leak',
            'label': 'tank_leak',
            'count': leak_count,
            'quantity': _qty(leak_kg),
            'unit': 'kg',
            'cost_afn': _money(leak_cost),
        })
    if transfer_count or transfer_pieces:
        damage_rows.append({
            'kind': 'condition_reclass',
            'label': 'condition_reclass',
            'count': transfer_count,
            'quantity': _qty(transfer_pieces),
            'unit': 'piece',
            'cost_afn': _money(transfer_value),
        })
    damage_rows.extend(write_off_rows)

    loss_cost = (
        _d(packaging_cost)
        + bottle_stock_cost
        + bottle_spill_cost
        + _d(leak_cost)
        + write_off_total_cost
    )
    event_count = (
        packaging_count
        + bottle_count_events
        + leak_count
        + write_off_total_count
    )

    return {
        'rows': damage_rows,
        'packaging_components': packaging_components,
        'loss_cost_afn': loss_cost,
        'event_count': event_count,
        'bottle_events': bottle_count_events,
        'bottles_damaged': bottles_damaged,
        'bottle_stock_cost_afn': bottle_stock_cost,
        'bottle_spill_cost_afn': bottle_spill_cost,
        'tank_leak_cost_afn': _d(leak_cost),
        'packaging_cost_afn': _d(packaging_cost),
        'write_off_cost_afn': write_off_total_cost,
        'condition_reclass_value_afn': _d(transfer_value),
        'condition_reclass_pieces': transfer_pieces,
    }


def get_stock_report(start_date=None, end_date=None):
    by_condition = _position_by_condition()
    by_condition_map = {row['condition']: row for row in by_condition}
    good = by_condition_map.get(Stock.CONDITION_GOOD, {})
    damaged = by_condition_map.get(Stock.CONDITION_DAMAGED, {})
    waste = by_condition_map.get(Stock.CONDITION_WASTE, {})

    total_value = sum((_d(row['value_afn']) for row in by_condition), ZERO)
    total_pieces = sum((_d(row['quantity']) for row in by_condition), ZERO)
    total_skus = sum((row['sku_count'] for row in by_condition), 0)

    damages = _period_damages(start_date, end_date)

    return {
        'report_type': 'stock',
        'currency': 'AFN',
        'currency_symbol': '؋',
        'kpis': {
            'stock_value_afn': _money(total_value),
            'stock_pieces': _qty(total_pieces),
            'sku_count': total_skus,
            'good_value_afn': _money(good.get('value_afn', 0)),
            'good_pieces': _qty(good.get('quantity', 0)),
            'damaged_lot_value_afn': _money(damaged.get('value_afn', 0)),
            'damaged_lot_pieces': _qty(damaged.get('quantity', 0)),
            'waste_value_afn': _money(waste.get('value_afn', 0)),
            'waste_pieces': _qty(waste.get('quantity', 0)),
            'period_damage_loss_afn': _money(damages['loss_cost_afn']),
            'period_damage_events': damages['event_count'],
            'bottle_damage_events': damages['bottle_events'],
            'bottles_damaged': _qty(damages['bottles_damaged']),
        },
        'by_condition': by_condition,
        'damages': damages['rows'],
        'packaging_components': damages['packaging_components'],
        'damage_totals': {
            'packaging_cost_afn': _money(damages['packaging_cost_afn']),
            'bottle_stock_cost_afn': _money(damages['bottle_stock_cost_afn']),
            'bottle_spill_cost_afn': _money(damages['bottle_spill_cost_afn']),
            'tank_leak_cost_afn': _money(damages['tank_leak_cost_afn']),
            'write_off_cost_afn': _money(damages['write_off_cost_afn']),
            'condition_reclass_value_afn': _money(damages['condition_reclass_value_afn']),
            'condition_reclass_pieces': _qty(damages['condition_reclass_pieces']),
            'loss_cost_afn': _money(damages['loss_cost_afn']),
        },
        'notes': [
            'Stock value is AFN moving-average cost from inventory batches.',
            'Damaged/waste lots are on-hand reclassified stock, not period losses.',
            'Period damage loss includes packaging, bottle stock, spills, tank leaks, and write-offs.',
            'Condition reclass moves good→damaged/waste without destroying value.',
            'Packaging damaged records are cost audits and do not change raw-material balances.',
        ],
    }
