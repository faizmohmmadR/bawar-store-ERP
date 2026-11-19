"""Create/update damaged packaging records without touching inventory."""

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.models.data.damaged_materials import DamagedMaterialItem, DamagedMaterialRecord
from api.models.data.raw_materials import RawMaterial, RawMaterialStock

SIX = Decimal('0.000001')
FOUR = Decimal('0.0001')
DAMAGED_MATERIAL_TYPES = (
    *RawMaterial.LABEL_TYPES,
    RawMaterial.TYPE_PLASTIC,
    RawMaterial.TYPE_CARTON,
)


def _q(value, places=SIX) -> Decimal:
    return Decimal(str(value or 0)).quantize(places, rounding=ROUND_HALF_UP)


def unit_price_from_raw_stock(raw_material: RawMaterial) -> Decimal:
    stock = RawMaterialStock.objects.filter(raw_material=raw_material).first()
    if stock is None:
        return Decimal('0')
    return _q(stock.last_purchase_price)


def list_damaged_material_options(*, include_raw_material_ids=None):
    """Material options for damaged label/plastic/carton rows (read-only prices; no stock consume)."""
    from api.services.weighted_average import raw_stock_unit_cost

    include_ids = {int(pk) for pk in (include_raw_material_ids or []) if pk}
    # Prefer stock rows (for MWA price). Also include material definitions with no stock yet.
    stocks = RawMaterialStock.objects.filter(
        raw_material__material_type__in=DAMAGED_MATERIAL_TYPES,
    ).select_related('raw_material', 'raw_material__category').order_by('raw_material__name')

    results = []
    seen_materials = set()
    for stock in stocks:
        material = stock.raw_material
        uses_piece_count = material.unit == RawMaterial.UNIT_KG
        available = _q(stock.piece_count if uses_piece_count else stock.quantity, FOUR)
        seen_materials.add(material.id)
        results.append({
            'raw_material': material.id,
            'raw_material_name': material.name,
            'category': material.category_id,
            'category_name': material.category.name if material.category_id else None,
            'material_type': material.material_type,
            'unit': 'piece',
            'capacity_liters': str(material.capacity_liters) if material.capacity_liters is not None else None,
            'capacity_kg': str(material.capacity_kg) if material.capacity_kg is not None else None,
            'capacity_display_unit': material.capacity_display_unit,
            'bottles_per_carton': material.bottles_per_carton,
            'bottles_per_plastic': material.bottles_per_plastic,
            'available_quantity': str(available),
            'unit_cost_afn': str(raw_stock_unit_cost(stock)),
            'purchase_lots': [],
        })

    missing = RawMaterial.objects.filter(
        material_type__in=DAMAGED_MATERIAL_TYPES,
    ).filter(
        Q(id__in=include_ids) | ~Q(id__in=seen_materials),
    ).select_related('category').order_by('name')
    for material in missing:
        if material.id in seen_materials:
            continue
        seen_materials.add(material.id)
        results.append({
            'raw_material': material.id,
            'raw_material_name': material.name,
            'category': material.category_id,
            'category_name': material.category.name if material.category_id else None,
            'material_type': material.material_type,
            'unit': 'piece',
            'capacity_liters': str(material.capacity_liters) if material.capacity_liters is not None else None,
            'capacity_kg': str(material.capacity_kg) if material.capacity_kg is not None else None,
            'capacity_display_unit': material.capacity_display_unit,
            'bottles_per_carton': material.bottles_per_carton,
            'bottles_per_plastic': material.bottles_per_plastic,
            'available_quantity': '0',
            'unit_cost_afn': '0',
            'purchase_lots': [],
        })
    results.sort(key=lambda row: row['raw_material_name'].lower())
    return results


def _validate_item(*, component_type: str, raw_material: RawMaterial, quantity_pieces) -> Decimal:
    if component_type == DamagedMaterialRecord.COMPONENT_LIQUID:
        raise ValidationError({
            'component_type': (
                'Liquid damage is recorded from Stock → Damage bottles, '
                'not from the packaging damaged form.'
            ),
        })
    allowed = DamagedMaterialRecord.COMPONENT_MATERIAL_TYPES.get(component_type)
    if not allowed:
        raise ValidationError({'component_type': f'Invalid component type: {component_type}'})
    if raw_material is None:
        raise ValidationError({'raw_material': 'Select a packaging material.'})
    if raw_material.material_type not in allowed:
        raise ValidationError({
            'raw_material': (
                f'{raw_material.name} is type "{raw_material.material_type}", '
                f'not valid for {component_type}.'
            ),
        })
    qty = _q(quantity_pieces, FOUR)
    if qty <= 0:
        raise ValidationError({'quantity_pieces': 'Quantity must be greater than zero.'})
    return qty


