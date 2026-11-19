from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.services.tank_inventory import get_tank_liquid_totals


def _decimal(value):
    return Decimal(str(value or 0))


@transaction.atomic
def replace_production_storage_transfers(production, transfers_data):
    """Replace a production run's tank transfers after enforcing both limits."""
    list(production.storage_transfers.select_for_update().all())
    production.storage_transfers.all().delete()

    transfers_data = transfers_data or []
    normalized = []
    tank_ids = []
    total_liters = Decimal('0')
    total_kg = Decimal('0')
    output_liters = _decimal(production.output_quantity_liters)
    output_kg = _decimal(production.output_quantity_kg)

    for transfer in transfers_data:
        tank_id = transfer.get('storage_tank')
        if transfer.get('quantity_kg') is not None and 'quantity_liters' not in transfer:
            quantity_liters = (
                _decimal(transfer['quantity_kg']) * output_liters / output_kg
                if output_kg > 0 else Decimal('0')
            ).quantize(Decimal('0.0001'))
        else:
            quantity_liters = _decimal(transfer.get('quantity_liters'))
        quantity_kg_raw = transfer.get('quantity_kg', None)
        if not tank_id:
            raise ValidationError({
                'storage_transfers': 'Select a storage tank for every transfer row.'
            })
        if quantity_liters <= 0:
            raise ValidationError({
                'storage_transfers': 'Transfer quantities must be greater than zero.'
            })
        tank_id = int(tank_id)
        if tank_id in tank_ids:
            raise ValidationError({
                'storage_transfers': 'Use each storage tank only once per production run.'
            })
        tank_ids.append(tank_id)

        if quantity_kg_raw is None or str(quantity_kg_raw).strip() == '':
            quantity_kg = (
                output_kg * quantity_liters / output_liters
                if output_liters > 0 else Decimal('0')
            )
        else:
            quantity_kg = _decimal(quantity_kg_raw)
            if quantity_kg <= 0:
                raise ValidationError({
                    'storage_transfers': 'Transfer kilograms must be greater than zero.'
                })

        normalized.append((tank_id, quantity_liters, quantity_kg))
        total_liters += quantity_liters
        total_kg += quantity_kg

    if len(normalized) > 1:
        raise ValidationError({
            'storage_transfers': 'A production run can be moved to only one storage tank.'
        })

    if total_liters > output_liters:
        raise ValidationError({
            'storage_transfers': 'Transferred liters cannot exceed produced liters.'
        })
    if output_kg > 0 and total_kg > output_kg:
        raise ValidationError({
            'storage_transfers': 'Transferred kilograms cannot exceed produced kilograms.'
        })

    if production.status == production.STATUS_MOVED_TO_STORAGE and not normalized:
        raise ValidationError({
            'storage_transfers': 'Select a storage tank and transfer a positive quantity.'
        })
    if production.status != production.STATUS_MOVED_TO_STORAGE and normalized:
        raise ValidationError({
            'storage_transfers': 'Transfers are only allowed when status is Moved to Storage.'
        })

    tanks_by_id = {
        tank.id: tank
        for tank in StorageTank.objects.select_for_update().filter(
            pk__in=tank_ids,
        ).order_by('id')
    }
    if len(tanks_by_id) != len(tank_ids):
        raise ValidationError({
            'storage_transfers': 'One or more selected storage tanks no longer exist.'
        })

    for tank_id, quantity_liters, _quantity_kg in normalized:
        tank = tanks_by_id[tank_id]
        already_stored, _, _ = get_tank_liquid_totals(tank, lock=True)
        if tank.capacity_kg is not None:
            from api.services.tank_inventory import get_tank_mass_quantity
            available_kg = tank.capacity_kg - get_tank_mass_quantity(tank)
            if _quantity_kg > available_kg:
                raise ValidationError({'storage_transfers': f'{tank.name} has space for {max(Decimal("0"), available_kg)} kg.'})
        elif already_stored + quantity_liters > tank.capacity_liters:
            available = max(
                Decimal('0'), tank.capacity_liters - already_stored)
            raise ValidationError({
                'storage_transfers': (
                    f'{tank.name} has space for {available} liters, '
                    f'but {quantity_liters} liters were requested.'
                )
            })

    production_density = _decimal(getattr(production, 'density_kg_per_liter', 0) or 0)
    if production_density <= 0 and output_liters > 0 and output_kg > 0:
        production_density = output_kg / output_liters

    if production_density > 0:
        for tank_id, _quantity_liters, _quantity_kg in normalized:
            tank = tanks_by_id[tank_id]
            stored_liters, _, _ = get_tank_liquid_totals(tank, lock=False)
            if stored_liters <= 0:
                tank.density_kg_per_liter = production_density
                tank.save(update_fields=['density_kg_per_liter', 'updated_at'])

    ProductionStorageTransfer.objects.bulk_create([
        ProductionStorageTransfer(
            production=production,
            storage_tank_id=tank_id,
            quantity_liters=quantity_liters,
            quantity_kg=quantity_kg,
        )
        for tank_id, quantity_liters, quantity_kg in normalized
    ])
