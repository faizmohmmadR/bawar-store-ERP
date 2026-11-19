from decimal import Decimal, DecimalException, ROUND_HALF_UP

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from api.models.data.currency import currency_details
from api.models.data.raw_material_process import (
    RawMaterialProcessItem,
)
from api.models.data.raw_materials import RawMaterial, RawMaterialPurchaseItem, RawMaterialStock
from api.services.currency_conversion import get_rate_to_base

FOUR = Decimal('0.0001')
SIX = Decimal('0.000001')


def _decimal(value):
    return Decimal(str(value or 0))


def _quantize(value, places):
    return _decimal(value).quantize(places, rounding=ROUND_HALF_UP)


def production_input_weights(items, water_quantity_kg):
    """Convert ingredient weights to kilograms before summing, without costs."""
    materials = Decimal('0')
    chemistry = Decimal('0')
    for index, item in enumerate(items):
        try:
            material = RawMaterial.all_objects.get(pk=item.get('raw_material'))
        except (RawMaterial.DoesNotExist, ValueError, TypeError, AttributeError):
            raise ValidationError({'items': {index: {'raw_material': 'This material is no longer available. Select another material.'}}})
        try:
            quantity = _decimal(item.get('quantity'))
            unit = item.get('quantity_unit', material.unit)
            if not quantity.is_finite() or quantity <= 0 or unit not in {'kg', 'g'} or material.unit not in {'kg', 'g'}:
                raise ValueError()
            kg = quantity / Decimal('1000') if unit == 'g' else quantity
        except (RawMaterial.DoesNotExist, DecimalException, ValueError, TypeError, AttributeError):
            raise ValidationError({'items': {index: {'quantity': 'Enter a positive ingredient weight in kg or g.'}}})
        materials += kg
        if material.material_type == RawMaterial.TYPE_CHEMISTRY:
            chemistry += kg
    try:
        water = _decimal(water_quantity_kg)
    except (DecimalException, ValueError, TypeError):
        raise ValidationError({'water_quantity_kg': 'Enter a valid water weight.'})
    if not water.is_finite() or water < 0:
        raise ValidationError({'water_quantity_kg': 'Water must be zero or greater.'})
    if materials + water >= Decimal('100000000'):
        raise ValidationError({'items': 'Total production weight exceeds the supported range.'})
    return {
        'materials_quantity_kg': _quantize(materials, FOUR),
        'chemistry_quantity_kg': _quantize(chemistry, FOUR),
        'total_input_quantity_kg': _quantize(materials + water, FOUR),
    }


def _raise_currency_error(error):
    details = getattr(error, 'message_dict', None) or getattr(
        error, 'messages', None)
    raise ValidationError(details or str(error))


def _purchase_source_totals(process_items):
    totals = {}
    for sources in process_items.values_list('purchase_sources', flat=True):
        for source in sources or []:
            purchase_item_id = int(source.get('purchase_item') or 0)
            if not purchase_item_id:
                continue
            total = totals.setdefault(purchase_item_id, {
                'quantity': Decimal('0'),
                'piece_count': 0,
            })
            total['quantity'] += _decimal(source.get('quantity'))
            total['piece_count'] += int(source.get('piece_count') or 0)
    return totals


def _allocated_from_purchase_line(purchase_item):
    process_items = RawMaterialProcessItem.objects.filter(
        process__deleted_at__isnull=True,
        raw_material_id=purchase_item.raw_material_id,
    )
    return _purchase_source_totals(process_items).get(purchase_item.id, {
        'quantity': Decimal('0'),
        'piece_count': 0,
    })


def purchase_has_active_production_usage(purchase):
    """True when this purchase's lot IDs appear in production/packing source audits."""
    purchase_item_ids = set(purchase.items.values_list('id', flat=True))
    if not purchase_item_ids:
        return False
    from api.services.packing import _raw_material_purchase_usage
    usage = _raw_material_purchase_usage()
    for purchase_item_id in purchase_item_ids:
        allocated = usage.get(purchase_item_id) or {}
        if _decimal(allocated.get('quantity')) > 0 or int(allocated.get('piece_count') or 0) > 0:
            return True
    return False


@transaction.atomic
def restore_raw_materials_for_process(process):
    """Return a run's consumed stock before replacing its ingredients."""
    _return_process_material_stock(process, remove_items=True)


@transaction.atomic
def release_raw_materials_for_process(process):
    """Return a run's consumed stock while preserving its audit item rows."""
    _return_process_material_stock(process, remove_items=False)


