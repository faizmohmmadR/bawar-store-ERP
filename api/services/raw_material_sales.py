"""Apply / revert raw-material stock for sale lines."""
from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from api.models.data.raw_materials import RawMaterial, RawMaterialStock
from api.models.data.sales import SalesItems

ZERO = Decimal('0')


def _d(value):
    return Decimal(str(value or 0))


def raw_stock_quantity(item):
    """Saved physical quantity in the material's stock unit, independent of sale unit."""
    field = 'kilogram_amount' if item.raw_material_stock.raw_material.unit == 'kg' else 'liter_amount'
    return _d(getattr(item, field, 0)) or _d(item.quantity)


def raw_stock_pieces(item):
    return int(item.piece_count or 0) if item.raw_material_stock.raw_material.unit == 'kg' else 0


def resolve_raw_sale_quantities(stock, unit, quantity, piece_count, previous=None):
    quantity = _d(quantity)
    if unit not in ('kg', 'piece'):
        raise ValidationError({'unit': 'Select kilograms or pieces.'})
    native = stock.raw_material.unit
    if quantity <= 0:
        raise ValidationError({'quantity': 'Enter a quantity greater than zero.'})
    if unit == 'piece' and quantity != quantity.to_integral_value():
        raise ValidationError({'quantity': 'Enter a whole number of pieces.'})
    if native == unit:
        return quantity, int(piece_count or 0) if native == 'kg' else 0
    saved_basis = previous and previous.raw_material_stock_id == stock.pk and previous.quantity > 0
    weight = _d(stock.raw_material.weight_per_piece_kg)
    if native == 'piece':
        if saved_basis and previous.unit == 'kg':
            weight = previous.quantity / raw_stock_quantity(previous)
        if weight > 0:
            pieces = quantity / weight
            # Decimal division of a saved ratio can differ from an integer at the last digit.
            whole = pieces.quantize(Decimal('1'))
            if whole <= 0 or abs(pieces - whole) > Decimal('0.000001'):
                raise ValidationError({'quantity': 'The entered kilograms must correspond to whole pieces using the saved piece weight.'})
            return whole, 0
        if int(piece_count or 0) > 0:
            # Compatibility for existing clients which recorded a measured piece count.
            return _d(piece_count), 0
        raise ValidationError({'unit': 'Set the actual piece weight in raw materials before selling this piece stock in kilograms.'})
    if saved_basis and previous.unit == 'piece':
        weight_per_piece = raw_stock_quantity(previous) / previous.quantity
    elif weight > 0:
        weight_per_piece = weight
    elif stock.quantity > 0 and stock.piece_count > 0:
        weight_per_piece = stock.quantity / stock.piece_count
    else:
        raise ValidationError({'unit': 'Set piece weight or record the piece count of this kilogram stock before selling it in pieces.'})
    converted = (quantity * weight_per_piece).quantize(Decimal('0.0001'))
    if converted <= 0:
        raise ValidationError({'quantity': 'The converted weight is below stock precision. Enter more pieces.'})
    tracked = bool(stock.piece_count) if not saved_basis else bool(raw_stock_pieces(previous))
    return converted, int(quantity) if tracked else 0


@transaction.atomic
def adjust_raw_sale_return(item, selected_quantity):
    """Restore (positive) or undo a return (negative) using the sale's physical snapshot."""
    stock = RawMaterialStock.objects.select_for_update().get(pk=item.raw_material_stock_id)
    ratio = _d(selected_quantity) / _d(item.quantity)
    native = raw_stock_quantity(item) * ratio
    pieces = _d(raw_stock_pieces(item)) * ratio
    if pieces != pieces.to_integral_value() or (stock.raw_material.unit == 'piece' and native != native.to_integral_value()):
        raise ValidationError({'quantity': 'The returned quantity must correspond to whole pieces.'})
    native = native.quantize(Decimal('0.0001'))
    if _d(selected_quantity) != 0 and native == 0:
        raise ValidationError({'quantity': 'The converted return quantity is below stock precision.'})
    if stock.quantity + native < 0 or stock.piece_count + int(pieces) < 0:
        raise ValidationError({'quantity': 'Not enough raw stock to reverse this return.'})
    from api.services.weighted_average import receive_raw_stock
    receive_raw_stock(stock, native, native * _d(item.unit_cost), pieces=int(pieces))


