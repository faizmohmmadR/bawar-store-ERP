"""
FEFO (First Expired First Out) allocation service for sales.

Allocates inventory from batches ordered by expiration date (nearest first).
All batch mutations use select_for_update to prevent race conditions.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import F
from rest_framework.exceptions import ValidationError

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.sale_batch_allocation import SaleBatchAllocation
from api.services.batch_queries import sellable_batch_q


class InsufficientInventoryError(Exception):
    pass


def _d(value):
    return Decimal(str(value or 0))


def _sellable_batches(stock):
    return (
        InventoryBatch.objects.select_for_update()
        .filter(
            product=stock.product,
            condition=stock.condition,
        )
        .filter(sellable_batch_q())
        .order_by(F('expire_date').asc(nulls_last=True), 'created_at')
    )


def _sync_legacy_stock(batch, delta):
    """Add delta (positive or negative) to the matching Stock.piece_amount."""
    from api.models.data.stock import Stock
    from api.services.stock_valuation import sync_stock_valuation
    stock = Stock.objects.select_for_update().filter(product=batch.product, condition=batch.condition).first()
    if stock is not None:
        sync_stock_valuation(stock)


@transaction.atomic
def allocate_inventory_for_sale_item(sale_item, quantity_needed):
    """
    Allocate pieces from FEFO-ordered batches for a sale item.

    Returns list of SaleBatchAllocation objects created.
    Raises InsufficientInventoryError if stock is insufficient (no partial state left).
    """
    quantity_needed = _d(quantity_needed)
    if quantity_needed <= 0:
        return []

    stock = sale_item.stock
    if not stock:
        raise InsufficientInventoryError("Sale item has no associated stock.")
    from api.models.data.stock import Stock
    stock = Stock.objects.select_for_update().get(pk=stock.pk)

    batches = list(_sellable_batches(stock))

    # Legacy / seed paths may set Stock.piece_amount without creating InventoryBatch.
    # Sale UI reads Stock, but FEFO sells from batches — heal the gap before failing.
    if not batches and _d(getattr(stock, 'piece_amount', 0)) > 0 and not InventoryBatch.objects.filter(product=stock.product, condition=stock.condition).exists():
        from api.services.batch_inventory import sync_manual_stock_batch

        sync_manual_stock_batch(
            stock,
            pieces=stock.piece_amount,
            expire_date=getattr(stock, 'expire_date', None),
        )
        batches = list(_sellable_batches(stock))

    remaining = quantity_needed
    pending = []  # (batch, take_amount)

    for batch in batches:
        if remaining <= 0:
            break
        take = min(_d(batch.remaining_pieces), remaining)
        if take <= 0:
            continue
        pending.append((batch, take))
        remaining -= take

    if remaining > 0:
        stock_on_hand = _d(getattr(stock, 'piece_amount', 0))
        batch_available = quantity_needed - remaining
        raise InsufficientInventoryError(
            f"Insufficient inventory for {stock.product.name}. "
            f"Needed: {quantity_needed}, available in sellable batches: {batch_available}"
            f" (stock record shows {stock_on_hand} pieces)."
        )

    # All checks passed — commit mutations
    allocations = []
    for batch, take in pending:
        batch.remaining_pieces = _d(batch.remaining_pieces) - take
        if batch.remaining_pieces <= 0:
            batch.status = InventoryBatch.STATUS_EMPTY
        batch.save(update_fields=['remaining_pieces', 'status'])
        _sync_legacy_stock(batch, -take)

        allocation, _ = SaleBatchAllocation.objects.get_or_create(
            sale=sale_item.sales, sale_item=sale_item, inventory_batch=batch,
            defaults={'quantity': Decimal('0'), 'unit_cost': batch.unit_cost},
        )
        old_value = allocation.quantity * _d(allocation.unit_cost if allocation.unit_cost is not None else sale_item.unit_cost)
        allocation.unit_cost = ((old_value + take * batch.unit_cost) / (allocation.quantity + take)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        allocation.quantity += take
        allocation.save(update_fields=['quantity', 'unit_cost'])
        allocations.append(allocation)

    _refresh_sale_cost(sale_item)
    return allocations


def _refresh_sale_cost(sale_item):
    allocations = SaleBatchAllocation.objects.filter(sale_item=sale_item).select_related('inventory_batch')
    quantity = sum((row.quantity for row in allocations), Decimal('0'))
    value = sum((row.quantity * _d(row.unit_cost if row.unit_cost is not None else sale_item.unit_cost) for row in allocations), Decimal('0'))
    if quantity > 0:
        sale_item.unit_cost = (value / quantity).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        sale_item.save(update_fields=['unit_cost'])


@transaction.atomic
def revert_sale_item_allocations(sale_item):
    """Reverse a sale only while no returned stock depends on its allocations."""
    from api.models.data.stock import Stock
    if sale_item.stock_id:
        Stock.all_objects.select_for_update().get(pk=sale_item.stock_id)
    allocations = list(SaleBatchAllocation.objects.select_for_update().filter(sale_item=sale_item).select_related('inventory_batch'))
    if any(row.returned_quantity > 0 for row in allocations):
        raise ValidationError("Remove this sale's returns before reversing or cancelling it.")
    for allocation in allocations:
        batch = InventoryBatch.objects.select_for_update().get(pk=allocation.inventory_batch_id)
        batch._inflow_unit_cost = allocation.unit_cost if allocation.unit_cost is not None else sale_item.unit_cost
        batch.remaining_pieces += allocation.quantity
        batch.save(update_fields=['remaining_pieces', 'status'])
        _sync_legacy_stock(batch, allocation.quantity)
    SaleBatchAllocation.objects.filter(sale_item=sale_item).delete()


def _save_return_trace(return_item, traces):
    if return_item is not None:
        return_item.batch_returns = [row for row in traces if _d(row['quantity']) > 0]
        return_item.save(update_fields=['batch_returns'])


@transaction.atomic
def restore_pieces_to_sale_batches(sale_item, pieces_to_restore, *, return_item=None):
    """Restore each sold piece at most once and retain the exact returned lot cost."""
    from api.models.data.stock import Stock
    if sale_item.stock_id:
        Stock.all_objects.select_for_update().get(pk=sale_item.stock_id)
    quantity = _d(pieces_to_restore)
    if quantity <= 0:
        return Decimal('0')
    allocations = list(SaleBatchAllocation.objects.select_for_update().filter(sale_item=sale_item).order_by('-id'))
    if not allocations:
        # Historical stock-only sales have no original lot; preserve their current opening stock first.
        from api.services.pooled_stock import ensure_stock_batches
        ensure_stock_batches(sale_item.stock)
        total_sold = _d(sale_item.liter_amount) or _d(sale_item.quantity)
        if quantity > total_sold or not sale_item.stock_id:
            raise ValidationError('Returned quantity exceeds the original sale.')
        batch = InventoryBatch(product=sale_item.stock.product, condition=sale_item.stock.condition,
            pieces_received=total_sold, remaining_pieces=0, unit_cost=sale_item.unit_cost,
            currency=1, notes=f'Legacy return for sale {sale_item.sales.invoice_number}')
        batch._skip_batch_journal = True
        batch.save()
        allocations = [SaleBatchAllocation.objects.create(sale=sale_item.sales, sale_item=sale_item,
            inventory_batch=batch, quantity=total_sold, unit_cost=sale_item.unit_cost)]
    available = sum((row.quantity - row.returned_quantity for row in allocations), Decimal('0'))
    if quantity > available:
        raise ValidationError('Returned quantities exceed the outstanding sold quantity.')
    traces = list(return_item.batch_returns or []) if return_item is not None else []
    remaining = quantity
    for allocation in allocations:
        take = min(allocation.quantity - allocation.returned_quantity, remaining)
        if take <= 0:
            continue
        batch = InventoryBatch.objects.select_for_update().get(pk=allocation.inventory_batch_id)
        batch._inflow_unit_cost = allocation.unit_cost if allocation.unit_cost is not None else sale_item.unit_cost
        batch.remaining_pieces += take
        batch.save(update_fields=['remaining_pieces', 'status'])
        allocation.returned_quantity += take
        allocation.save(update_fields=['returned_quantity'])
        _sync_legacy_stock(batch, take)
        entry = next((row for row in traces if row['allocation'] == allocation.pk), None)
        if entry:
            entry['quantity'] = str(_d(entry['quantity']) + take)
        else:
            traces.append({'allocation': allocation.pk, 'batch': batch.pk, 'quantity': str(take), 'unit_cost_afn': str(allocation.unit_cost if allocation.unit_cost is not None else sale_item.unit_cost)})
        remaining -= take
        if remaining <= 0:
            break
    _save_return_trace(return_item, traces)
    return quantity


@transaction.atomic
def update_sale_item_allocations(sale_item, old_quantity, new_quantity):
    from api.models.data.stock import Stock
    if sale_item.stock_id:
        Stock.all_objects.select_for_update().get(pk=sale_item.stock_id)
    diff = _d(new_quantity) - _d(old_quantity)
    if diff > 0:
        allocate_inventory_for_sale_item(sale_item, diff)
    elif diff < 0:
        to_release = -diff
        allocations = list(SaleBatchAllocation.objects.select_for_update().filter(sale_item=sale_item).order_by('-id'))
        if sum((row.quantity - row.returned_quantity for row in allocations), Decimal('0')) < to_release:
            raise ValidationError('Cannot reduce a sale below its returned quantity.')
        for allocation in allocations:
            take = min(allocation.quantity - allocation.returned_quantity, to_release)
            if take <= 0:
                continue
            batch = InventoryBatch.objects.select_for_update().get(pk=allocation.inventory_batch_id)
            batch._inflow_unit_cost = allocation.unit_cost if allocation.unit_cost is not None else sale_item.unit_cost
            batch.remaining_pieces += take
            batch.save(update_fields=['remaining_pieces', 'status'])
            _sync_legacy_stock(batch, take)
            allocation.quantity -= take
            if allocation.quantity == 0:
                allocation.delete()
            else:
                allocation.save(update_fields=['quantity', 'unit_cost'])
            to_release -= take
            if to_release <= 0:
                break
        _refresh_sale_cost(sale_item)


def get_available_batches_for_product(product_id, warehouse_id=None, condition='good'):
    """Get sellable batches for a product ordered by FEFO."""
    qs = InventoryBatch.objects.filter(
        product_id=product_id,
        condition=condition,
    ).filter(sellable_batch_q())

    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    return qs.order_by(F('expire_date').asc(nulls_last=True), 'created_at')


@transaction.atomic
def consume_pieces_from_sale_batches(sale_item, pieces_to_consume, *, return_item=None):
    """Undo a return from its original lots; do not create duplicate sale allocations."""
    from api.models.data.stock import Stock
    if sale_item.stock_id:
        Stock.all_objects.select_for_update().get(pk=sale_item.stock_id)
    quantity = _d(pieces_to_consume)
    if quantity <= 0:
        return
    traces = list(return_item.batch_returns or []) if return_item is not None else []
    if return_item is not None and traces:
        candidates = [(SaleBatchAllocation.objects.select_for_update().get(pk=row['allocation']), _d(row['quantity']), row) for row in reversed(traces)]
    else:
        candidates = [(row, row.returned_quantity, None) for row in SaleBatchAllocation.objects.select_for_update().filter(sale_item=sale_item, returned_quantity__gt=0).order_by('-id')]
    if sum((amount for _, amount, _ in candidates), Decimal('0')) < quantity:
        raise ValidationError('The original returned lots cannot be traced for this quantity.')
    remaining = quantity
    for allocation, returned, trace in candidates:
        take = min(returned, remaining)
        if take <= 0:
            continue
        batch = InventoryBatch.objects.select_for_update().get(pk=allocation.inventory_batch_id)
        if batch.remaining_pieces < take:
            raise ValidationError('Some returned stock has already been sold or moved; this return cannot be reduced or deleted.')
        batch._reversal_unit_cost = allocation.unit_cost if allocation.unit_cost is not None else sale_item.unit_cost
        batch.remaining_pieces -= take
        batch.save(update_fields=['remaining_pieces', 'status'])
        allocation.returned_quantity -= take
        allocation.save(update_fields=['returned_quantity'])
        _sync_legacy_stock(batch, -take)
        if trace is not None:
            trace['quantity'] = str(_d(trace['quantity']) - take)
        remaining -= take
        if remaining <= 0:
            break
    _save_return_trace(return_item, traces)
