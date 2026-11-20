"""Current inventory position from InventoryBalance."""
from api.models.data.inventory_ledger import InventoryBalance


def inventory_current_position(**kwargs):
    rows = []
    for bal in InventoryBalance.objects.select_related('product', 'warehouse'):
        rows.append({
            'product_id': bal.product_id,
            'product': getattr(bal.product, 'name', None),
            'warehouse_id': bal.warehouse_id,
            'warehouse': getattr(bal.warehouse, 'name', None),
            'on_hand': bal.quantity_on_hand,
            'available': bal.quantity_available,
            'unit_cost': bal.average_cost,
            'value': (bal.quantity_on_hand or 0) * (bal.average_cost or 0),
        })
    return {'rows': rows, 'count': len(rows)}
