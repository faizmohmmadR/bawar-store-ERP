"""AVCO helpers — prefer api.services.costing.avco."""
from api.services.costing.avco import receive_average, cogs_for_delivery  # noqa: F401


def d(value):
    from api.services.uom.conversion import d as _d
    return _d(value)


def receive_raw_stock(stock, quantity, value):
    """Legacy name kept for callers; updates a Stock row via receive_average."""
    new_qty, new_cost = receive_average(stock.piece_amount, stock.buy_price, quantity, value)
    stock.piece_amount = new_qty
    stock.buy_price = new_cost
    stock.save(update_fields=['piece_amount', 'buy_price', 'updated_at'])
    return stock
