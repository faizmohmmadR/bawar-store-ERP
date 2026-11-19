from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import DecimalField, ExpressionWrapper, F, Q, Sum
from rest_framework.exceptions import ValidationError

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.packing import PackingRun, PackingRunComponent, PackingRunOutput
from api.models.data.products import Product
from api.models.data.raw_material_process import RawMaterialProcessItem
from api.models.data.raw_materials import RawMaterial, RawMaterialPurchaseItem, RawMaterialStock
from api.models.data.sale_batch_allocation import SaleBatchAllocation
from api.models.data.stock import Stock
from api.models.data.storage_tank import StorageTank
from api.utils.packaging import PIECES_PER_CARTON, expected_packing_component_quantities

FOUR = Decimal('0.0001')
SIX = Decimal('0.000001')
PACKING_COMPONENTS = {key for key, _ in PackingRun.COMPONENT_CHOICES}
OPTIONAL_PACKING_COMPONENTS = {
    PackingRun.COMPONENT_BOTTLE,
    PackingRun.COMPONENT_CARTON,
    PackingRun.COMPONENT_PLASTIC,
    PackingRun.COMPONENT_CAP,
    PackingRun.COMPONENT_CAP_LABEL,
    PackingRun.COMPONENT_LABEL,
    PackingRun.COMPONENT_CARTON_PLASTIC,
}


def _d(value):
    return Decimal(str(value or 0))


def _q(value, places=FOUR):
    return _d(value).quantize(places, rounding=ROUND_HALF_UP)


def _tank_liquid_totals(storage_tank, *, lock=False, exclude_packing_run_id=None,
                        exclude_sale_item_id=None):
    from api.services.tank_inventory import get_tank_liquid_totals

    return get_tank_liquid_totals(
        storage_tank,
        lock=lock,
        exclude_packing_run_id=exclude_packing_run_id,
        exclude_sale_item_id=exclude_sale_item_id,
    )


def _format_bottle_capacity_label(capacity_liters) -> str:
    """Human bottle size: 500 ml / 750 ml / 1 L."""
    cap = _q(capacity_liters).normalize()
    if cap <= 0:
        return '0 L'
    if cap < 1:
        ml = (cap * Decimal('1000')).quantize(Decimal('1'))
        return f'{ml} ml'
    return f'{format(cap, "f")} L'


def _bottle_capacity_liters(material, *, density=None):
    """Resolve bottle capacity to liters (convert kg via density when needed)."""
    if material.capacity_liters is not None:
        return _q(material.capacity_liters)
    if material.capacity_kg is not None:
        dens = _d(density)
        if dens <= 0:
            raise ValidationError({
                'components': (
                    'Tank density (kg/L) is required to pack a bottle '
                    'whose capacity is configured in kilograms.'
                )
            })
        return _q(_d(material.capacity_kg) / dens)
    return Decimal('0')


def get_available_packing_tanks(*, exclude_packing_run_id=None):
    from api.services.cost_currency import usd_cost_rate
    from api.services.tank_inventory import get_tank_density, get_tank_mass_quantity

    results = []
    reporting_rate = usd_cost_rate()
    for tank in StorageTank.objects.order_by('name', 'id'):
        liters, _, liquid_cost_per_liter = _tank_liquid_totals(
            tank,
            exclude_packing_run_id=exclude_packing_run_id,
        )
        if liters <= 0:
            continue
        results.append({
            'id': tank.id,
            'name': tank.name,
            'capacity_liters': str(tank.capacity_liters),
            'current_liters': str(liters),
            'available_liters': str(liters),
            'available_kg': str(get_tank_mass_quantity(tank, exclude_packing_run_id=exclude_packing_run_id)),
            'liquid_cost_per_liter_afn': str(liquid_cost_per_liter),
            'usd_to_afn_rate': str(reporting_rate) if reporting_rate else None,
            'density_kg_per_liter': str(get_tank_density(tank, exclude_packing_run_id=exclude_packing_run_id)),
        })
    return results


def _tank_density(tank):
    from api.services.tank_inventory import get_tank_density

    density = get_tank_density(tank)
    if density > 0:
        return density
    return _d(getattr(tank, 'density_kg_per_liter', 1) or 1)


def _raw_material_purchase_usage(*, exclude_packing_run_id=None):
    usage = {}
    source_lists = RawMaterialProcessItem.objects.filter(
        process__deleted_at__isnull=True,
    ).values_list('purchase_sources', flat=True)
    packing_components = PackingRunComponent.objects.filter(
        raw_material_stock__isnull=False,
        packing_run__deleted_at__isnull=True,
        deleted_at__isnull=True,
    )
    if exclude_packing_run_id is not None:
        packing_components = packing_components.exclude(
            packing_run_id=exclude_packing_run_id,
        )
    source_lists = list(source_lists) + list(
        packing_components.values_list('inventory_allocations', flat=True)
    )
    for sources in source_lists:
        for source in sources or []:
            purchase_item_id = int(source.get('purchase_item') or 0)
            if not purchase_item_id:
                continue
            allocation = usage.setdefault(purchase_item_id, {
                'quantity': Decimal('0'),
                'piece_count': 0,
            })
            allocation['quantity'] += _d(source.get('quantity'))
            allocation['piece_count'] += int(source.get('piece_count') or 0)
    return usage