def _return_process_material_stock(process, *, remove_items):
    items = list(process.items.select_for_update().all())
    for item in items:
        stock = RawMaterialStock.objects.select_for_update().get(
            raw_material_id=item.raw_material_id,
        )
        from api.services.weighted_average import receive_raw_stock
        receive_raw_stock(stock, item.quantity, item.material_cost_afn, pieces=item.piece_count)

    if remove_items:
        process.items.all().delete()


def get_available_raw_material_process_options(exclude_process_id=None):
    """One moving-average pool per ingredient; no selectable purchase price lots."""
    from api.services.weighted_average import raw_stock_unit_cost, average
    options=[]
    for stock in RawMaterialStock.objects.filter(raw_material__material_type__in=RawMaterial.PRODUCTION_INGREDIENT_TYPES).select_related('raw_material').order_by('raw_material__name'):
        quantity=stock.quantity; pieces=stock.piece_count
        cost=raw_stock_unit_cost(stock); value=quantity*cost
        if exclude_process_id is not None:
            for item in RawMaterialProcessItem.objects.filter(process_id=exclude_process_id,raw_material_id=stock.raw_material_id):
                quantity+=item.quantity;pieces+=item.piece_count;value+=item.material_cost_afn
            if quantity:cost=average(quantity,value)
        if quantity <= 0:continue
        options.append({'raw_material':stock.raw_material_id,
            'raw_material_details':{'id':stock.raw_material_id,'name':stock.raw_material.name,'unit':stock.raw_material.unit,'material_type':stock.raw_material.material_type},
            'available_quantity':quantity,'available_piece_count':pieces,'purchase_lots':[],
            'stock_unit_cost_afn':cost})
    return options


