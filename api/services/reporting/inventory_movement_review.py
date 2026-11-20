"""Inventory movement review from StockMovement ledger."""
from api.models.data.inventory_ledger import StockMovement


def inventory_movement_review(start_date=None, end_date=None, **kwargs):
    qs = StockMovement.objects.select_related('product', 'warehouse', 'packaging')
    if start_date:
        qs = qs.filter(occurred_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(occurred_at__date__lte=end_date)
    rows = [
        {
            'id': m.id,
            'type': m.movement_type,
            'product': getattr(m.product, 'name', None),
            'warehouse': getattr(m.warehouse, 'name', None),
            'base_qty': m.base_quantity,
            'txn_qty': m.transaction_quantity,
            'factor': m.conversion_factor,
            'occurred_at': m.occurred_at,
        }
        for m in qs[:5000]
    ]
    return {'rows': rows, 'count': len(rows)}
