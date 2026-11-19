"""Damaged packaging materials and spilled liquid — packaging is record-only; liquid may link to stock bottle damage."""

from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.products import Product
from api.models.data.raw_materials import RawMaterial


class DamagedMaterialRecord(BaseModel):
    """One damaged entry: packaging lines and/or a liquid (spill) line."""

    COMPONENT_LABEL = 'label'
    COMPONENT_PLASTIC = 'plastic'
    COMPONENT_CARTON = 'carton'
    COMPONENT_LIQUID = 'liquid'
    COMPONENT_CHOICES = [
        (COMPONENT_LABEL, 'Label'),
        (COMPONENT_PLASTIC, 'Plastic'),
        (COMPONENT_CARTON, 'Carton'),
        (COMPONENT_LIQUID, 'Liquid'),
    ]
    COMPONENT_MATERIAL_TYPES = {
        COMPONENT_LABEL: RawMaterial.LABEL_TYPES,
        COMPONENT_PLASTIC: (RawMaterial.TYPE_PLASTIC,),
        COMPONENT_CARTON: (RawMaterial.TYPE_CARTON,),
    }

    SOURCE_MANUAL = 'manual'
    SOURCE_STOCK_BOTTLE = 'stock_bottle'
    SOURCE_TANK_LEAK = 'tank_leak'
    SOURCE_CHOICES = [
        (SOURCE_MANUAL, 'Manual packaging'),
        (SOURCE_STOCK_BOTTLE, 'Stock bottle damage'),
        (SOURCE_TANK_LEAK, 'Storage tank leak'),
    ]

    damaged_number = models.CharField(max_length=50, unique=True, blank=True)
    record_date = models.DateTimeField(default=timezone.now)
    notes = models.TextField(blank=True, null=True)
    total_cost_afn = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        default=SOURCE_MANUAL,
        db_index=True,
    )

    class Meta:
        ordering = ['-record_date', '-id']

    def save(self, *args, **kwargs):
        if not self.damaged_number:
            from api.services.document_numbers import allocate_damaged_number
            self.damaged_number = allocate_damaged_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.damaged_number or f'Damaged #{self.pk}'


class DamagedMaterialItem(BaseModel):
    """One line on a damaged record. Packaging uses pieces; liquid uses kg."""

    UNIT_PIECE = 'piece'
    UNIT_KG = 'kg'
    UNIT_CHOICES = [
        (UNIT_PIECE, 'Piece'),
        (UNIT_KG, 'Kilogram'),
    ]

    record = models.ForeignKey(
        DamagedMaterialRecord,
        on_delete=models.CASCADE,
        related_name='items',
    )
    component_type = models.CharField(
        max_length=20,
        choices=DamagedMaterialRecord.COMPONENT_CHOICES,
    )
    raw_material = models.ForeignKey(
        RawMaterial,
        on_delete=models.PROTECT,
        related_name='damaged_items',
        null=True,
        blank=True,
        help_text='Required for packaging lines; null for liquid spill lines.',
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='damaged_liquid_items',
        null=True,
        blank=True,
        help_text='Finished product whose liquid was damaged (liquid lines).',
    )
    quantity_pieces = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text='Pieces for packaging, or kilograms for liquid.',
    )
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default=UNIT_PIECE)
    unit_price_afn = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Snapshot unit price in AFN (per piece or per kg).',
    )
    total_cost_afn = models.DecimalField(max_digits=18, decimal_places=6, default=0)

    class Meta:
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['record', 'component_type'],
                name='uniq_damaged_item_component_per_record',
            ),
        ]

    def __str__(self):
        target = self.raw_material_id or self.product_id
        return f'{self.component_type}: {target} x {self.quantity_pieces} {self.unit}'
