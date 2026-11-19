"""Transfer filled bottles out of sellable stock and pack from the returned pool."""
from decimal import Decimal
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from api.models.data.stock import Stock
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.packing import PackingReturn
from api.services.stock_valuation import sync_stock_valuation
from api.services.pooled_stock import ensure_stock_batches
from api.services.weighted_average import average


@transaction.atomic
def return_to_pack(*, stock_id, bottle_count, notes='', user=None, event_details=None):
    stock = Stock.objects.select_for_update().select_related('product__raw_material').get(pk=stock_id)
    material = stock.product.raw_material
    if stock.condition != 'good' or stock.product.stock_kind != 'bottle':
        raise ValidationError({'stock': 'Select good filled-bottle stock.'})
    count = Decimal(str(bottle_count))
    if not count.is_finite() or count <= 0 or count != count.to_integral_value():
        raise ValidationError({'bottle_count': 'Enter a positive whole bottle count.'})
    ensure_stock_batches(stock)
    lots = list(InventoryBatch.objects.select_for_update().filter(
        Q(expire_date__isnull=True) | Q(expire_date__gte=timezone.localdate()),
        product=stock.product, condition='good', status='active', remaining_pieces__gt=0,
    ).order_by(F('expire_date').asc(nulls_last=True), 'created_at', 'id'))
    if sum((lot.remaining_pieces for lot in lots), Decimal('0')) < count:
        raise ValidationError({'bottle_count': 'Not enough unexpired bottles in stock.'})
    from api.services.stock_valuation import stock_valuation
    valuation = stock_valuation(stock)
    product = stock.product
    density = Decimal(str(product.density_kg_per_liter or 1))
    volume = product.bottle_capacity_liters or getattr(material, 'capacity_liters', None)
    weight = product.bottle_capacity_kg or getattr(material, 'capacity_kg', None)
    if not volume and weight:
        volume = (weight / density).quantize(Decimal('0.0001'))
    if not weight and volume:
        weight = volume * density
    record = PackingReturn.objects.select_for_update().filter(stock=stock).first()
    if record is None:
        record = PackingReturn(stock=stock, bottle_count=0, packaging_cost_afn=0)
    now = timezone.now()
    previous = record.remaining_bottle_count if record.inventory_moved else 0
    if previous and ((volume and record.bottle_volume_liters != volume) or (weight and record.bottle_weight_kg != weight)):
        raise ValidationError({'stock': 'Bottle capacity has changed. Pack the existing returned bottles before returning the new size.'})
    value = Decimal(previous) * record.unit_cost_afn + count * valuation['average']
    record.unit_cost_afn = average(previous + count, value)
    record.bottle_count = (record.bottle_count if record.inventory_moved else 0) + int(count)
    record.remaining_bottle_count = previous + int(count)
    record.inventory_moved = True
    record.bottle_volume_liters = volume or 0
    record.bottle_weight_kg = weight or 0
    record.first_returned_at = record.first_returned_at or now
    record.last_returned_at = now
    record.performed_by = user if getattr(user, 'is_authenticated', False) else None
    record.save()
    remaining = count
    sources = []
    for lot in lots:
        take = min(remaining, lot.remaining_pieces)
        if take > 0:
            sources.append({'inventory_batch': lot.pk, 'bottle_count': int(take),
                'unit_cost_afn': str(lot.unit_cost), 'expire_date': lot.expire_date.isoformat() if lot.expire_date else None})
            lot.remaining_pieces -= take
            lot._skip_batch_journal = True
            lot.save(update_fields=['remaining_pieces', 'status', 'updated_at'])
            remaining -= take
    expiry_dates = [lot.expire_date for lot in lots if lot.expire_date and any(row['inventory_batch'] == lot.pk for row in sources)]
    if previous and record.expire_date:
        expiry_dates.append(record.expire_date)
    record.expire_date = min(expiry_dates) if expiry_dates else None
    record.bottle_sources = (record.bottle_sources or []) + sources
    from api.models.data.packing import PackingReturnEvent
    PackingReturnEvent.objects.create(packing_return=record, returned_at=now, bottle_count=int(count),
        inventory_moved=True, unit_cost_afn=valuation['average'], bottle_sources=sources,
        notes=notes, performed_by=record.performed_by, details=event_details or {})
    record.save(update_fields=['bottle_sources', 'expire_date', 'updated_at'])
    sync_stock_valuation(stock)
    return record


