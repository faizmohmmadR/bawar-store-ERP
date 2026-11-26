"""Stock report — snapshot KPIs plus focused alerts (not a full product dump)."""
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone

from api.models.data.inventory_ledger import InventoryBalance, StockMovement
from api.models.data.stock_adjustment import StockAdjustment
from api.services.financial_reports import _float
from api.services.inventory.positions import aggregate_balance_positions
from api.services.uom.conversion import d, quantize
from api.utils.date_filters import apply_date_range


ZERO = Decimal('0')
TOP_VALUE_LIMIT = 10
LOW_STOCK_LIMIT = 15
LOSS_LIMIT = 15
EXPIRED_ON_HAND_LIMIT = 15

MOVEMENT_LABELS = {
    StockMovement.TYPE_PURCHASE_RECEIPT: 'Purchases in',
    StockMovement.TYPE_SALES_DELIVERY: 'Sales out',
    StockMovement.TYPE_CUSTOMER_RETURN: 'Customer returns',
    StockMovement.TYPE_SUPPLIER_RETURN: 'Supplier returns',
    StockMovement.TYPE_TRANSFER_OUT: 'Transfers out',
    StockMovement.TYPE_TRANSFER_IN: 'Transfers in',
    StockMovement.TYPE_ADJUSTMENT_IN: 'Adjustments in',
    StockMovement.TYPE_ADJUSTMENT_OUT: 'Adjustments out',
    StockMovement.TYPE_DAMAGE: 'Damage',
    StockMovement.TYPE_EXPIRY: 'Expiry',
    StockMovement.TYPE_CONSUMPTION: 'Consumption',
    StockMovement.TYPE_OPENING: 'Opening',
    StockMovement.TYPE_PACKAGE_OPEN: 'Package open',
}


def _row_from_position(pos):
    product = pos['product_obj']
    on_hand = d(pos['quantity_on_hand'])
    avg_cost = d(pos['average_cost'])
    value = quantize(on_hand * avg_cost)
    reorder = d(getattr(product, 'reorder_level', 0) or 0)
    minimum = d(getattr(product, 'min_stock_level', 0) or 0)
    is_critical = bool(minimum > 0 and on_hand <= minimum)
    is_low = bool(
        on_hand > 0
        and (
            is_critical
            or (reorder > 0 and on_hand <= reorder)
        )
    )
    return {
        'product_id': pos['product'],
        'product': getattr(product, 'name', None),
        'sku': getattr(product, 'sku', None) or '',
        'warehouse_id': pos['warehouse'],
        'warehouse': getattr(pos['warehouse_obj'], 'name', None),
        'on_hand': _float(on_hand),
        'available': _float(pos['quantity_available']),
        'average_cost': _float(avg_cost),
        'value': _float(value),
        'reorder_level': _float(reorder),
        'is_low': is_low,
        'is_critical': is_critical,
    }


def _period_adjustment_losses(*, adjustment_type, start_date, end_date, limit=LOSS_LIMIT):
    """List + total loss for StockAdjustment write-offs in the period."""
    qs = apply_date_range(
        StockAdjustment.objects.filter(adjustment_type=adjustment_type)
        .select_related('product', 'warehouse'),
        'adjustment_date',
        start_date,
        end_date,
    )
    rows = []
    total_loss = ZERO
    listed_ids = []
    for adj in qs.order_by('-adjustment_date', '-id')[:limit]:
        qty = abs(d(adj.quantity_change))
        unit = d(adj.unit_cost or 0)
        loss = quantize(qty * unit)
        total_loss += loss
        listed_ids.append(adj.id)
        rows.append({
            'id': adj.id,
            'product_id': adj.product_id,
            'product': getattr(adj.product, 'name', None) if adj.product_id else None,
            'warehouse': getattr(adj.warehouse, 'name', None) if adj.warehouse_id else None,
            'quantity': _float(qty),
            'unit_cost': _float(unit),
            'loss_value': _float(loss),
            'reason': adj.reason or '',
            'adjustment_date': adj.adjustment_date.isoformat() if adj.adjustment_date else None,
        })

    count = qs.count()
    if count > limit:
        for adj in qs.exclude(id__in=listed_ids).only('quantity_change', 'unit_cost'):
            total_loss += quantize(abs(d(adj.quantity_change)) * d(adj.unit_cost or 0))

    return rows, total_loss, count


def _expired_on_hand_rows(*, today, limit=EXPIRED_ON_HAND_LIMIT):
    """
    Lots still in warehouse that are past expiry (not yet written off).
    These remain in total stock value until written off.
    """
    balances = list(
        InventoryBalance.objects.filter(
            product__isnull=False,
            product__track_inventory=True,
            quantity_on_hand__gt=0,
            lot__isnull=False,
            lot__expiry_date__lt=today,
        )
        .select_related('product', 'warehouse', 'lot')
        .order_by('lot__expiry_date', 'product__name')
    )

    rows = []
    total_qty = ZERO
    total_value = ZERO
    for balance in balances:
        qty = d(balance.quantity_on_hand)
        cost = d(balance.average_cost)
        value = quantize(qty * cost)
        total_qty += qty
        total_value += value
        if len(rows) >= limit:
            continue
        lot = balance.lot
        rows.append({
            'product_id': balance.product_id,
            'product': getattr(balance.product, 'name', None),
            'sku': getattr(balance.product, 'sku', None) or '',
            'warehouse_id': balance.warehouse_id,
            'warehouse': getattr(balance.warehouse, 'name', None),
            'lot_number': getattr(lot, 'lot_number', None) or '',
            'expiry_date': lot.expiry_date.isoformat() if lot and lot.expiry_date else None,
            'on_hand': _float(qty),
            'average_cost': _float(cost),
            'value': _float(value),
            'days_expired': (today - lot.expiry_date).days if lot and lot.expiry_date else 0,
        })

    return rows, total_qty, total_value, len(balances)


