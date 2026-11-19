"""Packaging and piece-count helpers.

Business rule: 1 carton (کارتن) = 8 pieces by default when product ratio is missing.
Canonical inventory quantity is always stored in pieces.

Packaging capacities:
- bottle.capacity_liters = bottle fill volume (required for packing math)
- plastic/carton.capacity_liters = matching bottle size
- plastic.bottles_per_plastic = bottles per plastic package
- carton.bottles_per_carton = bottles per carton

Suggested packing quantities:
- bottles = pack_liters / bottle_capacity
- plastic = ceil(bottle_count / bottles_per_plastic)
- cartons = ceil(bottle_count / bottles_per_carton)
- label/cap = bottle_count (double label = 2 × bottle_count when selected)
"""
from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN, ROUND_CEILING

PIECES_PER_CARTON = Decimal('8')
ZERO = Decimal('0')
THREE = Decimal('0.001')
FOUR = Decimal('0.0001')


def _d(value) -> Decimal:
    return Decimal(str(value or 0))


def bottles_per_carton(product=None) -> Decimal:
    ratio = _d(getattr(product, 'bottles_per_carton', 0))
    return ratio if ratio > 0 else PIECES_PER_CARTON


def bottles_from_pack_liters(quantity_liters, bottle_capacity_liters) -> Decimal:
    """Whole bottles produced from packed liquid liters."""
    liters = _d(quantity_liters)
    bottle_cap = _d(bottle_capacity_liters)
    if liters <= 0 or bottle_cap <= 0:
        return ZERO
    ratio = liters / bottle_cap
    if ratio != ratio.to_integral_value():
        raise ValueError('Liters must divide evenly into whole bottles at this bottle capacity.')
    return ratio.to_integral_value()


def packing_units_from_capacity(*, quantity_liters, unit_capacity_liters) -> Decimal:
    """Whole packaging units when capacity is liquid volume per unit (bottle)."""
    liters = _d(quantity_liters)
    capacity = _d(unit_capacity_liters)
    if liters <= 0 or capacity <= 0:
        return ZERO
    ratio = liters / capacity
    if ratio != ratio.to_integral_value():
        raise ValueError('Packed liters must divide evenly by the selected material capacity.')
    return ratio.to_integral_value()


def cartons_needed_for_bottles(bottle_count, *, bottles_per_carton_count) -> Decimal:
    """Whole cartons required to hold bottle_count (ceil of partial last carton)."""
    bottles = _d(bottle_count)
    per_carton = _d(bottles_per_carton_count)
    if bottles <= 0 or per_carton <= 0:
        return ZERO
    if per_carton != per_carton.to_integral_value():
        raise ValueError('Bottles per carton must be a whole number.')
    return (bottles / per_carton).to_integral_value(rounding=ROUND_CEILING)


def expected_packing_component_quantities(
    *,
    quantity_liters,
    bottle_capacity_liters=None,
    bottle_capacity_kg=None,
    quantity_kg=None,
    plastic_capacity_liters=None,
    plastic_capacity_kg=None,
    carton_bottle_capacity_liters=None,
    carton_capacity_kg=None,
    bottles_per_carton_count=None,
    bottles_per_plastic_count=None,
    include_cap: bool = False,
    include_cap_label: bool = False,
    include_label: bool = True,
    label_pieces_per_bottle: int = 1,
    include_carton_plastic: bool = False,
) -> dict[str, Decimal]:
    """
    Suggested packaging piece counts for a packing run.

    Bottle count uses volume (L) when bottle is volume-based, otherwise kg.
    Plastic/carton counts use their package ratios independently of capacity.
    Label/carton plastic are optional; double labels use 2 pieces per bottle.
    """
    bottle_liters = _d(bottle_capacity_liters)
    bottle_kg = _d(bottle_capacity_kg)
    if bottle_liters > 0:
        bottle_count = bottles_from_pack_liters(quantity_liters, bottle_liters)
    elif bottle_kg > 0:
        pack_kg = _d(quantity_kg)
        if pack_kg <= 0:
            raise ValueError('Packed kilograms are required for kg-based bottles.')
        ratio = pack_kg / bottle_kg
        if ratio != ratio.to_integral_value():
            raise ValueError('Kilograms must divide evenly into whole bottles at this bottle capacity.')
        bottle_count = ratio.to_integral_value()
    else:
        raise ValueError('Selected bottle must have either a volume or kg capacity.')

    per_plastic = _d(bottles_per_plastic_count)
    plastic_count = (
        cartons_needed_for_bottles(
            bottle_count,
            bottles_per_carton_count=per_plastic,
        )
        if per_plastic > 0 and per_plastic == per_plastic.to_integral_value()
        else bottle_count
    )
    per_carton = _d(bottles_per_carton_count)
    if per_carton > 0 and per_carton == per_carton.to_integral_value():
        carton_count = cartons_needed_for_bottles(
            bottle_count,
            bottles_per_carton_count=per_carton,
        )
    else:
        carton_count = Decimal('1') if bottle_count > 0 else Decimal('0')
    quantities = {
        'bottle': bottle_count,
        'plastic': plastic_count,
        'carton': carton_count,
    }
    if include_label:
        per_bottle = max(1, int(label_pieces_per_bottle or 1))
        quantities['label'] = bottle_count * Decimal(per_bottle)
    if include_cap:
        quantities['cap'] = bottle_count
    if include_cap_label:
        quantities['cap_label'] = bottle_count
    if include_carton_plastic:
        quantities['carton_plastic'] = carton_count
    return quantities


