"""Record / correct / reverse storage-tank liquid leaks as damaged materials."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.models.data.damaged_materials import DamagedMaterialItem, DamagedMaterialRecord
from api.models.data.storage_tank import StorageTank
from api.models.data.storage_tank_leak import StorageTankLeak

FOUR = Decimal('0.0001')
SIX = Decimal('0.000001')
ZERO = Decimal('0')


def _d(value) -> Decimal:
    return Decimal(str(value or 0))


def _q(value, places=FOUR) -> Decimal:
    return _d(value).quantize(places, rounding=ROUND_HALF_UP)


def _reload(pk: int) -> StorageTankLeak:
    return StorageTankLeak.objects.select_related(
        'storage_tank',
        'storage_tank__product',
        'damaged_record',
        'performed_by',
    ).get(pk=pk)


def _delete_linked_damaged_record(leak: StorageTankLeak, *, user=None) -> None:
    damaged = leak.damaged_record
    if damaged is None:
        return
    leak.damaged_record = None
    leak.save(update_fields=['damaged_record', 'updated_at'])
    if hasattr(damaged, 'soft_delete'):
        damaged.soft_delete(user=user)
    else:
        damaged.delete()


@transaction.atomic
def record_tank_leak(
    *,
    storage_tank_id,
    quantity_kg,
    notes: str = '',
    recorded_at=None,
    user=None,
    exclude_leak_id=None,
) -> StorageTankLeak:
    from api.services.tank_inventory import get_tank_density, get_tank_liquid_totals, get_tank_mass_quantity

    tank = StorageTank.objects.select_for_update().select_related('product').get(pk=storage_tank_id)
    kg = _q(quantity_kg)
    if kg <= 0:
        raise ValidationError({'quantity_kg': 'Enter a leaked amount greater than zero.'})

    available_kg = get_tank_mass_quantity(tank, exclude_leak_id=exclude_leak_id)
    if kg > available_kg:
        raise ValidationError({
            'quantity_kg': (
                f'{tank.name} has only {available_kg} kg available; '
                f'cannot record a leak of {kg} kg.'
            ),
        })

    density = get_tank_density(tank)
    if density <= 0:
        density = Decimal('1')
    liters = _q(kg / density) if density else ZERO
    _, _, per_liter = get_tank_liquid_totals(tank, lock=True, exclude_leak_id=exclude_leak_id)
    unit_cost = _q(per_liter / density, SIX) if density > 0 and per_liter > 0 else ZERO
    total_cost = _q(kg * unit_cost, SIX)

    product = tank.product
    damaged = DamagedMaterialRecord(
        record_date=recorded_at or timezone.now(),
        notes=(notes or '').strip() or f'Leaked liquid from storage tank {tank.name}.',
        source=DamagedMaterialRecord.SOURCE_TANK_LEAK,
        total_cost_afn=total_cost,
    )
    damaged.save()
    DamagedMaterialItem.objects.create(
        record=damaged,
        component_type=DamagedMaterialRecord.COMPONENT_LIQUID,
        raw_material=None,
        product=product,
        quantity_pieces=kg,
        unit=DamagedMaterialItem.UNIT_KG,
        unit_price_afn=unit_cost,
        total_cost_afn=total_cost,
    )

    leak = StorageTankLeak.objects.create(
        storage_tank=tank,
        damaged_record=damaged,
        quantity_kg=kg,
        quantity_liters=liters,
        density_kg_per_liter=density,
        unit_cost_afn=unit_cost,
        total_cost_afn=total_cost,
        notes=(notes or '').strip(),
        recorded_at=recorded_at or timezone.now(),
        performed_by=user if getattr(user, 'is_authenticated', False) else None,
    )
    return _reload(leak.pk)


@transaction.atomic
def reverse_tank_leak(leak: StorageTankLeak, *, user=None) -> None:
    from api.services.accounting import delete_journal_for_source

    leak = StorageTankLeak.objects.select_for_update().select_related('damaged_record').get(pk=leak.pk)
    if leak.deleted_at:
        return
    delete_journal_for_source(leak)
    _delete_linked_damaged_record(leak, user=user)
    leak.soft_delete(user=user)


@transaction.atomic
def update_tank_leak(
    *,
    leak_id,
    quantity_kg,
    notes: str = '',
    recorded_at=None,
    user=None,
) -> StorageTankLeak:
    existing = StorageTankLeak.objects.select_for_update().select_related(
        'storage_tank', 'damaged_record',
    ).get(pk=leak_id)
    if existing.deleted_at:
        raise ValidationError({'detail': 'This leak record was already reversed.'})

    tank_id = existing.storage_tank_id
    reverse_tank_leak(existing, user=user)
    return record_tank_leak(
        storage_tank_id=tank_id,
        quantity_kg=quantity_kg,
        notes=notes,
        recorded_at=recorded_at,
        user=user,
        exclude_leak_id=existing.pk,
    )
