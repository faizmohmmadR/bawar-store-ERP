"""One valuation pool per product/condition; lots remain physical expiry traces."""
from decimal import Decimal
from django.db import transaction
from rest_framework.exceptions import ValidationError
from api.services.weighted_average import average, d

def capture_pool(batch):
    from api.models.data.stock import Stock
    from api.models.data.inventory_batch import InventoryBatch
    stock, _ = Stock.all_objects.select_for_update().get_or_create(product_id=batch.product_id, condition=batch.condition, defaults={'piece_amount': 0, 'buy_price': 0, 'currency': 1})
    rows = {r['id']: r for r in InventoryBatch.objects.filter(product_id=batch.product_id, condition=batch.condition).values('id', 'remaining_pieces', 'unit_cost', 'status')}
    on_hand = [r for r in rows.values() if r['status'] in ('active','expired') and r['remaining_pieces'] > 0]
    quantity = sum((r['remaining_pieces'] for r in on_hand), Decimal('0'))
    value = sum((r['remaining_pieces'] * r['unit_cost'] for r in on_hand), Decimal('0'))
    return {'stock':stock, 'rows':rows, 'quantity':quantity, 'value':value}

def update_pool(batch, before, removed_id=None):
    from api.models.data.stock import Stock
    from api.models.data.inventory_batch import InventoryBatch
    old = before['rows'].get(removed_id or batch.pk)
    old_q = old['remaining_pieces'] if old and old['status'] in ('active','expired') else Decimal('0')
    new_q = d(batch.remaining_pieces) if not removed_id and not batch.deleted_at and batch.status in ('active','expired') else Decimal('0')
    delta = new_q - old_q
    old_cost = old['unit_cost'] if old else d(batch.unit_cost)
    inflow_cost = d(getattr(batch, '_inflow_unit_cost', batch.unit_cost))
    outflow_cost = d(getattr(batch, '_reversal_unit_cost', old_cost))
    value = before['value'] + delta * (inflow_cost if delta >= 0 else outflow_cost)
    if not delta and old and getattr(batch, '_allow_cost_adjustment', False):
        value += new_q * (d(batch.unit_cost) - old_cost)
    quantity = before['quantity'] + delta
    cost = average(quantity, value)
    InventoryBatch.objects.filter(product_id=batch.product_id, condition=batch.condition, status__in=['active','expired'], remaining_pieces__gt=0).update(unit_cost=cost)
    stock=before['stock']
    updates={'piece_amount':quantity,'buy_price':cost,'currency':1}
    if quantity > 0:
        updates.update(deleted_at=None,deleted_by=None)
    Stock.all_objects.filter(pk=stock.pk).update(**updates)
    if not removed_id and new_q > 0:
        batch.unit_cost=cost


@transaction.atomic
def ensure_stock_batches(stock):
    """Materialize existing legacy quantity without posting another opening journal."""
    from api.models.data.inventory_batch import InventoryBatch
    from api.models.data.stock import Stock
    stock = Stock.all_objects.select_for_update().get(pk=stock.pk)
    if stock.piece_amount <= 0 or InventoryBatch.objects.filter(product_id=stock.product_id, condition=stock.condition).exists():
        return
    batch=InventoryBatch(product_id=stock.product_id,condition=stock.condition,
        pieces_received=stock.piece_amount,remaining_pieces=stock.piece_amount,
        unit_cost=stock.buy_price,currency=1,expire_date=stock.expire_date,
        notes='Legacy opening balance for moving-average stock')
    batch._skip_batch_journal=True
    batch.save()
