"""Write off expired / damaged / lost inventory (typically at main warehouse).

Creates StockAdjustment rows so quantity drops and GL posts:
  Dr Stock Adjustments (5070) · Cr Inventory (1100)
"""

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.stock import Stock
from api.models.data.stock_adjustment import StockAdjustment
from api.services.batch_queries import filter_batches_for_stock, on_hand_batch_q

FOUR = Decimal('0.0001')


def _q4(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(FOUR, rounding=ROUND_HALF_UP)


def _on_hand_pieces(stock: Stock) -> Decimal:
    total = InventoryBatch.objects.filter(
        filter_batches_for_stock(
            stock.product, stock.condition),
        on_hand_batch_q(),
    ).aggregate(total=Sum('remaining_pieces'))['total']
    return _q4(total or 0)


def _infer_adjustment_type(*, condition: str, expire_date, adjustment_type: str | None) -> str:
    valid = {c[0] for c in StockAdjustment.ADJUSTMENT_TYPE_CHOICES}
    if adjustment_type in valid and adjustment_type != StockAdjustment.ADJUSTMENT_TYPE_TRANSFER:
        return adjustment_type
    if condition == Stock.CONDITION_DAMAGED:
        return StockAdjustment.ADJUSTMENT_TYPE_DAMAGED
    if expire_date and expire_date < timezone.localdate():
        return StockAdjustment.ADJUSTMENT_TYPE_EXPIRED
    return StockAdjustment.ADJUSTMENT_TYPE_LOST


@transaction.atomic
def write_off_stock(
    *,
    source: Stock | None = None,
    batch: InventoryBatch | None = None,
    piece_amount=None,
    adjustment_type: str | None = None,
    notes: str = '',
    user=None,
) -> dict:
    """
    Remove on-hand pieces via StockAdjustment (write-off / dispose).

    Use at main for expired or damaged goods (including lots returned from
    """
    if batch is None and source is None:
        raise ValidationError(
            {'detail': 'Provide a stock lot or inventory batch.'})

    if batch is not None and source is None:
        source = (
            Stock.objects.select_for_update()
            .filter(
                product_id=batch.product_id,
                condition=batch.condition,
            )
            .first()
        )
    elif source is not None:
        source = Stock.objects.select_for_update().get(pk=source.pk)

    raw_qty = piece_amount
    if raw_qty is None and batch is not None:
        raw_qty = batch.remaining_pieces
    pieces = _q4(raw_qty)
    if pieces <= 0:
        raise ValidationError(
            {'piece_amount': 'Quantity must be greater than zero.'})

    if source is not None:
        from api.services.pooled_stock import ensure_stock_batches
        ensure_stock_batches(source)
        available = _on_hand_pieces(source)
        if batch is not None:
            available = min(available, _q4(batch.remaining_pieces))
    else:
        available = _q4(batch.remaining_pieces)

    if pieces > available:
        raise ValidationError(
            {
                'piece_amount': (
                    f'Not enough stock. Available: {available}, requested: {pieces}.'
                )
            }
        )

    adj_type = _infer_adjustment_type(
        condition=(source.condition if source else batch.condition),
        expire_date=(
            (batch.expire_date if batch is not None else None)
            or (source.expire_date if source else None)
        ),
        adjustment_type=adjustment_type,
    )

    if source is not None:
        batches_qs = (
            InventoryBatch.objects.select_for_update()
            .filter(
                filter_batches_for_stock(
                    source.product, source.condition),
                on_hand_batch_q(),
            )
        )
    else:
        batches_qs = InventoryBatch.objects.select_for_update().filter(pk=batch.pk)

    if batch is not None:
        batches_qs = batches_qs.filter(pk=batch.pk)
        if not batches_qs.exists():
            raise ValidationError(
                {'batch_id': f'Batch {batch.pk} not found or has no stock.'}
            )

    source_batches = batches_qs.order_by(
        F('expire_date').asc(nulls_last=True), 'created_at'
    )

    remaining = pieces
    created: list[StockAdjustment] = []
    reason_text = notes.strip() or f'Write-off ({adj_type})'

    for src_batch in source_batches:
        if remaining <= 0:
            break
        take = min(_q4(src_batch.remaining_pieces), remaining)
        if take <= 0:
            continue

        before = _q4(src_batch.remaining_pieces)
        after = _q4(before - take)
        adj = StockAdjustment(
            inventory_batch=src_batch,
            adjustment_type=adj_type,
            quantity_before=before,
            quantity_after=after,
            reason=reason_text,
            adjusted_by=user if getattr(
                user, 'is_authenticated', False) else None,
        )
        adj.save()
        created.append(adj)
        remaining -= take

    if remaining > 0:
        raise ValidationError(
            {
                'piece_amount': (
                    f'Could not write off full quantity from batches. Short by {remaining}.'
                )
            }
        )

    # Refresh source stock summary if present
    if source is not None:
        source.refresh_from_db()

    return {
        'adjustments': created,
        'piece_amount': pieces,
        'adjustment_type': adj_type,
        'stock': source,
    }
