from decimal import Decimal, ROUND_HALF_UP

ORDER_QUANT = Decimal('0.0001')
RETURN_AMOUNT_QUANT = Decimal('0.01')
RETURN_QTY_QUANT = Decimal('0.001')


def quantize_order_amount(value):
    """Round to 4 decimal places for sales/purchase monetary fields."""
    return Decimal(str(value or 0)).quantize(ORDER_QUANT, rounding=ROUND_HALF_UP)


def quantize_return_amount(value):
    """Round to 2 decimal places for return monetary fields."""
    return Decimal(str(value or 0)).quantize(RETURN_AMOUNT_QUANT, rounding=ROUND_HALF_UP)


def quantize_return_qty(value):
    """Round to 3 decimal places for return quantity fields."""
    return Decimal(str(value or 0)).quantize(RETURN_QTY_QUANT, rounding=ROUND_HALF_UP)