def get_stock_report(start_date=None, end_date=None, **kwargs):
    """
    Stock section report.

    Snapshot: total stock value, expired still on hand, net good value.
    Period: damage / expiry write-off losses and movements.
    Tables are capped lists — never the full catalog.
    """
    today = timezone.localdate()
    qs = InventoryBalance.objects.filter(
        product__isnull=False,
        product__track_inventory=True,
    )
    positions = aggregate_balance_positions(qs)

    total_on_hand = ZERO
    total_value = ZERO
    products_with_stock = set()
    low_rows = []
    valued_rows = []

    for pos in positions:
        row = _row_from_position(pos)
        on_hand = d(row['on_hand'])
        value = d(row['value'])
        total_on_hand += on_hand
        total_value += value
        if on_hand > 0:
            products_with_stock.add(row['product_id'])
            valued_rows.append(row)
        if row['is_low'] or row['is_critical']:
            low_rows.append(row)

    low_rows.sort(key=lambda r: (not r['is_critical'], r['on_hand'], r['product'] or ''))
    valued_rows.sort(key=lambda r: (-d(r['value']), r['product'] or ''))

    expired_rows, expired_qty, expired_value, expired_count = _expired_on_hand_rows(today=today)
    # Net sellable value = all on-hand value minus expired lots still sitting in stock
    net_value = quantize(total_value - expired_value)
    if net_value < 0:
        net_value = ZERO

    movements = apply_date_range(
        StockMovement.objects.all(),
        'occurred_at',
        start_date,
        end_date,
    )
    movement_agg = movements.aggregate(
        count=Count('id'),
        in_qty=Sum('base_quantity', filter=Q(base_quantity__gt=0)),
        out_qty=Sum('base_quantity', filter=Q(base_quantity__lt=0)),
    )

    by_type = list(
        movements.values('movement_type')
        .annotate(count=Count('id'), qty=Sum('base_quantity'))
        .order_by('movement_type')
    )
    movements_summary = []
    for row in by_type:
        mtype = row['movement_type']
        qty = d(row['qty'] or 0)
        if qty == 0 and int(row['count'] or 0) == 0:
            continue
        movements_summary.append({
            'movement_type': mtype,
            'label': MOVEMENT_LABELS.get(mtype, mtype.replace('_', ' ').title()),
            'count': int(row['count'] or 0),
            'qty': _float(qty),
            'qty_abs': _float(abs(qty)),
        })

    damage_rows, damage_loss, damage_count = _period_adjustment_losses(
        adjustment_type=StockAdjustment.ADJUSTMENT_TYPE_DAMAGED,
        start_date=start_date,
        end_date=end_date,
    )
    expiry_rows, expiry_loss, expiry_count = _period_adjustment_losses(
        adjustment_type=StockAdjustment.ADJUSTMENT_TYPE_EXPIRED,
        start_date=start_date,
        end_date=end_date,
    )
    period_writeoff_loss = quantize(damage_loss + expiry_loss)

    product_count = len(products_with_stock)
    low_count = len(low_rows)

    return {
        'report_type': 'stock',
        'currency': 'AFN',
        'currency_symbol': '؋',
        'kpis': {
            'product_balance_count': product_count,
            'products_with_stock': product_count,
            'total_on_hand': _float(total_on_hand),
            'total_value_afn': _float(total_value),
            'expired_on_hand_qty': _float(expired_qty),
            'expired_on_hand_value_afn': _float(expired_value),
            'expired_on_hand_count': expired_count,
            # Sellable inventory value (excludes expired lots still on hand)
            'net_value_afn': _float(net_value),
            'low_stock_count': low_count,
            'movement_count': int(movement_agg['count'] or 0),
            'qty_in': _float(movement_agg['in_qty'] or 0),
            'qty_out': _float(abs(d(movement_agg['out_qty'] or 0))),
            'damage_loss_afn': _float(damage_loss),
            'damage_count': damage_count,
            'expiry_loss_afn': _float(expiry_loss),
            'expiry_count': expiry_count,
            'period_writeoff_loss_afn': _float(period_writeoff_loss),
        },
        'low_stock': low_rows[:LOW_STOCK_LIMIT],
        'top_by_value': valued_rows[:TOP_VALUE_LIMIT],
        'expired_on_hand': expired_rows,
        'period_damages': damage_rows,
        'period_expired': expiry_rows,
        'movements_summary': movements_summary,
        'movement_count': int(movement_agg['count'] or 0),
        'movements_by_type': [
            {
                'movement_type': row['movement_type'],
                'count': row['count'],
                'qty': row['qty'],
            }
            for row in movements_summary
        ],
    }
