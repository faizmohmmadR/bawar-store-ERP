"""Piece-based stock keyed by the exact selected packaging raw material."""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from rest_framework.exceptions import ValidationError

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.products import Product
from api.models.data.raw_materials import RawMaterial
from api.models.data.stock import Stock

FOUR = Decimal('0.000001')
SIX = Decimal('0.000001')
PACKAGING_TYPES = {'bottle', 'bottle_with_cap', 'carton', 'plastic'}


def quantize(value, places=FOUR):
    return Decimal(str(value or 0)).quantize(places, rounding=ROUND_HALF_UP)


def selected_output_costs(rows, total_cost):
    """Allocate section value once across its explicitly selected outputs."""
    if not rows:
        return {}
    weights = [max(Decimal(str(row['cost'])), Decimal('0')) for row in rows]
    if not sum(weights):
        weights = [Decimal(str(row['quantity'])) for row in rows]
    total_weight = sum(weights)
    remaining = quantize(total_cost, Decimal('0.0001'))
    result = {}
    for index, (row, weight) in enumerate(zip(rows, weights)):
        cost = remaining if index == len(rows) - 1 else quantize(Decimal(str(total_cost)) * weight / total_weight, Decimal('0.0001'))
        result[row['kind']] = cost
        remaining -= cost
    return result


def resolve_output_product(*, kind, product_id=None, product_name=None, material=None,
                           bottle_capacity_liters=None, bottle_capacity_kg=None, density=None):
    """Resolve a named finished item without using the consumed material as identity."""
    kind = 'bottle' if kind == 'bottle_with_cap' else kind
    if kind not in {'bottle', 'carton', 'plastic'}:
        raise ValidationError({'product': 'Select a bottle, carton or plastic product.'})
    name = ' '.join(str(product_name or '').split())
    if product_id and name:
        raise ValidationError({'product': 'Choose an existing product or enter a new name, not both.'})
    if not product_id and not name:
        return None
    if product_id:
        product = Product.objects.select_for_update().filter(pk=product_id).first()
        if product is None or product.stock_kind != kind:
            raise ValidationError({'product': f'Choose a {kind} stock product.'})
    else:
        if len(name) > 255:
            raise ValidationError({'product_name': 'Product names must be 255 characters or fewer.'})
        product = next((candidate for candidate in Product.all_objects.select_for_update().select_related('raw_material').filter(name__iexact=name).order_by('id') if candidate.stock_kind == kind), None)
        if product is None:
            product, _ = Product.objects.get_or_create(name=name, packaging_type=kind, defaults=dict(bottles_per_carton=1,
                bottle_capacity_liters=bottle_capacity_liters if kind == 'bottle' else None,
                bottle_capacity_kg=bottle_capacity_kg if kind == 'bottle' else None,
                density_kg_per_liter=density or 1))
        elif product.is_deleted:
            product.restore()
    if kind == 'bottle':
        updates = []
        for field, supplied in [('bottle_capacity_kg', bottle_capacity_kg), ('bottle_capacity_liters', bottle_capacity_liters)]:
            existing = getattr(product, field)
            if supplied is not None and existing is not None and quantize(existing, Decimal('0.0001')) != quantize(supplied, Decimal('0.0001')):
                raise ValidationError({'product': 'This product has a different bottle size. Choose another product name for this fill size.'})
            if existing is None and supplied is not None:
                setattr(product, field, supplied)
                updates.append(field)
        if updates:
            product.density_kg_per_liter = density or 1
            product.save(update_fields=updates + ['density_kg_per_liter', 'updated_at'])
    return product


