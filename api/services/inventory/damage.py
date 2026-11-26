"""Record damaged finished goods from sellable warehouse stock.

Reduces on-hand via TYPE_DAMAGE movements (FEFO across lot balances) and
creates a StockAdjustment audit row so GL posts:
  Dr Stock Adjustments · Cr Inventory
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.services.inventory.engine import (
    _issue_balances,
    _warehouse_average_cost,
    _warehouse_on_hand,
    get_default_warehouse,
    post_movement,
)
from api.services.uom.conversion import d, packaging_to_base, quantize, snapshot_factor


@transaction.atomic
def record_damaged_stock(
    *,
    product,
    warehouse=None,
    quantity,
    packaging=None,
    base_quantity=None,
    reason: str = '',
    notes: str = '',
    user=None,
    occurred_at=None,
):
    """
    Remove sellable stock as damage.

    Prefer ``packaging`` + ``quantity`` (transaction UOM). ``base_quantity``
    may be passed directly when packaging is unknown.
    """
    from api.models.data.inventory_ledger import InventoryLot, StockMovement
    from api.models.data.stock_adjustment import StockAdjustment

    if product is None:
        raise ValidationError({'product': 'Product is required.'})
    if not getattr(product, 'track_inventory', True):
        raise ValidationError({'product': 'Product does not track inventory.'})

    wh = warehouse or get_default_warehouse()
    if wh is None:
        raise ValidationError({'warehouse': 'Warehouse is required.'})

    when = occurred_at or timezone.now()
    factor = snapshot_factor(packaging) if packaging is not None else Decimal('1')

    if base_quantity is not None:
        needed = abs(quantize(d(base_quantity)))
        txn_qty = quantize(needed / factor) if factor else needed
    else:
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

    if needed <= 0:
        raise ValidationError({'quantity': 'Quantity must be greater than zero.'})

    on_hand = _warehouse_on_hand(product.id, wh.id)
    if (
        needed > on_hand
        and not getattr(product, 'allow_negative_stock', False)
    ):
        raise ValidationError(
            {
                'quantity': (
                    f'Insufficient stock for {product.name}: '
                    f'on hand {on_hand}, requested {needed}.'
                )
            }
        )

    unit_cost = _warehouse_average_cost(product.id, wh.id, product=product)
    reason_text = (reason or notes or '').strip() or 'Damaged product'
    if notes and reason and notes.strip() != reason.strip():
        reason_text = f'{reason.strip()}: {notes.strip()}'

    remaining = needed
    movements = []
    balances = _issue_balances(product.id, wh.id)

    for balance in balances:
        if remaining <= 0:
            break
        take = min(d(balance.quantity_on_hand), remaining)
        if take <= 0:
            continue
        txn_share = quantize(take / needed * txn_qty) if needed else take
        movement = post_movement(
            product=product,
            warehouse=wh,
            movement_type=StockMovement.TYPE_DAMAGE,
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
        if not getattr(product, 'allow_negative_stock', False):
            raise ValidationError(
                {
                    'quantity': (
                        f'Insufficient stock for {product.name}: '
                        f'on hand {on_hand}, requested {needed}.'
                    )
                }
            )
        movement = post_movement(
            product=product,
            warehouse=wh,
            movement_type=StockMovement.TYPE_DAMAGE,
            base_quantity=-remaining,
            packaging=packaging,
            transaction_quantity=-abs(
                quantize(remaining / needed * txn_qty) if needed else remaining
            ),
            conversion_factor=factor,
            unit_cost=unit_cost,
            user=user,
            notes=reason_text,
            occurred_at=when,
            update_avco=False,
        )
        if movement is not None:
            movements.append(movement)
        remaining = Decimal('0')

    qty_before = quantize(on_hand)
    qty_after = quantize(on_hand - needed)
    adjustment = StockAdjustment(
        product=product,
        warehouse=wh,
        adjustment_type=StockAdjustment.ADJUSTMENT_TYPE_DAMAGED,
        unit_cost=unit_cost,
        quantity_before=qty_before,
        quantity_after=qty_after,
        reason=reason_text,
        adjusted_by=user if getattr(user, 'is_authenticated', False) else None,
        adjustment_date=when,
    )
    adjustment.save()

    # Link movements to the adjustment for audit trails.
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