@transaction.atomic
def apply_raw_material_sale_item(item, *, previous_quantity=None, previous_piece_count=None):
    """
    Deduct raw-material stock for a sale line.

    previous_* = amounts already deducted before this edit (omit on create).
    """
    if item.sale_source != SalesItems.SOURCE_RAW_MATERIAL:
        return
    if not item.raw_material_stock_id:
        raise ValidationError({'raw_material_stock': 'Select a raw material for this sale line.'})

    stock = RawMaterialStock.objects.select_for_update().select_related(
        'raw_material',
    ).get(pk=item.raw_material_stock_id)
    material = stock.raw_material

    new_qty = raw_stock_quantity(item)
    new_pieces = raw_stock_pieces(item)
    if new_qty <= 0:
        raise ValidationError({'quantity': 'Enter a quantity greater than zero.'})
    if material.unit == RawMaterial.UNIT_PIECE and new_pieces:
        raise ValidationError({
            'piece_count': 'Extra package counts are only used for kilogram raw materials.',
        })

    old_qty = _d(previous_quantity) if previous_quantity is not None else ZERO
    old_pieces = int(previous_piece_count or 0) if previous_piece_count is not None else 0
    qty_delta = new_qty - old_qty
    piece_delta = new_pieces - old_pieces

    if qty_delta == 0 and piece_delta == 0:
        return

    if qty_delta > 0 and stock.quantity < qty_delta:
        raise ValidationError({
            'quantity': (
                f'Insufficient stock for {material.name}: '
                f'{stock.quantity} {material.unit} available, {qty_delta} required.'
            )
        })
    if piece_delta > 0 and stock.piece_count < piece_delta:
        raise ValidationError({
            'piece_count': (
                f'Insufficient package count for {material.name}: '
                f'{stock.piece_count} available, {piece_delta} required.'
            )
        })

    from api.services.weighted_average import raw_stock_unit_cost, receive_raw_stock, average
    old_cost = _d(item.unit_cost)
    if qty_delta < 0:
        receive_raw_stock(stock, -qty_delta, -qty_delta * old_cost, pieces=-piece_delta)
        return
    current_cost = raw_stock_unit_cost(stock, recover=True)
    if current_cost <= 0 and not stock.zero_cost_allowed:
        raise ValidationError({'raw_material_stock': 'Record the actual stock cost before selling raw materials.'})
    item.unit_cost = average(new_qty, old_qty * old_cost + qty_delta * current_cost)
    item.save(update_fields=['unit_cost'])
    stock.quantity -= qty_delta
    stock.piece_count = max(0, stock.piece_count - piece_delta)
    if stock.quantity < 0:
        stock.quantity = ZERO
    stock.save(update_fields=['quantity', 'piece_count', 'updated_at'])


@transaction.atomic
def revert_raw_material_sale_item(item, *, quantity=None, piece_count=None):
    """Restore raw-material stock previously deducted by a sale line."""
    if item.sale_source != SalesItems.SOURCE_RAW_MATERIAL:
        return
    if not item.raw_material_stock_id:
        return

    stock = RawMaterialStock.objects.select_for_update().get(pk=item.raw_material_stock_id)
    restore_qty = _d(quantity) if quantity is not None else raw_stock_quantity(item)
    restore_pieces = int(
        piece_count if piece_count is not None else raw_stock_pieces(item)
    )
    if restore_qty <= 0 and restore_pieces <= 0:
        return
    from api.services.weighted_average import receive_raw_stock
    receive_raw_stock(stock, restore_qty, restore_qty * _d(item.unit_cost), pieces=restore_pieces)