@transaction.atomic
def add_material_stock(*, material, quantity, total_cost, product=None, notes='', expire_date=None, packing=False,
                       bottle_capacity_liters=None, bottle_capacity_kg=None, density=None):
    """Add an inflow lot; never duplicate a product or replace existing quantities."""
    quantity = Decimal(str(quantity))
    total_cost = quantize(total_cost)
    if product is None and material is not None:
        material = RawMaterial.all_objects.select_for_update().get(pk=material.pk)
        if material.material_type not in PACKAGING_TYPES:
            raise ValidationError({'raw_material': 'Select a bottle, carton or plastic material.'})
        if not quantity.is_finite() or quantity <= 0:
            raise ValidationError({'quantity': 'Enter a positive stock quantity.'})
        if (
            material.material_type in {'bottle', 'bottle_with_cap'}
            and quantity != quantity.to_integral_value()
        ):
            raise ValidationError({'quantity': 'Bottle stock must be entered in whole bottles.'})
        product, _ = Product.all_objects.get_or_create(raw_material=material, defaults={
            'name': material.name,
            'bottles_per_carton': 1,
            'bottle_capacity_liters': bottle_capacity_liters if bottle_capacity_liters is not None else material.capacity_liters,
            'bottle_capacity_kg': bottle_capacity_kg if bottle_capacity_kg is not None else material.capacity_kg,
            'density_kg_per_liter': density or 1,
        })
        if product.is_deleted:
            product.restore()
        if material.material_type in {'bottle', 'bottle_with_cap'} and bottle_capacity_liters is not None:
            product.bottle_capacity_liters = bottle_capacity_liters
            product.bottle_capacity_kg = bottle_capacity_kg
            product.density_kg_per_liter = density or 1
            product.save(update_fields=['bottle_capacity_liters', 'bottle_capacity_kg', 'density_kg_per_liter', 'updated_at'])
    elif product is None or not quantity.is_finite() or quantity <= 0 or (product.stock_kind == 'bottle' and quantity != quantity.to_integral_value()):
        raise ValidationError({'quantity': 'Choose a finished product and positive whole bottle count.'})
    if product.is_deleted:
        product.restore()
    stock, _ = Stock.all_objects.select_for_update().get_or_create(product=product, condition='good', defaults={'piece_amount': 0, 'buy_price': 0, 'currency': 1})
    if stock.is_deleted:
        stock.restore()
    from api.services.stock_valuation import stock_valuation, sync_stock_valuation
    if stock.piece_amount > 0 and not InventoryBatch.objects.filter(product=product, condition='good').exists():
        from api.services.batch_inventory import sync_manual_stock_batch
        sync_manual_stock_batch(stock, pieces=stock.piece_amount)
    existing_value = stock_valuation(stock)
    previous = existing_value['quantity']
    combined = previous + quantity
    if combined >= Decimal('100000000'):
        raise ValidationError({'quantity': 'Total stock quantity exceeds the supported range.'})
    stock.buy_price = quantize((existing_value['value'] + total_cost) / combined)
    stock.piece_amount = combined
    stock.currency = 1
    stock._skip_stock_journal = True
    stock.save(update_fields=['buy_price', 'piece_amount', 'currency', 'updated_at'])
    unit_cost = quantize(total_cost / quantity, SIX)
    batch = InventoryBatch(product=product, condition='good', cartons_received=quantity,
        pieces_received=quantity, remaining_pieces=quantity, unit_cost=quantize(unit_cost),
        currency=1, notes=notes, expire_date=expire_date)
    if packing:
        batch._skip_batch_journal = True
    if expire_date:
        from django.utils import timezone
        if expire_date < timezone.localdate():
            batch.status = InventoryBatch.STATUS_EXPIRED
    batch.save()
    sync_stock_valuation(stock)
    # After batch.save() → update_pool() the batch.unit_cost is the pool weighted average.
    # Return that blended cost so PackingRunOutput.unit_cost_afn matches stock.buy_price.
    return stock, batch, batch.unit_cost


def reverse_output(output, *, action):
    """Only an untouched lot can be removed when a packing run is reversed."""
    from api.models.data.sale_batch_allocation import SaleBatchAllocation
    stock = Stock.all_objects.select_for_update().get(pk=output.stock_id)
    batch = InventoryBatch.objects.select_for_update().get(pk=output.inventory_batch_id)
    from api.models.data.packing import PackingReturn
    for sources in PackingReturn.objects.filter(stock_id=output.stock_id).values_list('bottle_sources', flat=True):
        if any(row.get('inventory_batch') == batch.pk for row in sources):
            raise ValidationError({'packing': f'This run cannot be {action} because its bottles have Return to Pack records.'})

    if batch.remaining_pieces != batch.pieces_received or SaleBatchAllocation.objects.filter(inventory_batch=batch).exists():
        raise ValidationError({'packing': f'This run cannot be {action} because some output stock has already been used or moved.'})
    remaining = stock.piece_amount - output.quantity_pieces
    if remaining < 0:
        raise ValidationError({'packing': 'Output stock balance is too low to reverse this run.'})
    stock.piece_amount = remaining
    if remaining == 0:
        stock.buy_price = Decimal('0')
    # Remaining lots are authoritative. Subtracting the unrounded run value
    # from rounded lot unit prices can leave a phantom value at zero stock.
    stock._skip_stock_journal = True
    stock.save(update_fields=['piece_amount', 'buy_price', 'updated_at'])
    # Remove the output reference before deleting its protected lot.
    output.delete()
    batch._skip_batch_journal = True
    batch._reversal_unit_cost = batch.unit_cost if remaining == 0 else output.unit_cost_afn
    batch.delete()
    from api.services.stock_valuation import sync_stock_valuation
    sync_stock_valuation(stock)