def _raw_material_purchase_lines(raw_material, *, lock=False):
    lines = RawMaterialPurchaseItem.objects.filter(
        raw_material=raw_material,
        purchase__status='received',
        purchase__deleted_at__isnull=True,
        quantity__gt=0,
    ).select_related('purchase').order_by('purchase__purchase_date', 'id')
    return lines.select_for_update() if lock else lines


def get_available_packing_components(*, exclude_packing_run_id=None):
    results = []
    usage = _raw_material_purchase_usage(
        exclude_packing_run_id=exclude_packing_run_id,
    )
    stock_ids_in_run = set()
    run_pieces_by_stock = {}
    run_value_by_stock = {}
    run_weight_by_stock = {}
    if exclude_packing_run_id is not None:
        for component in PackingRunComponent.objects.filter(
            packing_run_id=exclude_packing_run_id,
            raw_material_stock__isnull=False,
        ):
            stock_id = component.raw_material_stock_id
            stock_ids_in_run.add(stock_id)
            run_value_by_stock[stock_id]=run_value_by_stock.get(stock_id,Decimal('0'))+component.total_cost_afn
            restored_weight=sum((_d(row.get('quantity')) for row in component.inventory_allocations or []),Decimal('0')) if component.raw_material_stock.raw_material.unit == RawMaterial.UNIT_KG else component.quantity_pieces
            run_weight_by_stock[stock_id]=run_weight_by_stock.get(stock_id,Decimal('0'))+restored_weight
            run_pieces_by_stock[stock_id] = (
                run_pieces_by_stock.get(stock_id, Decimal('0'))
                + _d(component.quantity_pieces)
            )
    stocks = RawMaterialStock.objects.filter(
        Q(raw_material__unit=RawMaterial.UNIT_PIECE, quantity__gt=0)
        | Q(raw_material__unit=RawMaterial.UNIT_KG, piece_count__gt=0)
        | Q(pk__in=stock_ids_in_run),
    ).select_related('raw_material', 'raw_material__category').order_by('raw_material__name')

    for stock in stocks:
        uses_piece_count = stock.raw_material.unit == RawMaterial.UNIT_KG
        available_quantity = _d(stock.piece_count if uses_piece_count else stock.quantity) + run_pieces_by_stock.get(stock.id, Decimal('0'))
        if available_quantity <= 0:
            continue
        from api.services.weighted_average import raw_stock_unit_cost
        unit_cost = raw_stock_unit_cost(stock)
        virtual_value=_d(stock.quantity)*unit_cost+run_value_by_stock.get(stock.id,Decimal('0'))
        virtual_weight=_d(stock.quantity)+run_weight_by_stock.get(stock.id,Decimal('0'))
        denominator=available_quantity if uses_piece_count else virtual_weight
        unit_cost=virtual_value/denominator if denominator else Decimal('0')
        purchase_lots = []
        results.append({
            'raw_material': stock.raw_material_id,
            'raw_material_name': stock.raw_material.name,
            'material_type': stock.raw_material.material_type,
            'category': stock.raw_material.category_id,
            'category_name': stock.raw_material.category.name if stock.raw_material.category_id else None,
            'unit': RawMaterial.UNIT_PIECE,
            'capacity_liters': str(stock.raw_material.capacity_liters) if stock.raw_material.capacity_liters is not None else None,
            'capacity_kg': str(stock.raw_material.capacity_kg) if stock.raw_material.capacity_kg is not None else None,
            'capacity_display_unit': stock.raw_material.capacity_display_unit,
            'bottles_per_carton': stock.raw_material.bottles_per_carton,
            'bottles_per_plastic': stock.raw_material.bottles_per_plastic,
            'available_quantity': str(_q(available_quantity)),
            'unit_cost_afn': str(_q(unit_cost, SIX)),
            'stock_unit_cost_afn': str(_q(stock.last_purchase_price, SIX)) if not uses_piece_count else None,
            'purchase_lots': purchase_lots,
        })
    return results


