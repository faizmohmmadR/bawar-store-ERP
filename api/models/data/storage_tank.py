from django.db import models

from api.models.data.base import BaseModel
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.products import Product


class StorageTank(BaseModel):
    name = models.CharField(max_length=255, unique=True)
    capacity_kg = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)
    capacity_liters = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    density_kg_per_liter = models.DecimalField(
        max_digits=10,
        decimal_places=6,
        default=1,
        help_text='Default kg per liter for this tank when no liquid history exists yet.',
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='storage_tanks',
        null=True,
        blank=True,
        help_text='Optional. Prefer production product_name; kept for legacy tanks.',
    )

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name


class ProductionStorageTransfer(BaseModel):
    production = models.ForeignKey(
        RawMaterialProcess,
        on_delete=models.CASCADE,
        related_name='storage_transfers',
    )
    storage_tank = models.ForeignKey(
        StorageTank,
        on_delete=models.PROTECT,
        related_name='production_transfers',
    )
    quantity_liters = models.DecimalField(max_digits=12, decimal_places=4)
    quantity_kg = models.DecimalField(max_digits=12, decimal_places=4, default=0)

    class Meta:
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['production', 'storage_tank'],
                name='uniq_production_storage_tank_transfer',
            ),
        ]

    def __str__(self):
        return f'{self.production} -> {self.storage_tank} ({self.quantity_liters} L)'
