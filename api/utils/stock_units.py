from decimal import Decimal, ROUND_HALF_UP

DEFAULT_LITERS_PER_TON = Decimal('1000')
TWOPLACES = Decimal('0.01')
THREEPLACES = Decimal('0.001')
FOURPLACES = Decimal('0.0001')


def _d(value):
    return Decimal(str(value or 0))


def _quantize_money(value):
    return _d(value).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def tons_from_liters(liter_amount, liters_per_ton=None):
    """Display-only: convert stored liters to metric tons."""
    liters = _d(liter_amount)
    rate = _d(liters_per_ton or DEFAULT_LITERS_PER_TON)
    if liters <= 0 or rate <= 0:
        return Decimal('0')
    return (liters / rate).quantize(FOURPLACES, rounding=ROUND_HALF_UP)


def purchase_item_liters(item):
    """
    Liters to move in stock for a purchase line.

    Uses liter_amount from the purchase item; falls back to ton_amount × 1000.
    """
    liter_amount = _d(getattr(item, 'liter_amount', 0))
    if liter_amount > 0:
        return liter_amount.quantize(FOURPLACES, rounding=ROUND_HALF_UP)

    ton_amount = _d(getattr(item, 'ton_amount', 0))
    if ton_amount > 0:
        return (ton_amount * DEFAULT_LITERS_PER_TON).quantize(FOURPLACES, rounding=ROUND_HALF_UP)

    return Decimal('0')


def purchase_item_buy_price_per_liter(item):
    """
    Purchase line buy_price is per metric ton (in purchase currency).
    Stock stores per-liter buy price.
    """
    buy_price_ton = _d(getattr(item, 'buy_price', 0))
    if buy_price_ton <= 0:
        return Decimal('0')

    liter_amount = purchase_item_liters(item)
    ton_amount = _d(getattr(item, 'ton_amount', 0))

    if liter_amount > 0 and ton_amount > 0:
        return _quantize_money((ton_amount * buy_price_ton) / liter_amount)

    return _quantize_money(buy_price_ton / DEFAULT_LITERS_PER_TON)


def purchase_item_liter_buy_price_afn(item, purchase):
    """Per-liter buy price in base currency (AFN) for stock valuation."""
    from api.services.currency_conversion import normalize_stock_buy_price

    per_liter = purchase_item_buy_price_per_liter(item)
    return normalize_stock_buy_price(
        per_liter,
        purchase.currency,
        purchase.purchase_date,
    )


def decrease_stock_liters(stock, liters):
    """
    Reduce stock liters and clamp at zero.

    Stock rows are never deleted here because SalesItems.stock uses PROTECT.
    """
    liters = _d(liters)
    if liters <= 0:
        return
    current = _d(stock.liter_amount)
    stock.liter_amount = max(Decimal('0'), current - liters).quantize(
        THREEPLACES,
        rounding=ROUND_HALF_UP,
    )
