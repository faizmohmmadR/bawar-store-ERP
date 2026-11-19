"""Move quantity between stock condition lots (e.g. good → damaged).

Moves both legacy Stock rows and InventoryBatch lots so sellable qty,
FEFO, and purchase traceability stay consistent.
"""

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import F, Sum
from rest_framework.exceptions import ValidationError

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.stock import Stock
from api.models.data.stock_transfer import StockTransfer
from api.services.batch_queries import filter_batches_for_stock, on_hand_batch_q
from api.utils.packaging import (
    bottles_per_carton,
    decrease_stock_pieces,
    set_stock_pieces,
)

FOUR = Decimal('0.0001')


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


@transaction.atomic
def move_stock_to_condition(
    *,
    source: Stock,
    target_condition: str,
    piece_amount=None,
    dana_amount=None,
    buy_price=None,
    notes: str = '',
    batch_id: int | None = None,
    user=None,
) -> Stock:
    """
    Move pieces from `source` into a lot with `target_condition`.
    When `batch_id` is given, only that specific batch is consumed.
    """
    source = Stock.objects.select_for_update().get(pk=source.pk)
    from api.services.pooled_stock import ensure_stock_batches
    ensure_stock_batches(source)
    existing_target=Stock.objects.select_for_update().filter(product=source.product,condition=target_condition).first()
    if existing_target:
        ensure_stock_batches(existing_target)
    valid = {c[0] for c in Stock.CONDITION_CHOICES}
    if target_condition not in valid:
        raise ValidationError(
            {'condition': f'Invalid condition: {target_condition}'})

    if source.condition == target_condition:
        raise ValidationError(
            {'condition': 'Source stock is already in the target condition.'}
        )

    raw_qty = piece_amount if piece_amount is not None else dana_amount
    pieces = _q4(raw_qty)
    if pieces <= 0:
        raise ValidationError(
            {'piece_amount': 'Quantity must be greater than zero.'})

    available = _on_hand_pieces(source)
    if pieces > available:
        raise ValidationError(
            {
                'piece_amount': (
                    f'Not enough stock. Available: {available}, requested: {pieces}.'
                )
            }
        )

    dest_price = (
        _q4(buy_price)
        if buy_price is not None and Decimal(str(buy_price or 0)) > 0
        else _q4(source.buy_price)
    )

    source_batches_qs = (
        InventoryBatch.objects.select_for_update()
        .filter(
            filter_batches_for_stock(
                source.product, source.condition),
            on_hand_batch_q(),
        )
    )
    if batch_id:
        source_batches_qs = source_batches_qs.filter(pk=batch_id)
        if not source_batches_qs.exists():
            raise ValidationError(
                {'batch_id': f'Batch {batch_id} not found or has no stock.'})
    source_batches = source_batches_qs.order_by(
        F('expire_date').asc(nulls_last=True), 'created_at')

    remaining = pieces
    moved_expire = None
    moved_value_afn = Decimal('0')
    value_known = True
    primary_source_batch = None
    for batch in source_batches:
        if remaining <= 0:
            break
        take = min(_q4(batch.remaining_pieces), remaining)
        if take <= 0:
            continue

        if primary_source_batch is None:
            primary_source_batch = batch
        if batch.currency != 1 or batch.unit_cost <= 0:
            value_known = False
        else:
            moved_value_afn += take * batch.unit_cost

        batch.remaining_pieces = _q4(batch.remaining_pieces - take)
        if batch.remaining_pieces <= 0:
            batch.status = InventoryBatch.STATUS_EMPTY
        batch._skip_batch_journal = True
        batch.save(update_fields=['remaining_pieces', 'status'])

        dest_batch = InventoryBatch(
            product=batch.product,
            supplier=batch.supplier,
            condition=target_condition,
            cartons_received=take / bottles_per_carton(batch.product),
            pieces_received=take,
            remaining_pieces=take,
            unit_cost=batch.unit_cost or dest_price,
            currency=batch.currency,
            expire_date=batch.expire_date,
            manufacturing_date=batch.manufacturing_date,
            status=InventoryBatch.STATUS_ACTIVE,
            notes=(
                f"Moved from batch {batch.batch_number} "
                f"({source.condition} → {target_condition})"
                + (f": {notes}" if notes else "")
            ),
        )
        # Condition moves reclassify within Inventory; do not post Opening Equity.
        dest_batch._skip_batch_journal = True
        dest_batch.save()

        if batch.expire_date and (
            moved_expire is None or batch.expire_date < moved_expire
        ):
            moved_expire = batch.expire_date

        remaining -= take

    if remaining > 0:
        raise ValidationError(
            {
                'piece_amount': (
                    f'Could not move full quantity from batches. Short by {remaining}.'
                )
            }
        )

    if notes:
        source.notes = ((source.notes or '') + f'\n{notes}').strip()
        source._skip_stock_journal = True
        source.save(update_fields=['notes'])
    _sync_stock_piece_amount(source)

    target = (
        Stock.objects.select_for_update()
        .filter(
            product_id=source.product_id,
            condition=target_condition,
        )
        .first()
    )

    if target:
        old_pieces = _q4(target.piece_amount or 0)
        set_stock_pieces(target, old_pieces + pieces)
        target.buy_price = _weighted_price(
            old_pieces, target.buy_price, pieces, dest_price
        )
        if moved_expire and (
            not target.expire_date or moved_expire < target.expire_date
        ):
            target.expire_date = moved_expire
        if notes:
            target.notes = ((target.notes or '') + f'\n{notes}').strip()
        target.currency = source.currency
        target._skip_stock_journal = True
        target.save()
        _sync_stock_piece_amount(target)
    else:
        target = Stock(
            product_id=source.product_id,
            condition=target_condition,
            buy_price=dest_price,
            currency=source.currency,
            expire_date=moved_expire or source.expire_date,
            notes=notes or '',
        )
        set_stock_pieces(target, pieces)
        target._skip_stock_journal = True
        target.save()
        _sync_stock_piece_amount(target)

    from api.services.document_numbers import allocate_stock_transfer_number
    StockTransfer.objects.create(
        transfer_number=allocate_stock_transfer_number(),
        product=source.product, target_product=target.product,
        condition=source.condition,
        reason=StockTransfer.REASON_DAMAGED if target_condition in {'damaged', 'waste'} else StockTransfer.REASON_OTHER,
        piece_amount=pieces,
        unit_cost=(moved_value_afn / pieces).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        if value_known else Decimal('0'),
        currency=1,
        total_value=moved_value_afn.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        if value_known else Decimal('0'),
        source_stock=source, target_stock=target, source_batch=primary_source_batch,
        notes=f'Condition move {source.condition} → {target_condition}' + (f': {notes}' if notes else ''),
        transferred_by=user if getattr(user, 'is_authenticated', False) else None,
    )
    return target
