"""Liquid leaked/spilled from a storage tank → damaged materials + tank reduction."""

from django.conf import settings
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.damaged_materials import DamagedMaterialRecord
from api.models.data.storage_tank import StorageTank


class StorageTankLeak(BaseModel):
    """
    Record leaked liquid removed from a storage tank.

    Reduces tank inventory and creates a DamagedMaterialRecord (liquid line)
    priced at the tank's current liquid unit cost.
    """

    storage_tank = models.ForeignKey(
        StorageTank,
        on_delete=models.PROTECT,
        related_name='leaks',
    )
    damaged_record = models.ForeignKey(
        DamagedMaterialRecord,
        on_delete=models.SET_NULL,
        related_name='tank_leaks',
        null=True,
        blank=True,
    )
    quantity_kg = models.DecimalField(max_digits=14, decimal_places=4)
    quantity_liters = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    density_kg_per_liter = models.DecimalField(max_digits=10, decimal_places=6, default=1)
    unit_cost_afn = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='AFN cost per kg of liquid at time of leak (snapshot).',
    )
    total_cost_afn = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    notes = models.TextField(blank=True, default='')
    recorded_at = models.DateTimeField(default=timezone.now)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='storage_tank_leaks',
    )

    class Meta:
        ordering = ['-recorded_at', '-id']

    def __str__(self):
        return f'Tank leak #{self.pk}: {self.quantity_kg} kg from tank {self.storage_tank_id}'
