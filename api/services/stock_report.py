"""Stock report — on-hand balances, value, and period movements from inventory ledger."""
from decimal import Decimal

from django.db.models import Count, Q, Sum

from api.models.data.inventory_ledger import InventoryBalance, StockMovement
from api.services.financial_reports import _float
from api.utils.date_filters import apply_date_range


ZERO = Decimal('0')


def _d(value):
    return Decimal(str(value or 0))


def get_stock_report(start_date=None, end_date=None, **kwargs):
    balances = list(
        InventoryBalance.objects.select_related('product', 'warehouse')
        .filter(product__isnull=False)
        .order_by('product__name', 'warehouse__name')
    )

    total_on_hand = ZERO
    total_value = ZERO
    low_stock_count = 0
    rows = []
    for balance in balances:
        on_hand = _d(balance.quantity_on_hand)
        avg_cost = _d(balance.average_cost)
        value = on_hand * avg_cost
        total_on_hand += on_hand
        total_value += value
        product = balance.product
        reorder = _d(getattr(product, 'reorder_level', 0) or 0)
        is_low = bool(reorder and on_hand <= reorder)
        if is_low:
            low_stock_count += 1
        rows.append({
            'product_id': balance.product_id,
            'product': getattr(product, 'name', None),
            'sku': getattr(product, 'sku', None) or '',
            'warehouse_id': balance.warehouse_id,
            'warehouse': getattr(balance.warehouse, 'name', None),
            'on_hand': _float(on_hand),
            'available': _float(getattr(balance, 'quantity_available', on_hand) or on_hand),
            'average_cost': _float(avg_cost),
            'value': _float(value),
            'is_low': is_low,
        })

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

    return {
        'report_type': 'stock',
        'currency': 'AFN',
        'currency_symbol': '؋',
        'kpis': {
            'product_balance_count': len(rows),
            'total_on_hand': _float(total_on_hand),
            'total_value_afn': _float(total_value),
            'low_stock_count': low_stock_count,
            'movement_count': int(movement_agg['count'] or 0),
            'qty_in': _float(movement_agg['in_qty'] or 0),
            'qty_out': _float(abs(_d(movement_agg['out_qty'] or 0))),
        },
        'balances': rows,
        'movements_by_type': [
            {
                'movement_type': row['movement_type'],
                'count': int(row['count'] or 0),
                'qty': _float(row['qty'] or 0),
            }
            for row in by_type
        ],
        'movement_count': int(movement_agg['count'] or 0),
        'notes': [
            'On-hand and value are current warehouse balances (not period-limited).',
            'Movements (in/out) use occurred_at in the selected period.',
            'Value uses average cost × quantity on hand in AFN.',
        ],
    }