def _consume_raw_material_component(stock, quantity, purchase_item_id):
    quantity = _q(quantity)
    material = stock.raw_material
    uses_piece_count = material.unit == RawMaterial.UNIT_KG
    if material.unit not in (RawMaterial.UNIT_KG, RawMaterial.UNIT_PIECE):
        raise ValidationError({'components': 'Packing requires piece stock or kg stock with a recorded piece count.'})
    if quantity <= 0 or quantity != quantity.to_integral_value():
        raise ValidationError(
            {'components': 'Packaging quantities must be greater than zero.'})
    available_stock = stock.piece_count if uses_piece_count else stock.quantity
    if quantity > _d(available_stock):
        raise ValidationError({
            'components': (
                f'Not enough {material.name} in raw-material stock. '
                f'Available: {_q(available_stock)} pieces.'
            )
        })

    from api.services.weighted_average import raw_stock_unit_cost
    unit_cost = raw_stock_unit_cost(stock, recover=True)
    stock_value = _d(stock.quantity) * unit_cost
    weight_quantity = quantity
    if uses_piece_count:
        # Package count and kilograms describe the same stock, not separate balances.
        weight_quantity = _q(_d(stock.quantity) * quantity / _d(stock.piece_count))
        if weight_quantity <= 0:
            raise ValidationError({'components': 'Selected package quantity is below the supported stock-weight precision.'})
        unit_cost = _q(_d(stock.quantity) * unit_cost / _d(stock.piece_count), SIX)
    if unit_cost <= 0 and not stock.zero_cost_allowed:
        raise ValidationError({'components': f'Enter the actual stock price for {material.name} before packing.'})
    total_cost = _q(stock_value) if quantity == _d(available_stock) else _q(quantity * unit_cost)
    from api.services.weighted_average import raw_stock_sources
    allocations = raw_stock_sources(stock, weight_quantity, int(quantity) if uses_piece_count else 0, unit_cost, piece_basis=uses_piece_count)
    if allocations:
        allocations[-1]['total_cost_afn'] = str(total_cost - sum((_d(row['total_cost_afn']) for row in allocations[:-1]), Decimal('0')))
    stock.quantity = _q(_d(stock.quantity) - weight_quantity)
    if uses_piece_count:
        from api.services.weighted_average import average
        stock.piece_count -= int(quantity)
        # Rounded kg must carry the remaining value, so consumption plus
        # remaining stock equals the original value even for 1 kg / 3 pieces.
        stock.last_purchase_price = average(stock.quantity, _q(stock_value) - total_cost)
    stock.save(update_fields=['quantity', 'piece_count', 'last_purchase_price', 'updated_at'])
    return _q(unit_cost, SIX), total_cost, allocations


def reverse_packing_run(run, *, action='edited'):
    """Restore packaging stock and remove finished bottles created by this run."""
    returned = None
    if run.packing_return_id:
        from api.models.data.packing import PackingReturn
        returned = PackingReturn.objects.select_for_update().get(pk=run.packing_return_id)
        restored_expiry = run.outputs.filter(component_type__in=['bottle', 'returned_bottle']).order_by('-component_type').values_list('inventory_batch__expire_date', flat=True).first() or returned.expire_date
    if run.storage_tank_id:
        StorageTank.objects.select_for_update().get(pk=run.storage_tank_id)
    old_components = list(
        run.components.select_for_update().select_related(
            'raw_material_stock__raw_material',
        ).all()
    )
    for component in old_components:
        stock = RawMaterialStock.objects.select_for_update().select_related('raw_material').get(pk=component.raw_material_stock_id) if component.raw_material_stock_id else None
        if stock is None:
            raise ValidationError({
                'packing': (
                    'This older packing run has no raw-material allocation '
                    f'record and cannot be safely {action}.'
                ),
            })
        quantity = _d(component.quantity_pieces)
        from api.services.weighted_average import receive_raw_stock
        if stock.raw_material.unit == RawMaterial.UNIT_KG:
            restored_weight = sum((_d(row.get('quantity')) for row in component.inventory_allocations or []), Decimal('0'))
            # Legacy runs did not deduct kg when consuming package counts.
            value = component.total_cost_afn if restored_weight else Decimal('0')
            if restored_weight:
                receive_raw_stock(stock, restored_weight, value, pieces=int(quantity))
            else:
                stock.piece_count += int(quantity)
                stock.save(update_fields=['piece_count', 'updated_at'])
        else:
            receive_raw_stock(stock, quantity, component.total_cost_afn)

    outputs = list(run.outputs.select_for_update().all())
    if outputs:
        from api.services.material_finished_stock import reverse_output
        for output in outputs:
            reverse_output(output, action=action)
    elif run.finished_stock_id:
        finished_stock = Stock.objects.select_for_update().get(
            pk=run.finished_stock_id,
        )
        output_batch = InventoryBatch.objects.select_for_update().filter(
            product_id=run.product_id,
            condition=Stock.CONDITION_GOOD,
            notes=f'Packed from {run.storage_tank.name} in {run.packing_number}',
        ).first()
        if (
            output_batch is None
            or _d(output_batch.remaining_pieces) != _d(output_batch.pieces_received)
            or SaleBatchAllocation.objects.filter(
                inventory_batch_id=output_batch.id,
            ).exists()
        ):
            raise ValidationError({
                'packing': (
                    f'This run cannot be {action} because some finished bottles '
                    'have already been used or moved.'
                ),
            })
        current_pieces = _d(finished_stock.piece_amount)
        if current_pieces < run.bottle_count:
            raise ValidationError({
                'packing': 'Finished-stock balance is too low to reverse this packing run.',
            })
        remaining_pieces = current_pieces - Decimal(run.bottle_count)
        remaining_cost = (
            current_pieces * _d(finished_stock.buy_price)
            - Decimal(run.bottle_count) * _d(run.cost_per_bottle_afn)
        )
        finished_stock.piece_amount = remaining_pieces
        finished_stock.buy_price = (
            _q(remaining_cost / remaining_pieces, Decimal('0.0001'))
            if remaining_pieces > 0
            else Decimal('0')
        )
        finished_stock._skip_stock_journal = True
        finished_stock.save(update_fields=[
            'piece_amount', 'buy_price', 'updated_at',
        ])
        if output_batch is not None:
            output_batch._skip_batch_journal = True
            output_batch.delete()

    if returned is not None:
        if returned.remaining_bottle_count + run.returned_bottle_count > returned.bottle_count:
            raise ValidationError({'packing': 'Returned bottle balance cannot be restored twice.'})
        expiry_dates = [date for date in [returned.expire_date if returned.remaining_bottle_count else None, restored_expiry] if date]
        returned.expire_date = min(expiry_dates) if expiry_dates else None
        value = returned.remaining_bottle_count * returned.unit_cost_afn + run.returned_cost_afn
        returned.remaining_bottle_count += run.returned_bottle_count
        from api.services.weighted_average import average
        returned.unit_cost_afn = average(returned.remaining_bottle_count, value)
        returned.save(update_fields=['remaining_bottle_count', 'unit_cost_afn', 'expire_date', 'updated_at'])
    run.components.all().delete()
    return run


