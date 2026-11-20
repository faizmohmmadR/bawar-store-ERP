"""Stock report — balances and movements."""
from api.models.data.inventory_ledger import InventoryBalance, StockMovement


def get_stock_report(start_date=None, end_date=None, **kwargs):
    balances = list(
        InventoryBalance.objects.select_related('product', 'warehouse').all()
    )
    movements = StockMovement.objects.all()
    if start_date:
        movements = movements.filter(occurred_at__date__gte=start_date)
    if end_date:
        movements = movements.filter(occurred_at__date__lte=end_date)
    return {
        'balances': [
            {
                'product_id': b.product_id,
                'product': getattr(b.product, 'name', None),
                'warehouse': getattr(b.warehouse, 'name', None),
                'on_hand': b.quantity_on_hand,
                'available': b.quantity_available,
                'average_cost': b.average_cost,
                'value': (b.quantity_on_hand or 0) * (b.average_cost or 0),
            }
            for b in balances
        ],
        'movement_count': movements.count(),
        'period': {'start': start_date, 'end': end_date},
    }