def pieces_from_units(quantity, unit: str, carton_size=PIECES_PER_CARTON) -> Decimal:
    """Convert carton or piece-like unit quantity to total finished pieces.

    Piece-like units (bottle, plastic, dana, piece) are 1:1 with packed bottles.
    """
    qty = _d(quantity)
    if qty <= 0:
        return ZERO
    unit = (unit or 'piece').lower()
    if unit == 'carton':
        return (qty * _d(carton_size)).quantize(FOUR, rounding=ROUND_HALF_UP)
    # bottle / plastic / dana / piece are canonical piece units for packed stock
    return qty.quantize(FOUR, rounding=ROUND_HALF_UP)


def kilograms_per_bottle(product) -> Decimal:
    """Return the configured liquid mass of one finished bottle."""
    mass = _d(getattr(product, 'bottle_capacity_kg', None))
    if mass > 0:
        return mass
    capacity = _d(getattr(product, 'bottle_capacity_liters', None))
    density = _d(getattr(product, 'density_kg_per_liter', None))
    if capacity <= 0 or density <= 0:
        return ZERO
    return (capacity * density).quantize(FOUR, rounding=ROUND_HALF_UP)


def pieces_from_kilograms(quantity_kg, product) -> Decimal:
    """Convert a mass-based packed-stock sale into equivalent bottles."""
    kilograms = _d(quantity_kg)
    per_bottle = kilograms_per_bottle(product)
    if kilograms <= 0 or per_bottle <= 0:
        return ZERO
    return (kilograms / per_bottle).quantize(FOUR, rounding=ROUND_HALF_UP)


def kilograms_from_pieces(piece_amount, product) -> Decimal:
    """Convert finished bottles to their liquid mass."""
    return (_d(piece_amount) * kilograms_per_bottle(product)).quantize(
        FOUR, rounding=ROUND_HALF_UP,
    )


# Legacy alias used by older call sites
dana_from_units = pieces_from_units


def cartons_from_pieces(piece_amount, carton_size=PIECES_PER_CARTON) -> Decimal:
    """Full cartons contained in a pieces total (floor)."""
    pieces = _d(piece_amount)
    if pieces <= 0:
        return ZERO
    size = _d(carton_size)
    return (pieces / size).to_integral_value(rounding=ROUND_DOWN) if size > 0 else ZERO


def remainder_pieces(piece_amount, carton_size=PIECES_PER_CARTON) -> Decimal:
    """Loose pieces left after full cartons (0–7)."""
    pieces = _d(piece_amount)
    if pieces <= 0:
        return ZERO
    size = _d(carton_size)
    return (pieces % size).quantize(FOUR, rounding=ROUND_HALF_UP) if size > 0 else pieces


def split_pieces(piece_amount, carton_size=PIECES_PER_CARTON) -> tuple[Decimal, Decimal]:
    """Return (full_cartons, remainder_pieces)."""
    return cartons_from_pieces(piece_amount, carton_size), remainder_pieces(piece_amount, carton_size)


def format_carton_piece(piece_amount, carton_size=PIECES_PER_CARTON) -> str:
    cartons, loose = split_pieces(piece_amount, carton_size)
    return f'{cartons} کارتن + {loose} pieces'