@transaction.atomic
def update_packing_run(*, packing_run_id, storage_tank_id, quantity_liters,
                       bottle_volume_liters, components, notes='', quantity_kg=None, packing_return_id=None, returned_bottle_count=0, returned_carton_id=None, returned_carton_quantity=0, filled_bottle_count=None, output_products=None):
    run = PackingRun.objects.select_for_update().filter(pk=packing_run_id).first()
    if run is None:
        raise ValidationError({'packing': 'Packing run not found.'})
    from api.models.data.packing import PackingReturn
    list(PackingReturn.objects.select_for_update().filter(pk__in=[value for value in [run.packing_return_id, packing_return_id] if value]).order_by('pk'))
    list(StorageTank.objects.select_for_update().filter(pk__in=[run.storage_tank_id, storage_tank_id]).order_by('pk'))
    reverse_packing_run(run, action='edited')
    return create_packing_run(
        storage_tank_id=storage_tank_id,
        quantity_liters=quantity_liters,
        bottle_volume_liters=bottle_volume_liters,
        components=components,
        notes=notes,
        existing_run=run,
        quantity_kg=quantity_kg, packing_return_id=packing_return_id, returned_bottle_count=returned_bottle_count,
        returned_carton_id=returned_carton_id, returned_carton_quantity=returned_carton_quantity, filled_bottle_count=filled_bottle_count, output_products=output_products,
    )


@transaction.atomic
def delete_packing_run(*, packing_run_id, user=None):
    """Reverse inventory impact, then soft-delete the packing run."""
    run = PackingRun.objects.select_for_update().filter(pk=packing_run_id).first()
    if run is None:
        raise ValidationError({'packing': 'Packing run not found.'})
    reverse_packing_run(run, action='deleted')
    if hasattr(run, 'soft_delete'):
        run.soft_delete(user=user)
    else:
        run.delete()
    return run


