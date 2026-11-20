"""Unit and packaging conversion helpers."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from rest_framework.exceptions import ValidationError


def d(value) -> Decimal:
    if value is None:
        return Decimal('0')
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def quantize(value: Decimal, places: int = 6) -> Decimal:
    q = Decimal('1').scaleb(-places)
    return d(value).quantize(q, rounding=ROUND_HALF_UP)


def assert_same_category(uom_a, uom_b, *, allow_product_rule: bool = False):
    """Reject incompatible category conversions unless explicitly allowed."""
    if uom_a is None or uom_b is None:
        return
    if uom_a.category_id != uom_b.category_id and not allow_product_rule:
        raise ValidationError(
            f'Cannot convert {uom_a.code} to {uom_b.code}: incompatible categories.'
        )


def packaging_to_base(quantity, packaging, *, measured_base=None, places: int = 6) -> Decimal:
    """Convert transaction packaging quantity to base UOM quantity."""
    if measured_base is not None:
        base = d(measured_base)
        if base < 0:
            raise ValidationError('Measured base quantity cannot be negative.')
        return quantize(base, places)
    factor = d(getattr(packaging, 'qty_in_base', None) or getattr(packaging, 'conversion_factor', 1))
    if factor <= 0:
        raise ValidationError('Packaging conversion factor must be positive.')
    return quantize(d(quantity) * factor, places)


def base_to_packaging(base_quantity, packaging, *, places: int = 6) -> Decimal:
    factor = d(getattr(packaging, 'qty_in_base', 1))
    if factor <= 0:
        raise ValidationError('Packaging conversion factor must be positive.')
    return quantize(d(base_quantity) / factor, places)


def snapshot_factor(packaging) -> Decimal:
    return quantize(d(getattr(packaging, 'qty_in_base', 1)), 6)
