"""
Batch inventory service — manages InventoryBatch creation and updates.

Used for manual stock entry and packing/production lots (FEFO tracking).
"""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.stock import Stock
from api.services.currency_conversion import normalize_stock_buy_price
from api.utils.packaging import bottles_per_carton

FOUR = Decimal('0.0001')
TWO = Decimal('0.01')


def _q(value, places=FOUR):
    return Decimal(str(value or 0)).quantize(places, rounding=ROUND_HALF_UP)


def _batch_total_for_stock(product, condition):
    return _q(
        InventoryBatch.objects.filter(
            product=product,
            condition=condition,
            remaining_pieces__gt=0,
        ).aggregate(t=Sum('remaining_pieces'))['t'] or 0
    )


def _sync_legacy_stock(batch):
    """Recalculate Stock.piece_amount from the sum of all on-hand batches."""
    total = _batch_total_for_stock(batch.product, batch.condition)
    stock, created = Stock.objects.select_for_update().get_or_create(
        product=batch.product,
        condition=batch.condition,
        defaults={
            'piece_amount': Decimal('0'),
            'buy_price': batch.unit_cost,
            'currency': batch.currency,
            'expire_date': batch.expire_date,
        },
    )
    stock.piece_amount = total
    stock._skip_stock_journal = True
    update_fields = ['piece_amount']
    if created:
        update_fields.extend(['buy_price', 'currency', 'expire_date'])
    stock.save(update_fields=update_fields)


MANUAL_STOCK_NOTE = 'Manual stock entry'
MANUAL_STOCK_INFLOW_NOTE = 'Manual stock inflow'


def _manual_batch_qs(product, condition):
    return InventoryBatch.objects.filter(
        product=product,
        condition=condition,
        notes__in=[MANUAL_STOCK_NOTE, MANUAL_STOCK_INFLOW_NOTE],
    )


@transaction.atomic
def sync_manual_stock_batch(stock, *, pieces=None, expire_date=None, previous_pieces=None, user=None):
    """
    Apply a stock count: append inflow lots for increases and record traceable
    manual adjustments against existing on-hand lots for decreases.
    """
    from django.utils import timezone
    from api.services.stock_valuation import sync_stock_valuation

    pieces = _q(pieces if pieces is not None else stock.piece_amount or 0)
    if pieces < 0:
        pieces = Decimal('0')
    prev = _q(previous_pieces) if previous_pieces is not None else None

    expire = expire_date if expire_date is not None else stock.expire_date
    unit_cost_afn, _ = normalize_stock_buy_price(
        stock.buy_price or 0,
        stock.currency or BASE_CURRENCY_ID,
        raise_if_missing=False,
    )
    bpc = bottles_per_carton(stock.product)

    if prev is not None and pieces < prev:
        from api.services.stock_write_off import write_off_stock
        from api.models.data.stock_adjustment import StockAdjustment
        # Historical direct stock can exist without lots. Establish its original
        # opening quantity without posting another opening-inventory journal.
        if not InventoryBatch.objects.filter(product=stock.product, condition=stock.condition).exists():
            batch = InventoryBatch(product=stock.product, condition=stock.condition,
                pieces_received=prev, remaining_pieces=prev, unit_cost=_q(unit_cost_afn, Decimal('0.000001')),
                currency=BASE_CURRENCY_ID, expire_date=expire, notes=MANUAL_STOCK_NOTE)
            batch._skip_batch_journal = True
            batch.save()
        write_off_stock(source=stock, piece_amount=prev - pieces,
            adjustment_type=StockAdjustment.ADJUSTMENT_TYPE_MANUAL,
            notes='Manual stock count correction' + (f': {stock.notes}' if stock.notes else ''), user=user)
        sync_stock_valuation(stock)
        return None

    # Edit: quantity unchanged — update expiry/cost on manual lots only.
    if prev is not None and pieces == prev:
        for manual in _manual_batch_qs(stock.product, stock.condition):
            manual.expire_date = expire
            if manual.remaining_pieces > 0:
                if expire and expire < timezone.localdate():
                    manual.status = InventoryBatch.STATUS_EXPIRED
                elif manual.status == InventoryBatch.STATUS_EXPIRED:
                    manual.status = InventoryBatch.STATUS_ACTIVE
            manual.save()
        InventoryBatch.objects.filter(product=stock.product, condition=stock.condition, status__in=['active','expired'], remaining_pieces__gt=0).update(unit_cost=_q(unit_cost_afn, Decimal('0.000001')))
        sync_stock_valuation(stock)
        return _manual_batch_qs(stock.product, stock.condition).order_by('id').first()

    # Edit: additional inflow — new FEFO lot for the delta (never shrink lots here).
    if prev is not None and pieces > prev:
        delta = pieces - prev
        batch = InventoryBatch(
            product=stock.product,
            supplier=None,
            condition=stock.condition,
            cartons_received=delta / bpc if delta else Decimal('0'),
            pieces_received=delta,
            remaining_pieces=delta,
            unit_cost=_q(unit_cost_afn, Decimal('0.000001')),
            currency=BASE_CURRENCY_ID,
            expire_date=expire,
            status=InventoryBatch.STATUS_ACTIVE,
            notes=MANUAL_STOCK_INFLOW_NOTE,
        )
        if expire and expire < timezone.localdate():
            batch.status = InventoryBatch.STATUS_EXPIRED
        batch.save()
        sync_stock_valuation(stock)
        return batch

    # Create (or legacy path without previous_pieces): one manual lot for the full qty.
    manual = _manual_batch_qs(stock.product, stock.condition).order_by('id').first()

    if manual and prev is None:
        manual.pieces_received = pieces
        manual.cartons_received = pieces / bpc if pieces else Decimal('0')
        manual.remaining_pieces = pieces
        manual.unit_cost = _q(unit_cost_afn, Decimal('0.000001'))
        manual.currency = BASE_CURRENCY_ID
        manual.expire_date = expire
        if pieces <= 0:
            manual.status = InventoryBatch.STATUS_EMPTY
        elif expire and expire < timezone.localdate():
            manual.status = InventoryBatch.STATUS_EXPIRED
        else:
            manual.status = InventoryBatch.STATUS_ACTIVE
        manual.save()
        sync_stock_valuation(stock)
        return manual

    if pieces <= 0:
        return None

    batch = InventoryBatch(
        product=stock.product,
        supplier=None,
        condition=stock.condition,
        cartons_received=pieces / bpc,
        pieces_received=pieces,
        remaining_pieces=pieces,
        unit_cost=_q(unit_cost_afn, Decimal('0.000001')),
        currency=BASE_CURRENCY_ID,
        expire_date=expire,
        status=InventoryBatch.STATUS_ACTIVE,
        notes=MANUAL_STOCK_NOTE,
    )
    batch.save()
    sync_stock_valuation(stock)
    return batch
