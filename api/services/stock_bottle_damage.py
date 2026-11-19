"""Damage filled bottles: salvage liquid → tank, spilled liquid → damaged materials."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import F, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.models.data.damaged_materials import DamagedMaterialItem, DamagedMaterialRecord
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.packing import PackingRun
from api.models.data.stock import Stock
from api.models.data.stock_bottle_damage import StockBottleDamage
from api.models.data.storage_tank import StorageTank
from api.services.pooled_stock import ensure_stock_batches
from api.services.stock_valuation import stock_valuation, sync_stock_valuation

FOUR = Decimal('0.0001')
SIX = Decimal('0.000001')
ZERO = Decimal('0')


def _d(value) -> Decimal:
    return Decimal(str(value or 0))


def _q(value, places=FOUR) -> Decimal:
    return _d(value).quantize(places, rounding=ROUND_HALF_UP)


def bottle_capacity_snapshot(product, material=None):
    """Return (capacity_kg, capacity_liters, density) for one bottle."""
    density = _d(getattr(product, 'density_kg_per_liter', None) or 1)
    if density <= 0:
        density = Decimal('1')
    capacity_kg = product.bottle_capacity_kg or getattr(material, 'capacity_kg', None)
    capacity_liters = product.bottle_capacity_liters or getattr(material, 'capacity_liters', None)
    capacity_kg = _d(capacity_kg) if capacity_kg is not None else ZERO
    capacity_liters = _d(capacity_liters) if capacity_liters is not None else ZERO
    if capacity_kg <= 0 and capacity_liters > 0:
        capacity_kg = _q(capacity_liters * density)
    if capacity_liters <= 0 and capacity_kg > 0:
        capacity_liters = _q(capacity_kg / density)
    if capacity_kg <= 0 and capacity_liters <= 0:
        raise ValidationError({
            'stock': 'This product has no bottle capacity (kg or liters). Set capacity before recording damage.',
        })
    return _q(capacity_kg), _q(capacity_liters), _q(density, SIX)


def liquid_unit_cost_per_kg(product, *, storage_tank=None) -> Decimal:
    """Prefer packing liquid MWA for this product; else tank cost; else bottle avg / capacity."""
    packed = PackingRun.objects.filter(
        deleted_at__isnull=True,
        quantity_kg__gt=0,
        liquid_cost_afn__gt=0,
    ).filter(
        Q(product=product) | Q(finished_stock__product=product) | Q(outputs__stock__product=product),
    ).aggregate(cost=Sum('liquid_cost_afn'), kilograms=Sum('quantity_kg'))
    kilograms = _d(packed['kilograms'])
    cost = _d(packed['cost'])
    if kilograms > 0 and cost > 0:
        return _q(cost / kilograms, SIX)

    if storage_tank is not None:
        from api.services.tank_inventory import get_tank_density, get_tank_liquid_totals
        _liters, _tank_cost, per_liter = get_tank_liquid_totals(storage_tank)
        density = get_tank_density(storage_tank)
        if per_liter > 0 and density > 0:
            return _q(per_liter / density, SIX)

    stock = Stock.objects.filter(product=product, condition='good').first()
    if stock is not None:
        capacity_kg, _, _ = bottle_capacity_snapshot(product, product.raw_material)
        if capacity_kg > 0:
            avg = _d(stock_valuation(stock)['average'])
            if avg > 0:
                return _q(avg / capacity_kg, SIX)
    return ZERO


def _reduce_bottles(stock: Stock, bottle_count: Decimal):
    ensure_stock_batches(stock)
    lots = list(
        InventoryBatch.objects.select_for_update().filter(
            Q(expire_date__isnull=True) | Q(expire_date__gte=timezone.localdate()),
            product=stock.product,
            condition='good',
            status='active',
            remaining_pieces__gt=0,
        ).order_by(F('expire_date').asc(nulls_last=True), 'created_at', 'id')
    )
    available = sum((lot.remaining_pieces for lot in lots), ZERO)
    if available < bottle_count:
        raise ValidationError({
            'bottle_count': f'Not enough unexpired bottles in stock ({available} available).',
        })
    remaining = bottle_count
    sources = []
    for lot in lots:
        if remaining <= 0:
            break
        take = min(remaining, lot.remaining_pieces)
        if take <= 0:
            continue
        sources.append({
            'inventory_batch': lot.pk,
            'bottle_count': int(take),
            'unit_cost_afn': str(lot.unit_cost),
            'expire_date': lot.expire_date.isoformat() if lot.expire_date else None,
        })
        lot.remaining_pieces = _q(lot.remaining_pieces - take)
        if lot.remaining_pieces <= 0:
            lot.status = InventoryBatch.STATUS_EMPTY
            lot.remaining_pieces = ZERO
        lot._skip_batch_journal = True
        lot.save(update_fields=['remaining_pieces', 'status', 'updated_at'])
        remaining = _q(remaining - take)
    sync_stock_valuation(stock)
    return sources


def _ensure_tank_space(tank: StorageTank, liters: Decimal, kilograms: Decimal):
    from api.services.tank_inventory import get_tank_liquid_totals, get_tank_mass_quantity

    current_liters, _, _ = get_tank_liquid_totals(tank, lock=True)
    if tank.capacity_kg is not None:
        available_kg = _q(_d(tank.capacity_kg) - get_tank_mass_quantity(tank))
        if kilograms > available_kg:
            raise ValidationError({
                'storage_tank': (
                    f'{tank.name} has space for {max(ZERO, available_kg)} kg, '
                    f'but {kilograms} kg remaining liquid was requested.'
                ),
            })
    elif _d(tank.capacity_liters) > 0 and current_liters + liters > _d(tank.capacity_liters):
        available = max(ZERO, _q(_d(tank.capacity_liters) - current_liters))
        raise ValidationError({
            'storage_tank': (
                f'{tank.name} has space for {available} liters, '
                f'but {liters} liters remaining liquid was requested.'
            ),
        })


@transaction.atomic
def damage_bottles_from_stock(
    *,
    stock_id,
    bottle_count,
    remaining_liquid_kg,
    storage_tank_id=None,
    notes: str = '',
    user=None,
) -> StockBottleDamage:
    stock = (
        Stock.objects.select_for_update()
        .select_related('product__raw_material')
        .get(pk=stock_id)
    )
    product = stock.product
    material = product.raw_material
    if stock.condition != 'good' or product.stock_kind != 'bottle':
        raise ValidationError({'stock': 'Select good filled-bottle stock.'})

    count = _d(bottle_count)
    if not count.is_finite() or count <= 0 or count != count.to_integral_value():
        raise ValidationError({'bottle_count': 'Enter a positive whole bottle count.'})
    count = count.to_integral_value()

    capacity_kg, capacity_liters, density = bottle_capacity_snapshot(product, material)
    total_kg = _q(count * capacity_kg)
    total_liters = _q(count * capacity_liters)

    remaining_kg = _q(remaining_liquid_kg)
    if remaining_kg < 0:
        raise ValidationError({'remaining_liquid_kg': 'Remaining liquid cannot be negative.'})
    if remaining_kg > total_kg:
        raise ValidationError({
            'remaining_liquid_kg': f'Remaining liquid cannot exceed total liquid ({total_kg} kg).',
        })
    damaged_kg = _q(total_kg - remaining_kg)
    remaining_liters = _q(remaining_kg / density) if density > 0 else ZERO
    damaged_liters = _q(damaged_kg / density) if density > 0 else ZERO

    tank = None
    if remaining_kg > 0:
        if not storage_tank_id:
            raise ValidationError({
                'storage_tank': 'Choose a storage tank for the remaining liquid.',
            })
        tank = StorageTank.objects.select_for_update().get(pk=storage_tank_id)
        _ensure_tank_space(tank, remaining_liters, remaining_kg)
        if tank.density_kg_per_liter is None or _d(tank.density_kg_per_liter) <= 0:
            tank.density_kg_per_liter = density
            tank.save(update_fields=['density_kg_per_liter', 'updated_at'])

    unit_cost = liquid_unit_cost_per_kg(product, storage_tank=tank)
    returned_cost = _q(remaining_kg * unit_cost, SIX)
    damaged_cost = _q(damaged_kg * unit_cost, SIX)

    sources = _reduce_bottles(stock, count)

    damaged_record = None
    if damaged_kg > 0:
        damaged_record = DamagedMaterialRecord(
            record_date=timezone.now(),
            notes=(notes or '').strip() or (
                f'Spilled liquid from {int(count)} damaged '
                f'{product.name} bottle(s).'
            ),
            source=DamagedMaterialRecord.SOURCE_STOCK_BOTTLE,
            total_cost_afn=damaged_cost,
        )
        damaged_record.save()
        DamagedMaterialItem.objects.create(
            record=damaged_record,
            component_type=DamagedMaterialRecord.COMPONENT_LIQUID,
            raw_material=None,
            product=product,
            quantity_pieces=damaged_kg,
            unit=DamagedMaterialItem.UNIT_KG,
            unit_price_afn=unit_cost,
            total_cost_afn=damaged_cost,
        )

    record = StockBottleDamage.objects.create(
        stock=stock,
        product=product,
        storage_tank=tank,
        damaged_record=damaged_record,
        bottle_count=int(count),
        capacity_kg=capacity_kg,
        capacity_liters=capacity_liters,
        density_kg_per_liter=density,
        total_liquid_kg=total_kg,
        total_liquid_liters=total_liters,
        remaining_liquid_kg=remaining_kg,
        remaining_liquid_liters=remaining_liters,
        damaged_liquid_kg=damaged_kg,
        damaged_liquid_liters=damaged_liters,
        liquid_unit_cost_afn=unit_cost,
        returned_liquid_cost_afn=returned_cost,
        damaged_liquid_cost_afn=damaged_cost,
        bottle_sources=sources,
        notes=(notes or '').strip(),
        performed_by=user if getattr(user, 'is_authenticated', False) else None,
    )
    return _reload(record.pk)


def _reload(pk: int) -> StockBottleDamage:
    return StockBottleDamage.objects.select_related(
        'stock__product',
        'storage_tank',
        'damaged_record',
        'product',
        'performed_by',
    ).get(pk=pk)


def _restore_bottles(stock: Stock, sources, bottle_count: int, unit_cost: Decimal) -> None:
    """Put bottles back onto original lots when possible."""
    remaining = _d(bottle_count)
    stock = Stock.objects.select_for_update().select_related('product__raw_material').get(pk=stock.pk)
    for src in reversed(list(sources or [])):
        if remaining <= 0:
            break
        batch_id = src.get('inventory_batch')
        qty = _d(src.get('bottle_count') or 0)
        if not batch_id or qty <= 0:
            continue
        batch = InventoryBatch.objects.select_for_update().filter(pk=batch_id).first()
        if batch is None:
            continue
        take = min(remaining, qty)
        batch.remaining_pieces = _q(_d(batch.remaining_pieces) + take)
        if batch.status == InventoryBatch.STATUS_EMPTY and batch.remaining_pieces > 0:
            batch.status = InventoryBatch.STATUS_ACTIVE
        batch._skip_batch_journal = True
        batch.save(update_fields=['remaining_pieces', 'status', 'updated_at'])
        remaining = _q(remaining - take)

    if remaining > 0:
        from api.services.material_finished_stock import add_material_stock
        add_material_stock(
            material=stock.product.raw_material,
            product=stock.product,
            quantity=remaining,
            total_cost=_q(remaining * unit_cost, SIX),
            packing=True,
            notes='Restored from bottle damage correction',
        )
    sync_stock_valuation(stock)


def _delete_linked_damaged_record(record: StockBottleDamage, *, user=None) -> None:
    damaged = record.damaged_record
    if damaged is None:
        return
    record.damaged_record = None
    record.save(update_fields=['damaged_record', 'updated_at'])
    # Soft-delete the spill row (bypass packaging-form delete guard).
    if hasattr(damaged, 'soft_delete'):
        damaged.soft_delete(user=user)
    else:
        damaged.delete()


@transaction.atomic
def reverse_bottle_damage(record: StockBottleDamage, *, user=None) -> None:
    """Undo stock reduction + tank credit + damaged liquid row + GL, then soft-delete."""
    from api.services.accounting import delete_journal_for_source

    record = StockBottleDamage.objects.select_for_update().select_related(
        'stock__product__raw_material', 'damaged_record',
    ).get(pk=record.pk)
    if record.deleted_at:
        return
    avg_bottle_cost = ZERO
    if record.bottle_count > 0 and record.capacity_kg > 0:
        avg_bottle_cost = _q(record.liquid_unit_cost_afn * record.capacity_kg, SIX)
    _restore_bottles(
        record.stock,
        record.bottle_sources,
        int(record.bottle_count),
        avg_bottle_cost or _d(stock_valuation(record.stock)['average']),
    )
    delete_journal_for_source(record)
    _delete_linked_damaged_record(record, user=user)
    record.soft_delete(user=user)


@transaction.atomic
def update_bottle_damage(
    *,
    damage_id,
    bottle_count,
    remaining_liquid_kg,
    storage_tank_id=None,
    notes: str = '',
    user=None,
) -> StockBottleDamage:
    """
    Correct a bottle-damage event: restore previous effect, then re-apply with new values.
    Keeps the same StockBottleDamage row id when possible by reversing then recreating
    is awkward for FKs — instead reverse soft-deletes and create a fresh row.
    """
    existing = StockBottleDamage.objects.select_for_update().select_related(
        'stock', 'damaged_record',
    ).get(pk=damage_id)
    if existing.deleted_at:
        raise ValidationError({'detail': 'This bottle damage record was already reversed.'})

    stock_id = existing.stock_id
    reverse_bottle_damage(existing)
    return damage_bottles_from_stock(
        stock_id=stock_id,
        bottle_count=bottle_count,
        remaining_liquid_kg=remaining_liquid_kg,
        storage_tank_id=storage_tank_id,
        notes=notes,
        user=user,
    )
