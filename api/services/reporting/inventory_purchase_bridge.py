"""Purchase-to-inventory bridge using PurchaseItem receipts."""
from api.models.data.purchases import Purchase, PurchaseItem


def inventory_purchase_bridge(**kwargs):
    items = PurchaseItem.objects.filter(
        purchase__status='received',
        purchase__deleted_at__isnull=True,
    ).select_related('purchase', 'product', 'packaging')
    rows = []
    for item in items:
        rows.append({
            'purchase': item.purchase.invoice_number,
            'product': getattr(item.product, 'name', None),
            'packaging': getattr(item.packaging, 'name', None),
            'qty': item.quantity,
            'base_qty': item.base_quantity,
            'conversion_factor': item.conversion_factor,
            'total_base': item.total_price_base,
        })
    return {'rows': rows, 'count': len(rows)}
