"""Damaged filled bottles: spilled liquid → damaged ledger; remaining liquid → tank."""

from django.conf import settings
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.damaged_materials import DamagedMaterialRecord
from api.models.data.products import Product
from api.models.data.stock import Stock
from api.models.data.storage_tank import StorageTank


class StockBottleDamage(BaseModel):
    """
    Remove filled bottles from sellable stock, return salvageable liquid to a tank,
    and record spilled liquid on a Damaged materials row (priced).
    """

    stock = models.ForeignKey(
        Stock,
        on_delete=models.PROTECT,
        related_name='bottle_damages',
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='bottle_damages',
    )
    storage_tank = models.ForeignKey(
        StorageTank,
        on_delete=models.PROTECT,
        related_name='bottle_liquid_returns',
        null=True,
        blank=True,
        help_text='Destination for remaining (salvaged) liquid. Required when remaining > 0.',
    )
    damaged_record = models.ForeignKey(
        DamagedMaterialRecord,
        on_delete=models.SET_NULL,
        related_name='stock_bottle_damages',
        null=True,
        blank=True,
    )

    bottle_count = models.PositiveIntegerField()
    capacity_kg = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    capacity_liters = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    density_kg_per_liter = models.DecimalField(max_digits=10, decimal_places=6, default=1)

    total_liquid_kg = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    total_liquid_liters = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    remaining_liquid_kg = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    remaining_liquid_liters = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    damaged_liquid_kg = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    damaged_liquid_liters = models.DecimalField(max_digits=14, decimal_places=4, default=0)

    liquid_unit_cost_afn = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='AFN cost per kg of liquid (snapshot).',
    )
    returned_liquid_cost_afn = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    damaged_liquid_cost_afn = models.DecimalField(max_digits=18, decimal_places=6, default=0)

    bottle_sources = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True, default='')
    recorded_at = models.DateTimeField(default=timezone.now)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_bottle_damages',
    )

    class Meta:
        ordering = ['-recorded_at', '-id']

    def __str__(self):
        return f'Bottle damage #{self.pk}: {self.bottle_count} × {self.product_id}'