@transaction.atomic
def create_returned_packing_run(*, packing_return_id, bottle_count, components, notes='', existing_run=None, output_products=None):
    from api.models.data.packing import PackingRun, PackingRunComponent, PackingRunOutput
    from api.services.packing import _consume_raw_material_component, _q
    from api.models.data.raw_materials import RawMaterialStock
    from api.services.material_finished_stock import add_material_stock, resolve_output_product

    returned = PackingReturn.objects.select_for_update().select_related('stock__product__raw_material').filter(pk=packing_return_id).first()
    if returned is None or not returned.inventory_moved:
        raise ValidationError({'packing_return': 'Select bottles in returned stock.'})
    if returned.expire_date and returned.expire_date < timezone.localdate():
        raise ValidationError({'packing_return': 'These returned bottles have expired.'})
    count = Decimal(str(bottle_count))
    if not count.is_finite() or count <= 0 or count != count.to_integral_value() or count > returned.remaining_bottle_count:
        raise ValidationError({'bottle_count': f'Enter a whole bottle count up to {returned.remaining_bottle_count}.'})
    types = [row['component_type'] for row in components]
    ids = [row['raw_material'] for row in components]
    if not set(types) <= {'carton', 'plastic', 'carton_plastic'}:
        raise ValidationError({'components': 'Choose carton or plastic packaging. Filled bottles need no empty bottles, caps or labels.'})
    if len(types) != len(set(types)) or len(ids) != len(set(ids)):
        raise ValidationError({'components': 'Select each packaging component once.'})
    stocks = {row.raw_material_id: row for row in RawMaterialStock.objects.select_for_update().select_related('raw_material').filter(raw_material_id__in=ids).order_by('pk')}
    prepared = []
    for row in components:
        raw = stocks.get(row['raw_material'])
        quantity = Decimal(str(row['quantity_pieces']))
        if raw is None or raw.raw_material.material_type != row['component_type']:
            raise ValidationError({'components': 'Select the matching packaging material type.'})
        if not quantity.is_finite() or quantity <= 0 or quantity != quantity.to_integral_value():
            raise ValidationError({'components': 'Packaging quantities must be positive whole pieces.'})
        unit_cost, cost, allocations = _consume_raw_material_component(raw, quantity, None)
        prepared.append(dict(component_type=row['component_type'], raw_material_stock=raw,
            quantity_pieces=quantity, unit_cost_afn=unit_cost, total_cost_afn=cost, inventory_allocations=allocations))
    carried_cost = _q(count * returned.unit_cost_afn)
    packaging_cost = sum((row['total_cost_afn'] for row in prepared), Decimal('0'))
    run = existing_run or PackingRun()
    run.storage_tank = None
    run.packing_return = returned
    run.product = returned.stock.product
    run.finished_stock = returned.stock
    run.bottle_count = int(count)
    run.returned_bottle_count = int(count)
    run.bottle_volume_liters = returned.bottle_volume_liters
    run.quantity_liters = _q(count * returned.bottle_volume_liters)
    run.quantity_kg = _q(count * returned.bottle_weight_kg)
    run.liquid_cost_afn = 0
    run.returned_cost_afn = carried_cost
    run.packaging_cost_afn = packaging_cost
    run.total_cost_afn = carried_cost + packaging_cost
    run.cost_per_bottle_afn = _q(run.total_cost_afn / count, Decimal('0.000001'))
    run.notes = notes
    run.save()
    returned.remaining_bottle_count -= int(count)
    returned.save(update_fields=['remaining_bottle_count', 'updated_at'])
    for row in prepared:
        PackingRunComponent.objects.create(packing_run=run, **row)
    material = returned.stock.product.raw_material
    wrap_cost = sum((row['total_cost_afn'] for row in prepared if row['component_type'] == 'carton_plastic'), Decimal('0'))
    outputs = [('bottle', material, count, carried_cost + wrap_cost, returned.expire_date)]
    outputs += [(row['component_type'], row['raw_material_stock'].raw_material,
                 row['quantity_pieces'], row['total_cost_afn'], None)
                for row in prepared if row['component_type'] != 'carton_plastic']
    choices = {}
    for item in output_products or []:
        kind = item['component_type']
        if kind not in {'bottle', 'carton', 'plastic'} or kind in choices or (kind != 'bottle' and kind not in types):
            raise ValidationError({'output_products': 'Choose each available output product once.'})
        choices[kind] = item
    explicit_costs = {}
    if output_products is not None:
        from api.services.material_finished_stock import selected_output_costs
        outputs = [row for row in outputs if row[0] in choices]
        if 'bottle' in choices:
            bottle_total = run.total_cost_afn - sum((row[3] for row in outputs if row[0] != 'bottle'), Decimal('0'))
            explicit_costs = {row[0]: bottle_total if row[0] == 'bottle' else row[3] for row in outputs}
        else:
            explicit_costs = selected_output_costs([{'kind': row[0], 'quantity': row[2], 'cost': row[3]} for row in outputs], run.total_cost_afn)
        run.product = None
        run.finished_stock = None
    for component_type, material, quantity, cost, expiry in outputs:
        cost = explicit_costs.get(component_type, cost)
        choice = choices.get(component_type, {})
        product = resolve_output_product(kind=component_type, product_id=choice.get('product'), product_name=choice.get('product_name'),
            bottle_capacity_kg=returned.bottle_weight_kg if component_type == 'bottle' else None,
            bottle_capacity_liters=returned.bottle_volume_liters if component_type == 'bottle' else None,
            density=returned.stock.product.density_kg_per_liter)
        if component_type == 'bottle' and product is None:
            product = returned.stock.product
        output_stock, batch, unit_cost = add_material_stock(material=material, product=product, quantity=quantity,
            total_cost=cost, expire_date=expiry, packing=True,
            notes=f'Returned bottles #{returned.pk} packed in {run.packing_number}')
        PackingRunOutput.objects.create(packing_run=run, component_type=component_type,
            stock=output_stock, inventory_batch=batch, quantity_pieces=quantity,
            total_cost_afn=cost, unit_cost_afn=unit_cost)
        if component_type == 'bottle':
            run.product, run.finished_stock = output_stock.product, output_stock
    run.save(update_fields=['product', 'finished_stock', 'updated_at'])
    return run


