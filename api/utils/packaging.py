"""
Compatibility helpers formerly used for carton/bottle conversions.

New code should use api.services.uom.conversion and ProductPackaging.qty_in_base.
"""
from decimal import Decimal, ROUND_HALF_UP


def d(value):
    if value is None:
        return Decimal('0')
    return value if isinstance(value, Decimal) else Decimal(str(value))


def bottles_per_carton(product):
    pkg = None
    if product is not None:
        pkg = product.packagings.filter(is_active=True, name__icontains='carton').order_by('-qty_in_base').first()
        if pkg:
            return d(pkg.qty_in_base)
        base = product.packagings.filter(is_base=True).first()
        if base:
            return Decimal('1')
    return Decimal('1')


def cartons_from_pieces(pieces, per_carton):
    per = d(per_carton) or Decimal('1')
    return int(d(pieces) // per)


def remainder_pieces(pieces, per_carton):
    per = d(per_carton) or Decimal('1')
    return d(pieces) % per


def sales_item_pieces(item):
    return d(getattr(item, 'base_quantity', 0) or getattr(item, 'liter_amount', 0) or 0)


def sales_item_line_total(item):
    return (d(item.quantity) * d(item.sell_price)).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)


def return_item_line_total(item):
    return (d(getattr(item, 'quantity', 0) or 0) * d(item.return_price)).quantize(
        Decimal('0.0001'), rounding=ROUND_HALF_UP,
    )


def return_item_restore_pieces(item):
    return d(getattr(item, 'base_quantity', 0) or getattr(item, 'liter_amount', 0) or 0)


def kilograms_from_pieces(pieces, product):
    return d(pieces)