@transaction.atomic
def consume_raw_materials_for_process(process, items_data):
    """Consume the shared material balance at its current moving-average AFN cost."""
    if not items_data:
        raise ValidationError({'items': 'Add at least one raw material.'})

    try:
        material_ids = [int(item['raw_material']) for item in items_data]
    except (KeyError, ValueError, TypeError):
        raise ValidationError({'items': 'Select a valid material for each ingredient.'})
    if len(material_ids) != len(set(material_ids)):
        raise ValidationError({
            'items': 'A raw material can only be added once per production run.'
        })

    try:
        overhead_rate = get_rate_to_base(
            process.expense_currency,
            process.process_date,
            raise_if_missing=True,
        )
    except DjangoValidationError as error:
        _raise_currency_error(error)

    process.extra_expense_afn = _quantize(
        _decimal(process.extra_expense) * overhead_rate, FOUR
    )

    material_cost_total = Decimal('0')
    for item_index, item_data in enumerate(items_data):
        raw_material_id = item_data.get('raw_material')
        try:
            quantity = _decimal(item_data.get('quantity'))
            pieces = _decimal(item_data.get('piece_count'))
            if not pieces.is_finite() or pieces < 0 or pieces != pieces.to_integral_value():
                raise ValueError('Package counts must be nonnegative whole numbers')
            piece_count = int(pieces)
            if not quantity.is_finite():
                raise ValueError('Non-finite quantity')
        except (DecimalException, ValueError, TypeError) as exc:
            raise ValidationError({'items': 'Enter a valid ingredient quantity and package count.'}) from exc
        purchase_item_id = item_data.get('purchase_item')
        selected_ids = item_data.get('purchase_items')
        if selected_ids is None:
            selected_ids = [purchase_item_id] if purchase_item_id not in (None, '') else []
        try:
            if not isinstance(selected_ids, list):
                raise ValueError()
            selected_ids = [int(value) for value in selected_ids]
            if any(value <= 0 for value in selected_ids) or len(selected_ids) != len(set(selected_ids)):
                raise ValueError()
        except (ValueError, TypeError):
            raise ValidationError({'items': {item_index: {'purchase_items': 'Select valid, distinct purchase lots.'}}})


        if quantity <= 0:
            raise ValidationError(
                {'items': 'Ingredient quantities must be greater than zero.'})

        raw_material = RawMaterial.all_objects.filter(pk=raw_material_id).first()
        if raw_material is None:
            raise ValidationError({'items': {item_index: {'raw_material': 'This material is no longer available.'}}})
        entered_unit = item_data.get('quantity_unit', raw_material.unit)
        mass_units = {'kg', 'g'}
        if raw_material.unit in mass_units:
            if entered_unit not in mass_units:
                raise ValidationError({'items': 'Choose kg or g for mass ingredients.'})
            if entered_unit != raw_material.unit:
                quantity = quantity / Decimal('1000') if entered_unit == 'g' else quantity * Decimal('1000')
        elif entered_unit != raw_material.unit:
            raise ValidationError({'items': 'Choose the inventory unit for this ingredient.'})
        if not quantity.is_finite() or quantity <= 0 or quantity != quantity.quantize(FOUR):
            raise ValidationError({'items': f'Quantity must be positive and accurate to 0.0001 {raw_material.unit}.'})
        if raw_material.material_type not in RawMaterial.PRODUCTION_INGREDIENT_TYPES:
            raise ValidationError({
                'items': (
                    f'{raw_material.name} cannot be used in production. '
                    'Only chemistry, carton plastic, and boiler materials are allowed.'
                )
            })
        if raw_material.unit == RawMaterial.UNIT_PIECE and piece_count:
            raise ValidationError({
                'items': f'Additional package counts are only valid for kilogram materials ({raw_material.name}).'
            })

        stock = RawMaterialStock.objects.select_for_update().filter(
            raw_material=raw_material,
        ).first()
        if stock is None or stock.quantity < quantity:
            available = stock.quantity if stock else Decimal('0')
            raise ValidationError({
                'items': {item_index: {'quantity': (
                    f'Insufficient stock for {raw_material.name}: '
                    f'{available} {raw_material.unit} available, {quantity} required.'
                )}}
            })
        if piece_count > stock.piece_count:
            raise ValidationError({
                'items': (
                    f'Insufficient package count for {raw_material.name}: '
                    f'{stock.piece_count} available, {piece_count} required.'
                )
            })

        process_item = RawMaterialProcessItem.objects.create(
            process=process,
            raw_material=raw_material,
            quantity=quantity,
            piece_count=piece_count,
        )
        from api.services.weighted_average import raw_stock_unit_cost
        unit_cost_base = _quantize(raw_stock_unit_cost(stock, recover=True), SIX)
        if unit_cost_base <= 0 and not stock.zero_cost_allowed:
            raise ValidationError({'items': {item_index: {'raw_material': f'Enter the actual stock price for {raw_material.name} before production.'}}})
        line_cost = _quantize(quantity * unit_cost_base, FOUR)
        from api.services.weighted_average import raw_stock_sources
        purchase_sources = raw_stock_sources(stock, quantity, piece_count, unit_cost_base)


        process_item.material_cost_afn = _quantize(line_cost, FOUR)
        process_item.purchase_sources = purchase_sources
        process_item.save(update_fields=[
            'material_cost_afn', 'purchase_sources', 'updated_at',
        ])
        material_cost_total += line_cost
        stock.quantity -= quantity
        stock.piece_count -= piece_count
        stock.save(update_fields=['quantity', 'piece_count', 'updated_at'])

    # Persist the material/water mass breakdown independently of legacy output.
    mass_items = [
        item for item in items_data
        if (m := RawMaterial.all_objects.filter(pk=item['raw_material']).first()) and m.unit in {'kg', 'g'}
    ]
    weights = production_input_weights(items_data if process.output_from_inputs else mass_items, process.water_quantity_kg)
    for field, value in weights.items():
        setattr(process, field, value)
    if process.output_from_inputs:
        if weights['total_input_quantity_kg'] <= 0:
            raise ValidationError({'items': 'Total production weight must be greater than zero.'})
        process.output_quantity_kg = weights['total_input_quantity_kg']
        process.output_quantity_liters = _quantize(process.output_quantity_kg / process.density_kg_per_liter, FOUR)

    process.material_cost_afn = _quantize(material_cost_total, FOUR)
    process.total_cost_afn = _quantize(
        process.material_cost_afn + process.extra_expense_afn, FOUR
    )
    output_liters = _decimal(process.output_quantity_liters)
    process.cost_per_liter_afn = (
        _quantize(process.total_cost_afn / output_liters, SIX)
        if output_liters > 0
        else Decimal('0')
    )
    process.cost_per_kg_afn = (
        _quantize(process.total_cost_afn / _decimal(process.output_quantity_kg), SIX)
        if _decimal(process.output_quantity_kg) > 0
        else Decimal('0')
    )
    process.save(update_fields=[
        'materials_quantity_kg', 'chemistry_quantity_kg', 'total_input_quantity_kg',
        'output_quantity_kg', 'output_quantity_liters',
        'material_cost_afn',
        'extra_expense_afn',
        'total_cost_afn',
        'cost_per_liter_afn',
        'cost_per_kg_afn',
        'updated_at',
    ])
    return process