def price_per_piece_from_carton(carton_price, carton_size=PIECES_PER_CARTON) -> Decimal:
    price = _d(carton_price)
    size = _d(carton_size)
    if price <= 0 or size <= 0:
        return ZERO
    return (price / size).quantize(FOUR, rounding=ROUND_HALF_UP)


def price_per_carton_from_piece(piece_price, carton_size=PIECES_PER_CARTON) -> Decimal:
    return (_d(piece_price) * _d(carton_size)).quantize(FOUR, rounding=ROUND_HALF_UP)


def purchase_item_pieces(item) -> Decimal:
    """
    Pieces to add to stock for a purchase line.

    Prefer cartons × 8 when cartons are set; else explicit piece_amount.
    """
    carton_size = bottles_per_carton(getattr(item, 'product', None))
    cartons = _d(getattr(item, 'carton_amount', 0))
    if cartons > 0:
        return (cartons * carton_size).quantize(FOUR, rounding=ROUND_HALF_UP)

    pieces = _d(getattr(item, 'piece_amount', 0))
    if pieces > 0:
        return pieces.quantize(FOUR, rounding=ROUND_HALF_UP)

    return ZERO


def is_tank_fill_sale_item(item) -> bool:
    source = getattr(item, 'sale_source', None) or 'stock'
    unit = (getattr(item, 'unit', None) or '').lower()
    return source == 'tank' or unit == 'liter'


def sales_item_liters(item) -> Decimal:
    """Liters sold on a tank-fill line."""
    if not is_tank_fill_sale_item(item):
        return ZERO
    return _d(getattr(item, 'liter_amount', 0)).quantize(FOUR, rounding=ROUND_HALF_UP)


def sales_item_pieces(item) -> Decimal:
    """
    Inventory quantity for COGS / stock movement.
    - stock lines: pieces (carton/dana)
    - tank lines: liters (used as the quantity unit for unit_cost × qty)
    """
    if is_tank_fill_sale_item(item):
        return sales_item_liters(item)

    unit = getattr(item, 'unit', None) or 'bottle'
    stock = getattr(item, 'stock', None)
    product = getattr(stock, 'product', None)
    carton_size = Decimal('1') if getattr(product, 'is_piece_stock', False) else bottles_per_carton(product)
    if unit == 'kg' and stock is not None:
        return pieces_from_kilograms(
            getattr(item, 'quantity', 0), stock.product,
        )
    quantity = getattr(item, 'quantity', None)
    if quantity is not None and _d(quantity) > 0:
        return pieces_from_units(quantity, unit, carton_size)

    liters = _d(getattr(item, 'liter_amount', 0))
    if liters > 0:
        return liters.quantize(FOUR, rounding=ROUND_HALF_UP)

    return ZERO


def sales_item_line_total(item) -> Decimal:
    """
    Line total based on unit type:
    - unit=carton: price is per carton → (pieces / bottles_per_carton) × price
    - unit=bottle/plastic/dana: price is per piece → pieces × price
    - unit=liter / tank fill: price is per liter → liters × price
    """
    if getattr(getattr(item, 'sales', None), 'is_free', False):
        return ZERO
    price = _d(getattr(item, 'sell_price', 0))
    unit = (getattr(item, 'unit', None) or 'carton').lower()
    if price <= 0:
        return ZERO

    if unit == 'kg':
        quantity = _d(getattr(item, 'quantity', 0))
        return (quantity * price).quantize(FOUR, rounding=ROUND_HALF_UP)
    if is_tank_fill_sale_item(item) or unit == 'liter':
        liters = sales_item_liters(item)
        if liters <= 0:
            return ZERO
        return (liters * price).quantize(FOUR, rounding=ROUND_HALF_UP)

    pieces = sales_item_pieces(item) if hasattr(item, 'quantity') or hasattr(item, 'liter_amount') else (
        _d(getattr(item, 'liter_amount', 0)) or _d(getattr(item, 'quantity', 0))
    )
    if pieces <= 0:
        return ZERO
    if unit == 'carton':
        stock = getattr(item, 'stock', None)
        product = getattr(stock, 'product', None)
        carton_size = Decimal('1') if getattr(product, 'is_piece_stock', False) else bottles_per_carton(product)
        return (pieces / carton_size * price).quantize(FOUR, rounding=ROUND_HALF_UP)
    # bottle / plastic / dana — price per piece
    return (pieces * price).quantize(FOUR, rounding=ROUND_HALF_UP)