@transaction.atomic
def correct_returned_quantity(*, packing_return_id, bottle_count, expected_bottle_count, notes='', user=None):
    """Correct cumulative returned count without changing bottles already packed."""
    from api.models.data.packing import PackingReturnEvent
    from api.services.material_finished_stock import add_material_stock
    stock_id = PackingReturn.objects.filter(pk=packing_return_id).values_list('stock_id', flat=True).first()
    if stock_id is None:
        raise ValidationError({'packing_return': 'Returned bottle record not found.'})
    stock = Stock.objects.select_for_update().select_related('product__raw_material').get(pk=stock_id)
    record = PackingReturn.objects.select_for_update().get(pk=packing_return_id)
    target = Decimal(str(bottle_count))
    if not target.is_finite() or target < 0 or target != target.to_integral_value() or target >= 100000000:
        raise ValidationError({'bottle_count': 'Enter a whole returned bottle count from 0 to 99,999,999.'})
    if record.bottle_count != expected_bottle_count:
        raise ValidationError({'bottle_count': 'This balance has changed. Refresh it before saving your correction.'})
    target = int(target)
    packed = record.bottle_count - record.remaining_bottle_count if record.inventory_moved else 0
    if target < packed:
        raise ValidationError({'bottle_count': f'{packed} bottles have already been packed. Correct the packing operations before reducing the total below that amount.'})
    delta = target - record.bottle_count
    if not delta:
        return record
    details = {'type': 'correction', 'quantity_change': delta, 'previous_total': record.bottle_count,
               'corrected_total': target, 'previous_remaining': record.remaining_bottle_count,
               'corrected_remaining': target - packed if record.inventory_moved else 0}
    if record.inventory_moved and delta > 0:
        return return_to_pack(stock_id=stock_id, bottle_count=delta, notes=notes, user=user, event_details=details)
    sources = []
    if record.inventory_moved:
        _, batch, _ = add_material_stock(material=stock.product.raw_material, product=stock.product, quantity=-delta,
            total_cost=Decimal(-delta) * record.unit_cost_afn, expire_date=record.expire_date,
            packing=True, notes=f'Correction of returned bottles RET-{record.pk}: {notes}')
        sources = [{'inventory_batch': batch.pk, 'bottle_count': -delta, 'returned_to_stock': True}]
        record.remaining_bottle_count += delta
    record.bottle_count = target
    record.save(update_fields=['bottle_count', 'remaining_bottle_count', 'updated_at'])
    PackingReturnEvent.objects.create(packing_return=record, bottle_count=abs(delta),
        inventory_moved=record.inventory_moved, unit_cost_afn=record.unit_cost_afn,
        bottle_sources=sources, details=details, notes=notes,
        performed_by=user if getattr(user, 'is_authenticated', False) else None)
    return record