@transaction.atomic
def create_packing_run(*, storage_tank_id, quantity_liters, bottle_volume_liters,
                       components, notes='', existing_run=None, quantity_kg=None, packing_return_id=None, returned_bottle_count=0, returned_carton_id=None, returned_carton_quantity=0, filled_bottle_count=None, output_products=None):
    explicit_outputs = output_products is not None
    bottle_output_requested = any(row.get('component_type') == 'bottle' for row in output_products or [])
    returned = None
    returned_cost = Decimal('0')
    if packing_return_id:
        from django.utils import timezone
        from api.models.data.packing import PackingReturn
        returned = PackingReturn.objects.select_for_update().select_related('stock__product').filter(pk=packing_return_id, inventory_moved=True).first()
        returned_count = _d(returned_bottle_count)
        if returned is None or returned_count <= 0 or returned_count != returned_count.to_integral_value() or returned_count > returned.remaining_bottle_count:
            raise ValidationError({'returned_bottle_count': 'Select a returned item and a whole quantity within its remaining balance.'})
        if returned.expire_date and returned.expire_date < timezone.localdate():
            raise ValidationError({'packing_return': 'These returned bottles have expired.'})
        returned_bottle_count = int(returned_count)
        returned_cost = _q(returned_count * returned.unit_cost_afn)
    elif returned_bottle_count:
        raise ValidationError({'packing_return': 'Select the returned bottle item.'})
    if bool(returned_carton_id) != bool(returned_carton_quantity) or (returned_carton_id and returned is None):
        raise ValidationError({'returned_carton': 'Select the returned bottle source, carton and carton quantity together.'})
    separate_return = returned is not None and (explicit_outputs or bool(returned_carton_id) or not any(c.get('component_type') == 'bottle' for c in components or []) or any(c.get('component_type') == 'bottle' for c in output_products or []))
    tank = StorageTank.objects.select_for_update().filter(pk=storage_tank_id).first()
    if tank is None:
        raise ValidationError({'storage_tank': 'Select a valid storage tank.'})
    if quantity_kg is not None:
        from api.services.tank_inventory import get_tank_density
        density = get_tank_density(tank, exclude_packing_run_id=existing_run.id if existing_run else None)
        quantity_liters = _d(quantity_kg) / density
    quantity_liters = _q(quantity_liters)
    if quantity_liters <= 0:
        raise ValidationError({'quantity_kg': 'Enter a positive quantity to pack.'})

    tank_liters, _, liquid_cost_per_liter = _tank_liquid_totals(
        tank,
        lock=True,
        exclude_packing_run_id=existing_run.id if existing_run else None,
    )
    if quantity_liters > tank_liters:
        raise ValidationError({
            'quantity_liters': f'{tank.name} contains only {_q(tank_liters)} liters.'
        })
    from api.services.tank_inventory import get_tank_mass_quantity
    if quantity_kg is not None:
        quantity_kg = _q(quantity_kg)
        available_mass = get_tank_mass_quantity(tank, exclude_packing_run_id=existing_run.id if existing_run else None)
        if quantity_kg <= 0 or quantity_kg > available_mass:
            raise ValidationError({'quantity_kg': f'{tank.name} contains only {available_mass} kg.'})
    liquid_cost_afn = _q(quantity_liters * liquid_cost_per_liter)

    by_type = {}
    for component in components or []:
        component_type = component.get('component_type')
        raw_material_id = component.get('raw_material')
        purchase_item_id = component.get('purchase_item')
        quantity_pieces = _d(component.get('quantity_pieces'))
        if component_type in OPTIONAL_PACKING_COMPONENTS:
            if not raw_material_id and not purchase_item_id and quantity_pieces <= 0:
                continue
        if component_type not in PACKING_COMPONENTS or component_type in by_type:
            raise ValidationError(
                {'components': 'Select each packaging component once, and omit blank Cap/Label entries.'})
        if not raw_material_id or quantity_pieces <= 0:
            raise ValidationError(
                {'components': 'Select a raw material and enter a positive used quantity for each included packaging item.'})
        if quantity_pieces != quantity_pieces.to_integral_value():
            raise ValidationError({
                'components': 'Packaging quantities must be whole pieces.'
            })
        by_type[component_type] = {
            'raw_material': raw_material_id,
            'purchase_item': purchase_item_id,
            'quantity_pieces': quantity_pieces,
        }

    requested_bottle_volume = _q(bottle_volume_liters)
    bottle_material = RawMaterial.all_objects.get(pk=by_type['bottle']['raw_material']) if 'bottle' in by_type else None
    carton_material = RawMaterial.all_objects.get(pk=by_type['carton']['raw_material']) if 'carton' in by_type else None
    tank_density = _tank_density(tank)
    if bottle_material is None:
        count = _d(filled_bottle_count)
        if filled_bottle_count is None:
            choice = next((row for row in output_products or [] if row.get('component_type') == 'bottle'), {})
            product = Product.objects.filter(pk=choice.get('product')).first() if choice.get('product') else None
            mass = _d(product.bottle_capacity_kg) if product and product.stock_kind == 'bottle' else Decimal('0')
            if product and existing_run and product.pk == existing_run.product_id:
                original_count = existing_run.bottle_count - existing_run.returned_bottle_count
                if original_count > 0 and existing_run.quantity_kg > 0:
                    mass = existing_run.quantity_kg / original_count
            size = _d(product.bottle_capacity_liters) if product and product.stock_kind == 'bottle' else requested_bottle_volume
            if mass > 0:
                count = _d(quantity_kg if quantity_kg is not None else quantity_liters * tank_density) / mass
            elif size > 0:
                count = quantity_liters / size
            elif explicit_outputs and not bottle_output_requested:
                count = Decimal('0')
            else:
                raise ValidationError({'output_products': 'Choose a bottle material or an existing stock product with a bottle size.'})
        allow_unknown_count = explicit_outputs and not bottle_output_requested and filled_bottle_count is None and count == 0
        if not count.is_finite() or (count <= 0 and not allow_unknown_count) or count >= 100000000 or count != count.to_integral_value():
            raise ValidationError({'bottle_volume_liters': 'The packing quantity must fill a whole number of bottles.'})
        filled_bottle_count = int(count)
        bottle_volume_liters = _q(quantity_liters / count) if count else Decimal('0')
    else:
        bottle_volume_liters = _bottle_capacity_liters(bottle_material, density=tank_density)
    bottles_per_carton = int(carton_material.bottles_per_carton or 0) if carton_material else 0
    if bottle_volume_liters <= 0 and _d(getattr(bottle_material, 'capacity_kg', None)) <= 0 and not (explicit_outputs and not bottle_output_requested and bottle_material is None):
        raise ValidationError({
            'components': 'The selected bottle must have a positive volume or kg capacity.'
        })
    if bottles_per_carton <= 0:
        bottles_per_carton = int(PIECES_PER_CARTON)
    if (
        bottle_material is not None
        and bottle_volume_liters > 0
        and requested_bottle_volume > 0
        and requested_bottle_volume != bottle_volume_liters
    ):
        raise ValidationError({'bottle_volume_liters': 'Bottle size must match the selected bottle material capacity.'})
    if bottle_material and bottle_material.material_type == RawMaterial.TYPE_BOTTLE_WITH_CAP and (
        PackingRun.COMPONENT_CAP in by_type
    ):
        raise ValidationError({
            'components': 'Do not add a separate cap when the selected bottle includes one.'
        })
    bottle_is_kg = (
        bottle_material is not None
        and bottle_material.capacity_liters is None
        and bottle_material.capacity_kg is not None
    )
    label_pieces_per_bottle = 1
    if PackingRun.COMPONENT_LABEL in by_type:
        label_material = RawMaterial.all_objects.get(
            pk=by_type[PackingRun.COMPONENT_LABEL]['raw_material'],
        )
        if label_material.material_type == RawMaterial.TYPE_LABEL_DOUBLE:
            label_pieces_per_bottle = 2

    try:
        expected_quantities = {'bottle': int(filled_bottle_count)} if bottle_material is None else expected_packing_component_quantities(
            quantity_liters=quantity_liters,
            quantity_kg=(
                (quantity_kg if quantity_kg is not None else quantity_liters * tank_density)
                if bottle_is_kg else None
            ),
            bottle_capacity_liters=(
                None if bottle_is_kg else bottle_volume_liters
            ),
            bottle_capacity_kg=(
                bottle_material.capacity_kg if bottle_is_kg else None
            ),
            plastic_capacity_liters=None,
            plastic_capacity_kg=None,
            carton_bottle_capacity_liters=getattr(carton_material, 'capacity_liters', None),
            carton_capacity_kg=getattr(carton_material, 'capacity_kg', None),
            bottles_per_carton_count=bottles_per_carton,
            bottles_per_plastic_count=None,
            include_cap=PackingRun.COMPONENT_CAP in by_type,
            include_cap_label=PackingRun.COMPONENT_CAP_LABEL in by_type,
            include_label=PackingRun.COMPONENT_LABEL in by_type,
            label_pieces_per_bottle=label_pieces_per_bottle,
            include_carton_plastic=PackingRun.COMPONENT_CARTON_PLASTIC in by_type,
        )
    except ValueError as exc:
        raise ValidationError({'components': str(exc)}) from exc

    new_bottle_count = int(expected_quantities['bottle'])
    bottle_count = new_bottle_count
    if returned and not separate_return:
        if returned.stock.product.raw_material_id != getattr(bottle_material, 'pk', None):
            raise ValidationError({'packing_return': 'Returned bottles must match the selected bottle material.'})
        if returned.bottle_volume_liters and returned.bottle_volume_liters != bottle_volume_liters:
            raise ValidationError({'packing_return': 'Returned bottle capacity must match the new bottles.'})
        bottle_count += returned_bottle_count
    if separate_return:
        bottle_count += returned_bottle_count

    # Finished goods count follows liquid ÷ bottle capacity.
    # Actual material quantities remain user-entered, with packaging suggestions
    # calculated from each material's bottle count per package.

    selected_material_ids = [selection['raw_material']
                             for selection in by_type.values()]
    if len(set(selected_material_ids)) != len(by_type):
        raise ValidationError(
            {'components': 'Select a different raw material for each packaging component.'})

    stocks = {
        stock.raw_material_id: stock
        for stock in RawMaterialStock.objects.select_for_update().filter(
            raw_material_id__in=[item['raw_material'] for item in by_type.values()] + ([returned_carton_id] if returned_carton_id else []),
        ).select_related('raw_material', 'raw_material__category').order_by('id')
    }
    if not set(selected_material_ids).issubset(stocks) or (returned_carton_id and returned_carton_id not in stocks):
        raise ValidationError(
            {'components': 'A selected raw material is not available in piece-based stock.'})

    component_results = []
    packaging_cost_afn = Decimal('0')
    for component_type, selection in by_type.items():
        raw_material_id = selection['raw_material']
        stock = stocks[raw_material_id]
        expected_type = {
            PackingRun.COMPONENT_BOTTLE: {
                RawMaterial.TYPE_BOTTLE,
                RawMaterial.TYPE_BOTTLE_WITH_CAP,
            },
            PackingRun.COMPONENT_CAP: RawMaterial.TYPE_CAP,
            PackingRun.COMPONENT_CAP_LABEL: RawMaterial.TYPE_CAP_LABEL,
            PackingRun.COMPONENT_LABEL: set(RawMaterial.LABEL_TYPES),
            PackingRun.COMPONENT_PLASTIC: RawMaterial.TYPE_PLASTIC,
            PackingRun.COMPONENT_CARTON: RawMaterial.TYPE_CARTON,
            PackingRun.COMPONENT_CARTON_PLASTIC: RawMaterial.TYPE_CARTON_PLASTIC,
        }[component_type]
        material_type = stock.raw_material.material_type
        if (
            material_type not in expected_type
            if isinstance(expected_type, set)
            else material_type != expected_type
        ):
            raise ValidationError({
                'components': f'Select a {component_type} raw material for this row.'
            })
        quantity_pieces = selection['quantity_pieces']
        unit_cost_afn, total_cost_afn, allocations = _consume_raw_material_component(
            stock, quantity_pieces, selection['purchase_item'],
        )
        component_results.append({
            'component_type': component_type,
            'raw_material_stock': stock,
            'quantity_pieces': quantity_pieces,
            'unit_cost_afn': unit_cost_afn,
            'total_cost_afn': total_cost_afn,
            'inventory_allocations': allocations,
        })
        packaging_cost_afn += total_cost_afn

    returned_carton_component = None
    if returned_carton_id:
        carton_stock = stocks[returned_carton_id]
        if carton_stock.raw_material.material_type != RawMaterial.TYPE_CARTON:
            raise ValidationError({'returned_carton': 'Choose a carton material for returned bottles.'})
        carton_quantity = _d(returned_carton_quantity)
        if carton_quantity <= 0 or carton_quantity != carton_quantity.to_integral_value():
            raise ValidationError({'returned_carton_quantity': 'Enter a positive whole carton quantity.'})
        unit_cost, cost, allocations = _consume_raw_material_component(carton_stock, carton_quantity, None)
        returned_carton_component = dict(component_type='returned_carton', raw_material_stock=carton_stock,
            quantity_pieces=carton_quantity, unit_cost_afn=unit_cost, total_cost_afn=cost, inventory_allocations=allocations)
        component_results.append(returned_carton_component)
        packaging_cost_afn += cost

    packaging_cost_afn = _q(packaging_cost_afn)
    total_cost_afn = _q(liquid_cost_afn + returned_cost + packaging_cost_afn)
    cost_per_bottle_afn = _q(total_cost_afn / bottle_count, SIX) if bottle_count else Decimal('0')
    # Each selected bottle/carton/plastic has its own piece-based stock row.
    # Liquid, caps, labels and other overhead belong to the bottle output;
    # carton/plastic outputs carry only their own cost so value is not duplicated.
    from api.services.material_finished_stock import add_material_stock, resolve_output_product
    output_components = {row['component_type']: row for row in component_results
                         if row['component_type'] in {'bottle', 'carton', 'plastic'}}
    bottle_cost = total_cost_afn - sum((row['total_cost_afn'] for key, row in output_components.items() if key != 'bottle'), Decimal('0'))
    if separate_return:
        bottle_cost -= returned_cost + (returned_carton_component['total_cost_afn'] if returned_carton_component else 0)
    # Save the run first so every output batch has a stable traceable reference.
    run = existing_run or PackingRun()
    run.storage_tank = tank
    run.product = None
    run.finished_stock = None
    run.packing_return = returned
    run.returned_bottle_count = returned_bottle_count
    run.returned_cost_afn = returned_cost
    run.quantity_liters = quantity_liters
    from api.services.tank_inventory import get_tank_density
    run.quantity_kg = quantity_kg if quantity_kg is not None else _q(
        quantity_liters * get_tank_density(
            tank,
            exclude_packing_run_id=existing_run.id if existing_run else None,
        )
    )
    run.bottle_volume_liters = bottle_volume_liters
    run.bottle_count = bottle_count
    run.liquid_cost_afn = liquid_cost_afn
    run.packaging_cost_afn = packaging_cost_afn
    run.total_cost_afn = total_cost_afn
    run.cost_per_bottle_afn = cost_per_bottle_afn
    run.notes = notes or ''
    run.save()

    if returned:
        returned.remaining_bottle_count -= returned_bottle_count
        returned.save(update_fields=['remaining_bottle_count', 'updated_at'])

    for component in component_results:
        PackingRunComponent.objects.create(
            packing_run=run,
            component_type=component['component_type'],
            raw_material_stock=component['raw_material_stock'],
            quantity_pieces=component['quantity_pieces'],
            unit_cost_afn=component['unit_cost_afn'],
            total_cost_afn=component['total_cost_afn'],
            inventory_allocations=component['inventory_allocations'],
        )

    output_selections = {}
    for selection in output_products or []:
        kind = selection['component_type']
        if kind in output_selections or kind not in {'bottle', 'carton', 'plastic', 'returned_carton'}:
            raise ValidationError({'output_products': 'Choose each output product once.'})
        if kind != 'bottle' and kind not in output_components and not (kind == 'returned_carton' and returned_carton_component):
            raise ValidationError({'output_products': 'Select the matching packaging material before choosing its stock product.'})
        output_selections[kind] = selection

    explicit_costs = {}
    if explicit_outputs:
        from api.services.material_finished_stock import selected_output_costs
        output_components = {kind: row for kind, row in output_components.items() if kind in output_selections}
        normal_total = total_cost_afn - (returned_cost + (returned_carton_component['total_cost_afn'] if returned_carton_component else 0) if separate_return else 0)
        if 'bottle' in output_selections:
            bottle_cost = normal_total - sum((row['total_cost_afn'] for kind, row in output_components.items() if kind != 'bottle'), Decimal('0'))
        else:
            explicit_costs = selected_output_costs([{'kind': kind, 'cost': row['total_cost_afn'], 'quantity': row['quantity_pieces']} for kind, row in output_components.items()], normal_total)

    def selected_product(kind):
        selection = output_selections.get(kind, {})
        return resolve_output_product(kind='carton' if kind == 'returned_carton' else kind,
            product_id=selection.get('product'), product_name=selection.get('product_name'),
            bottle_capacity_liters=bottle_volume_liters if kind == 'bottle' else None,
            bottle_capacity_kg=_q(run.quantity_kg / new_bottle_count) if kind == 'bottle' else None,
            density=tank_density)

    if bottle_material is None and (not explicit_outputs or 'bottle' in output_selections):
        product = selected_product('bottle')
        if product is None:
            product, _ = Product.all_objects.get_or_create(
                raw_material=None, name=f'{tank.name[:200]} [tank {tank.pk}] · {run.quantity_kg / new_bottle_count:.4f} kg/bottle',
                bottle_capacity_kg=_q(run.quantity_kg / new_bottle_count),
                bottle_capacity_liters=bottle_volume_liters,
                defaults={'bottles_per_carton': 1, 'density_kg_per_liter': tank_density})
        stock, batch, unit_cost = add_material_stock(material=None, product=product,
            quantity=new_bottle_count, total_cost=bottle_cost, packing=True,
            notes=f'Packed from {tank.name} in {run.packing_number}')
        PackingRunOutput.objects.create(packing_run=run, component_type='bottle', stock=stock,
            inventory_batch=batch, quantity_pieces=new_bottle_count, total_cost_afn=bottle_cost, unit_cost_afn=unit_cost)
        run.product, run.finished_stock = stock.product, stock

    for component_type, component in output_components.items():
        is_bottle = component_type == 'bottle'
        output_cost = bottle_cost if is_bottle else explicit_costs.get(component_type, component['total_cost_afn'])
        quantity = Decimal(new_bottle_count if separate_return else bottle_count) if is_bottle else component['quantity_pieces']
        stock, batch, unit_cost = add_material_stock(
            material=component['raw_material_stock'].raw_material, product=selected_product(component_type),
            quantity=quantity, total_cost=output_cost,
            notes=f'Packed from {tank.name} in {run.packing_number}', packing=True,
            bottle_capacity_liters=bottle_volume_liters if is_bottle else None,
            bottle_capacity_kg=_q(run.quantity_kg / (bottle_count - returned_bottle_count)) if is_bottle else None,
            density=tank_density,
            expire_date=returned.expire_date if returned and is_bottle and not separate_return else None,
        )
        PackingRunOutput.objects.create(packing_run=run, component_type=component_type,
            stock=stock, inventory_batch=batch, quantity_pieces=quantity,
            total_cost_afn=output_cost, unit_cost_afn=unit_cost)
        if is_bottle:
            run.product = stock.product
            run.finished_stock = stock
    if separate_return:
        return_material = returned.stock.product.raw_material
        return_outputs = [
            ('returned_bottle', return_material, Decimal(returned_bottle_count), returned_cost, returned.expire_date),
        ]
        if returned_carton_component:
            return_outputs.append(('returned_carton', returned_carton_component['raw_material_stock'].raw_material,
                returned_carton_component['quantity_pieces'], returned_carton_component['total_cost_afn'], None))
        for output_type, material, quantity, cost, expiry in return_outputs:
            if explicit_outputs:
                if output_type not in output_selections:
                    continue
                if output_type == 'returned_carton':
                    cost += returned_cost
            output_stock, batch, unit_cost = add_material_stock(material=material, product=returned.stock.product if output_type == 'returned_bottle' else selected_product(output_type), quantity=quantity,
                total_cost=cost, expire_date=expiry, packing=True,
                notes=f'Returned bottles packed in {run.packing_number}')
            PackingRunOutput.objects.create(packing_run=run, component_type=output_type, stock=output_stock,
                inventory_batch=batch, quantity_pieces=quantity, total_cost_afn=cost, unit_cost_afn=unit_cost)
    run.save(update_fields=['product', 'finished_stock', 'updated_at'])
    return run