def purchase_item_line_total(item) -> Decimal:
    """Buy price is per carton."""
    price = _d(getattr(item, 'buy_price', 0))
    cartons = _d(getattr(item, 'carton_amount', 0))
    return (cartons * price).quantize(FOUR, rounding=ROUND_HALF_UP)


def return_item_restore_pieces(return_item) -> Decimal:
    """Pieces (or tank liters) to restore for a return line."""
    from api.models.data.sales import SalesItems

    sale_item = getattr(return_item, 'sales_item', None)
    if sale_item is None:
        return ZERO
    if sale_item.sale_source == SalesItems.SOURCE_TANK:
        return _d(getattr(return_item, 'liter_amount', 0))
    if sale_item.unit == SalesItems.UNIT_KG:
        quantity_kg = _d(getattr(return_item, 'quantity_kg', 0))
        if quantity_kg <= 0:
            quantity_kg = _d(getattr(return_item, 'liter_amount', 0))
        stock = getattr(sale_item, 'stock', None)
        product = getattr(stock, 'product', None) if stock is not None else None
        if product is not None:
            return pieces_from_kilograms(quantity_kg, product)
        return quantity_kg
    return _d(getattr(return_item, 'liter_amount', 0))


def return_item_line_total(return_item) -> Decimal:
    """
    Return line money aligned with sales_item_line_total:
    - kg: quantity_kg × price
    - liter / tank: liters × price
    - carton: (pieces / bottles_per_carton) × price
    - bottle/plastic/dana: pieces × price
    """
    sale_item = getattr(return_item, 'sales_item', None)
    if sale_item is None:
        return ZERO
    sale = getattr(sale_item, 'sales', None)
    if getattr(sale, 'is_free', False):
        return ZERO

    price = _d(getattr(return_item, 'return_price', 0))
    if price <= 0:
        return ZERO

    unit = (getattr(sale_item, 'unit', None) or 'carton').lower()
    from api.models.data.sales import SalesItems

    if sale_item.sale_source == SalesItems.SOURCE_RAW_MATERIAL:
        quantity = _d(
            getattr(return_item, 'quantity_kg', 0)
            if unit == 'kg'
            else getattr(return_item, 'liter_amount', 0)
        )
        return (quantity * price).quantize(FOUR, rounding=ROUND_HALF_UP)

    if unit == 'kg':
        quantity = _d(getattr(return_item, 'quantity_kg', 0))
        if quantity <= 0:
            quantity = _d(getattr(return_item, 'liter_amount', 0))
        return (quantity * price).quantize(FOUR, rounding=ROUND_HALF_UP)

    if is_tank_fill_sale_item(sale_item) or unit == 'liter':
        liters = _d(getattr(return_item, 'liter_amount', 0))
        if liters <= 0:
            return ZERO
        return (liters * price).quantize(FOUR, rounding=ROUND_HALF_UP)

    pieces = _d(getattr(return_item, 'liter_amount', 0))
    if pieces <= 0:
        return ZERO
    if unit == 'carton':
        stock = getattr(sale_item, 'stock', None)
        product = getattr(stock, 'product', None) if stock is not None else None
        carton_size = Decimal('1') if getattr(product, 'is_piece_stock', False) else bottles_per_carton(product)
        return (pieces / carton_size * price).quantize(FOUR, rounding=ROUND_HALF_UP)
    return (pieces * price).quantize(FOUR, rounding=ROUND_HALF_UP)


def set_stock_pieces(stock, piece_amount) -> None:
    """Set stock quantity in pieces."""
    pieces = max(ZERO, _d(piece_amount)).quantize(THREE, rounding=ROUND_HALF_UP)
    stock.piece_amount = pieces


def decrease_stock_pieces(stock, pieces) -> None:
    pieces = _d(pieces)
    if pieces <= 0:
        return
    current = _d(getattr(stock, 'piece_amount', None) or 0)
    set_stock_pieces(stock, current - pieces)


def increase_stock_pieces(stock, pieces) -> None:
    pieces = _d(pieces)
    if pieces <= 0:
        return
    current = _d(getattr(stock, 'piece_amount', None) or 0)
    set_stock_pieces(stock, current + pieces)


def stock_available_pieces(stock) -> Decimal:
    return _d(getattr(stock, 'piece_amount', None) or 0)
