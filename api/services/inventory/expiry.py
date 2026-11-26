"""Write off expired finished-goods lots (FEFO-aware).

Reduces on-hand via TYPE_EXPIRY movements and creates a StockAdjustment
(type=expired) for GL:
  Dr Stock Adjustments · Cr Inventory
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.services.inventory.engine import (
    _warehouse_average_cost,
    get_default_warehouse,
    post_movement,
)
from api.services.uom.conversion import d, packaging_to_base, quantize, snapshot_factor


ZERO = Decimal('0')


def _expired_balances(*, product_id=None, warehouse_id=None, lot_id=None, today=None):
    from api.models.data.inventory_ledger import InventoryBalance

    today = today or timezone.localdate()
    qs = (
        InventoryBalance.objects.select_for_update()
        .filter(
            quantity_on_hand__gt=0,
            lot__isnull=False,
            lot__expiry_date__lt=today,
        )
        .select_related('product', 'warehouse', 'lot')
        .order_by('lot__expiry_date', 'id')
    )
    if product_id:
        qs = qs.filter(product_id=product_id)
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    if lot_id:
        qs = qs.filter(lot_id=lot_id)
    return list(qs)


@transaction.atomic
def record_expired_stock(
    *,
    product=None,
    warehouse=None,
    lot=None,
    quantity=None,
    packaging=None,
    base_quantity=None,
    reason: str = '',
    notes: str = '',
    user=None,
    occurred_at=None,
    as_of=None,
):
    """
    Write off expired lot stock.

    - If ``lot`` is set: only that lot (must be expired and on hand).
    - Else: consume from expired lots for product×warehouse (FEFO among expired).
    """
    from api.models.data.inventory_ledger import InventoryLot, StockMovement
    from api.models.data.stock_adjustment import StockAdjustment

    today = as_of or timezone.localdate()
    when = occurred_at or timezone.now()
    wh = warehouse or (lot.warehouse if lot is not None else None) or get_default_warehouse()
    prod = product or (lot.product if lot is not None else None)
    if prod is None:
        raise ValidationError({'product': 'Product is required.'})
    if wh is None:
        raise ValidationError({'warehouse': 'Warehouse is required.'})

    factor = snapshot_factor(packaging) if packaging is not None else Decimal('1')
    if base_quantity is not None:
        needed = abs(quantize(d(base_quantity)))
        txn_qty = quantize(needed / factor) if factor else needed
    elif quantity is not None:
        qty = abs(d(quantity))
        if qty <= 0:
            raise ValidationError({'quantity': 'Quantity must be greater than zero.'})
        if packaging is not None:
            needed = abs(packaging_to_base(qty, packaging))
            txn_qty = qty
            factor = snapshot_factor(packaging)
        else:
            needed = quantize(qty)
            txn_qty = needed
    else:
        # Full write-off of matching expired balances.
        needed = None
        txn_qty = None

    balances = _expired_balances(
        product_id=prod.id,
        warehouse_id=wh.id,
        lot_id=getattr(lot, 'id', None),
        today=today,
    )
    if not balances:
        raise ValidationError(
            {'detail': 'No expired on-hand stock found for this product/warehouse.'}
        )

    available = sum((d(b.quantity_on_hand) for b in balances), ZERO)
    if needed is None:
        needed = available
        txn_qty = needed
    if needed <= 0:
        raise ValidationError({'quantity': 'Quantity must be greater than zero.'})
    if needed > available:
        raise ValidationError(
            {
                'quantity': (
                    f'Not enough expired stock: on hand {available}, '
                    f'requested {needed}.'
                )
            }
        )

    unit_cost = _warehouse_average_cost(prod.id, wh.id, product=prod)
    reason_text = (reason or notes or '').strip() or 'Expired product write-off'
    if notes and reason and notes.strip() != reason.strip():
        reason_text = f'{reason.strip()}: {notes.strip()}'

    remaining = needed
    movements = []
    for balance in balances:
        if remaining <= 0:
            break
        take = min(d(balance.quantity_on_hand), remaining)
        if take <= 0:
            continue
        txn_share = quantize(take / needed * txn_qty) if needed else take
        movement = post_movement(
            product=prod,
            warehouse=wh,
            movement_type=StockMovement.TYPE_EXPIRY,
            base_quantity=-take,
            packaging=packaging,
            transaction_quantity=-abs(txn_share),
            conversion_factor=factor,
            unit_cost=unit_cost,
            lot=balance.lot,
            user=user,
            notes=reason_text,
            occurred_at=when,
            update_avco=False,
        )
        if movement is not None:
            movements.append(movement)
        if balance.lot_id:
            InventoryLot.objects.filter(pk=balance.lot_id).update(
                quantity_remaining=F('quantity_remaining') - take,
            )
        remaining -= take

    if remaining > 0:
        raise ValidationError(
            {'quantity': f'Could not write off full expired quantity. Short by {remaining}.'}
        )

    on_hand_before = available  # expired pool available before write-off
    adjustment = StockAdjustment(
        product=prod,
        warehouse=wh,
        inventory_batch=None,
        adjustment_type=StockAdjustment.ADJUSTMENT_TYPE_EXPIRED,
        unit_cost=unit_cost,
        quantity_before=on_hand_before,
        quantity_after=quantize(on_hand_before - needed),
        reason=reason_text,
        adjusted_by=user if getattr(user, 'is_authenticated', False) else None,
        adjustment_date=when,
    )
    adjustment.save()

    if movements:
        from django.contrib.contenttypes.models import ContentType

        ct = ContentType.objects.get_for_model(adjustment, for_concrete_model=False)
        StockMovement.objects.filter(pk__in=[m.pk for m in movements]).update(
            content_type=ct,
            object_id=adjustment.pk,
        )

    return {
        'adjustment': adjustment,
        'movements': movements,
        'base_quantity': needed,
        'unit_cost': unit_cost,
        'loss_value': quantize(needed * unit_cost),
    }
