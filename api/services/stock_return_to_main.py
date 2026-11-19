
"""
Stock return operations: moving stock from secondary locations (damaged/waste bins)
inventory transfer journals (no P&L write-off).
"""

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.stock import Stock
from api.models.data.stock_transfer import StockTransfer
from api.services.batch_queries import filter_batches_for_stock, on_hand_batch_q
from api.utils.packaging import bottles_per_carton, set_stock_pieces

TWOPLACES = Decimal('0.01')
FOUR = Decimal('0.0001')


def _q2(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def _q4(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(FOUR, rounding=ROUND_HALF_UP)


def _weighted_price(existing_pieces, existing_price, added_pieces, added_price):
    total = existing_pieces + added_pieces
    if total <= 0:
        return _q4(added_price)
    if existing_pieces <= 0:
        return _q4(added_price)
    return _q4(
        (existing_pieces * existing_price + added_pieces * added_price) / total
    )


def _on_hand_pieces(stock: Stock) -> Decimal:
    total = InventoryBatch.objects.filter(
        filter_batches_for_stock(
            stock.product, stock.condition),
        on_hand_batch_q(),
    ).aggregate(total=Sum('remaining_pieces'))['total']
    return _q4(total or 0)


def _sync_stock_piece_amount(stock: Stock) -> None:
    from api.services.stock_valuation import sync_stock_valuation
    sync_stock_valuation(stock)


def _infer_reason(*, condition: str, expire_date, reason: str | None) -> str:
    if reason in {
        StockTransfer.REASON_EXPIRED,
        StockTransfer.REASON_DAMAGED,
        StockTransfer.REASON_OTHER,
    }:
        return reason
    if condition == Stock.CONDITION_DAMAGED:
        return StockTransfer.REASON_DAMAGED
    if expire_date and expire_date < timezone.localdate():
        return StockTransfer.REASON_EXPIRED
    return StockTransfer.REASON_OTHER


def _dest_batch_status(*, expire_date, remaining) -> str:
    """Match condition-move conventions: condition carries damage; status is active/expired."""
    if remaining <= 0:
        return InventoryBatch.STATUS_EMPTY
    if expire_date and expire_date < timezone.localdate():
        return InventoryBatch.STATUS_EXPIRED
    return InventoryBatch.STATUS_ACTIVE


@transaction.atomic
def return_stock_to_main(
    *,
    source: Stock | None = None,
    batch: InventoryBatch | None = None,
    piece_amount=None,
    notes: str = '',
    reason: str | None = None,
    user=None,
) -> tuple[StockTransfer, Stock]:
    """

    Provide either `source` (Stock lot) and optional `batch`, or a single `batch`.
    Condition (good/damaged/waste) is preserved so main receives the same lot type.
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
        if source is None:
            raise ValidationError(
                {
                    'detail': (
                        'No stock lot found for this batch. '
                        'Cannot return to main without a source lot.'
                    )
                }
            )
    else:
        source = Stock.objects.select_for_update().get(pk=source.pk)

    raw_qty = piece_amount
    if raw_qty is None and batch is not None:
        raw_qty = batch.remaining_pieces
    pieces = _q4(raw_qty)
    if pieces <= 0:
        raise ValidationError(
            {'piece_amount': 'Quantity must be greater than zero.'})

    available = _on_hand_pieces(source)
    if batch is not None:
        available = min(available, _q4(batch.remaining_pieces))
    if pieces > available:
        raise ValidationError(
            {
                'piece_amount': (
                    f'Not enough stock. Available: {available}, requested: {pieces}.'
                )
            }
        )

    target_product = source.product

    from api.services.pooled_stock import ensure_stock_batches
    ensure_stock_batches(source)
    existing_target=Stock.objects.select_for_update().filter(product=target_product,condition=source.condition).first()
    if existing_target:
        ensure_stock_batches(existing_target)
    source_batches_qs = (
        InventoryBatch.objects.select_for_update()
        .filter(
            filter_batches_for_stock(
                source.product, source.condition),
            on_hand_batch_q(),
        )
    )
    if batch is not None:
        source_batches_qs = source_batches_qs.filter(pk=batch.pk)
        if not source_batches_qs.exists():
            raise ValidationError(
                {'batch_id': f'Batch {batch.pk} not found or has no stock.'}
            )
    source_batches = source_batches_qs.order_by(
        F('expire_date').asc(nulls_last=True), 'created_at'
    )

    remaining = pieces
    moved_expire = None
    value_total = Decimal('0')
    cost_pieces = Decimal('0')
    primary_source_batch = None
    dest_batches: list[InventoryBatch] = []

    for src_batch in source_batches:
        if remaining <= 0:
            break
        take = min(_q4(src_batch.remaining_pieces), remaining)
        if take <= 0:
            continue

        if primary_source_batch is None:
            primary_source_batch = src_batch

        unit_cost = Decimal(str(src_batch.unit_cost or source.buy_price)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        value_total += take * unit_cost
        cost_pieces += take

        src_batch.remaining_pieces = _q4(src_batch.remaining_pieces - take)
        if src_batch.remaining_pieces <= 0:
            src_batch.status = InventoryBatch.STATUS_EMPTY
        src_batch._skip_batch_journal = True
        src_batch.save(update_fields=['remaining_pieces', 'status'])

        dest_status = _dest_batch_status(
            expire_date=src_batch.expire_date,
            remaining=take,
        )
        note_parts = [
            f'Returned to main from batch {src_batch.batch_number}',
        ]
        if notes:
            note_parts.append(notes)

        dest_batch = InventoryBatch(
            product=target_product,
            supplier=src_batch.supplier,
            condition=source.condition,
            cartons_received=take / bottles_per_carton(src_batch.product),
            pieces_received=take,
            remaining_pieces=take,
            unit_cost=unit_cost,
            currency=src_batch.currency,
            expire_date=src_batch.expire_date,
            manufacturing_date=src_batch.manufacturing_date,
            status=dest_status,
            notes=' '.join(note_parts),
        )
        dest_batch._skip_batch_journal = True
        dest_batch.save()
        dest_batches.append(dest_batch)

        if src_batch.expire_date and (
            moved_expire is None or src_batch.expire_date < moved_expire
        ):
            moved_expire = src_batch.expire_date

        remaining -= take

    if remaining > 0:
        raise ValidationError(
            {
                'piece_amount': (
                    f'Could not move full quantity from batches. Short by {remaining}.'
                )
            }
        )

    avg_unit_cost = _q4(
        value_total / cost_pieces) if cost_pieces > 0 else _q4(source.buy_price)
    transfer_reason = _infer_reason(
        condition=source.condition,
        expire_date=moved_expire or source.expire_date,
        reason=reason,
    )

    if notes:
        source.notes = ((source.notes or '') +
                        f'\nReturn to main: {notes}').strip()
        source._skip_stock_journal = True
        source.save(update_fields=['notes'])
    _sync_stock_piece_amount(source)

    target = (
        Stock.objects.select_for_update()
        .filter(
            product_id=target_product.pk,
            condition=source.condition,
        )
        .first()
    )

    receive_note = (
        f'Received from source ({transfer_reason})'
        + (f': {notes}' if notes else '')
    )

    if target:
        old_pieces = _q4(target.piece_amount or 0)
        set_stock_pieces(target, old_pieces + pieces)
        target.buy_price = _weighted_price(
            old_pieces, target.buy_price, pieces, avg_unit_cost
        )
        if moved_expire and (
            not target.expire_date or moved_expire < target.expire_date
        ):
            target.expire_date = moved_expire
        target.notes = ((target.notes or '') + f'\n{receive_note}').strip()
        target.currency = source.currency
        target._skip_stock_journal = True
        target.save()
        _sync_stock_piece_amount(target)
    else:
        target = Stock(
            product_id=target_product.pk,
            condition=source.condition,
            buy_price=avg_unit_cost,
            currency=source.currency,
            expire_date=moved_expire or source.expire_date,
            notes=receive_note,
        )
        set_stock_pieces(target, pieces)
        target._skip_stock_journal = True
        target.save()

    from api.services.document_numbers import allocate_stock_transfer_number

    transfer_number = allocate_stock_transfer_number()

    transfer = StockTransfer(
        transfer_number=transfer_number,
        product_id=source.product_id,
        target_product_id=target_product.pk,
        condition=source.condition,
        reason=transfer_reason,
        piece_amount=pieces,
        unit_cost=avg_unit_cost,
        currency=source.currency,
        total_value=_q2(value_total),
        notes=notes or '',
        source_stock=source,
        target_stock=target,
        source_batch=primary_source_batch,
        transferred_by=user if getattr(
            user, 'is_authenticated', False) else None,
    )
    transfer.save()
    _sync_stock_piece_amount(target)
    return transfer, target