def _item_costs(raw_material: RawMaterial, quantity_pieces: Decimal, unit_price_afn=None):
    if unit_price_afn is None or Decimal(str(unit_price_afn or 0)) < 0:
        price = unit_price_from_raw_stock(raw_material)
    else:
        price = _q(unit_price_afn)
    return price, _q(price * quantity_pieces)


@transaction.atomic
def save_damaged_record(*, items, record=None, record_date=None, notes: str = '') -> DamagedMaterialRecord:
    """
    Persist a damaged packaging record with up to one line each for label/plastic/carton.

    Does not increase or decrease raw-material or finished stock.
    Liquid spill lines are created only via stock bottle damage.
    """
    if not items:
        raise ValidationError({'items': 'Add at least one damaged packaging line.'})

    if record is not None and record.source in (
        DamagedMaterialRecord.SOURCE_STOCK_BOTTLE,
        DamagedMaterialRecord.SOURCE_TANK_LEAK,
    ):
        raise ValidationError({
            'detail': (
                'Liquid damaged records from stock or storage leaks are managed '
                'from Stock / Storage and cannot be edited here.'
            ),
        })

    seen = set()
    prepared = []
    for raw in items:
        component_type = raw.get('component_type')
        if component_type in seen:
            raise ValidationError({
                'items': f'Duplicate {component_type} line. Only one row per packaging type.',
            })
        seen.add(component_type)
        raw_material = raw['raw_material']
        if not isinstance(raw_material, RawMaterial):
            raw_material = RawMaterial.objects.get(pk=raw_material)
        qty = _validate_item(
            component_type=component_type,
            raw_material=raw_material,
            quantity_pieces=raw.get('quantity_pieces'),
        )
        unit_price, total = _item_costs(raw_material, qty, raw.get('unit_price_afn'))
        prepared.append({
            'component_type': component_type,
            'raw_material': raw_material,
            'quantity_pieces': qty,
            'unit_price_afn': unit_price,
            'total_cost_afn': total,
        })

    if record is None:
        record = DamagedMaterialRecord(
            record_date=record_date or timezone.now(),
            notes=(notes or '').strip(),
            source=DamagedMaterialRecord.SOURCE_MANUAL,
        )
    else:
        record = DamagedMaterialRecord.objects.select_for_update().get(pk=record.pk)
        if record_date is not None:
            record.record_date = record_date
        if notes is not None:
            record.notes = (notes or '').strip()
        record.items.all().delete()

    record.total_cost_afn = sum((row['total_cost_afn'] for row in prepared), Decimal('0'))
    record.save()

    DamagedMaterialItem.objects.bulk_create([
        DamagedMaterialItem(
            record=record,
            component_type=row['component_type'],
            raw_material=row['raw_material'],
            quantity_pieces=row['quantity_pieces'],
            unit=DamagedMaterialItem.UNIT_PIECE,
            unit_price_afn=row['unit_price_afn'],
            total_cost_afn=row['total_cost_afn'],
        )
        for row in prepared
    ])
    return DamagedMaterialRecord.objects.prefetch_related(
        'items__raw_material', 'items__product',
    ).get(pk=record.pk)


@transaction.atomic
def delete_damaged_record(record: DamagedMaterialRecord) -> None:
    """Delete a manual packaging damaged record. Bottle-spill rows are blocked."""
    if record.source in (
        DamagedMaterialRecord.SOURCE_STOCK_BOTTLE,
        DamagedMaterialRecord.SOURCE_TANK_LEAK,
    ):
        raise ValidationError({
            'detail': (
                'Liquid damaged records from stock or storage leaks cannot be deleted here. '
                'Reverse them from Stock / Storage instead.'
            ),
        })
    record.delete()
