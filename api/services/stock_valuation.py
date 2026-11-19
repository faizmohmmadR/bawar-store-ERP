"""Remaining-lot valuation shared by stock displays and inventory movements."""
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from api.models.data.inventory_batch import InventoryBatch

FOUR = Decimal('0.000001')


def stock_valuation(stock, *, batches=None):
    lots = list(batches) if batches is not None else list(InventoryBatch.objects.filter(
        product_id=stock.product_id, condition=stock.condition,
    ))
    on_hand = [lot for lot in lots if lot.status in ('active', 'expired') and lot.remaining_pieces > 0]
    if not lots:
        quantity = Decimal(str(stock.piece_amount or 0))
        cost = Decimal(str(stock.buy_price or 0))
        return dict(quantity=quantity, available=quantity, value=quantity * cost, average=cost,
                    batch_count=0, price_count=0, min_cost=cost, max_cost=cost, last_cost=cost)
    quantity = sum((lot.remaining_pieces for lot in on_hand), Decimal('0'))
    raw_value = sum((lot.remaining_pieces * lot.unit_cost for lot in on_hand), Decimal('0'))
    value = raw_value.quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
    available = sum((lot.remaining_pieces for lot in on_hand if lot.status == 'active' and (
        lot.expire_date is None or lot.expire_date >= timezone.localdate()
    )), Decimal('0'))
    prices = {lot.unit_cost for lot in on_hand}
    latest = max(lots, key=lambda lot: (lot.created_at, lot.pk))
    return dict(quantity=quantity, available=available, value=value,
                average=raw_value / quantity if quantity else Decimal('0'), batch_count=len(on_hand),
                price_count=len(prices), min_cost=min(prices, default=Decimal('0')),
                max_cost=max(prices, default=Decimal('0')), last_cost=latest.receipt_unit_cost if latest.receipt_unit_cost is not None else latest.unit_cost)


def sync_stock_valuation(stock):
    """Refresh the stock cache without changing lots or posting a manual adjustment."""
    from api.models.data.stock import Stock
    summary = stock_valuation(stock)
    stock.piece_amount = summary['quantity']
    stock.buy_price = summary['average'].quantize(FOUR, rounding=ROUND_HALF_UP)
    stock.currency = 1
    Stock.objects.filter(pk=stock.pk).update(
        piece_amount=stock.piece_amount, buy_price=stock.buy_price, currency=1,
    )
    return summary
