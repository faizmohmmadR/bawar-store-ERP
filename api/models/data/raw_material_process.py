from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.products import Product
from api.models.data.raw_materials import RawMaterial, RawMaterialPurchaseItem


class RawMaterialProcess(BaseModel):
    """A production run consuming raw materials into a named output."""
    STATUS_IN_PROCESS = 'in_process'
    STATUS_COMPLETED = 'completed'
    STATUS_MOVED_TO_STORAGE = 'moved_to_storage'
    STATUS_CHOICES = [
        (STATUS_IN_PROCESS, 'In Process'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_MOVED_TO_STORAGE, 'Moved to Storage'),
    ]

    process_number = models.CharField(max_length=50, unique=True, blank=True)
    product_name = models.CharField(max_length=255)
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='production_runs',
        null=True,
        blank=True,
    )
    density_kg_per_liter = models.DecimalField(
        max_digits=10,
        decimal_places=6,
        default=1,
        help_text='Product density snapshot used for this production run.',
    )
    process_date = models.DateTimeField(default=timezone.now)
    status = models.CharField(
        max_length=24,
        choices=STATUS_CHOICES,
        default=STATUS_IN_PROCESS,
    )
    output_quantity_liters = models.DecimalField(
        max_digits=12, decimal_places=4)
    output_quantity_kg = models.DecimalField(
        max_digits=12, decimal_places=4, default=0)
    water_quantity_kg = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    water_quantity_liters = models.DecimalField(
        max_digits=12, decimal_places=4, default=0)
    output_from_inputs = models.BooleanField(default=False)
    materials_quantity_kg = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    chemistry_quantity_kg = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    total_input_quantity_kg = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    extra_expense = models.DecimalField(
        max_digits=15, decimal_places=4, default=0)
    expense_currency = models.IntegerField(choices=CURRENCY_CHOICES, default=1)
    material_cost_afn = models.DecimalField(
        max_digits=15, decimal_places=4, default=0)
    extra_expense_afn = models.DecimalField(
        max_digits=15, decimal_places=4, default=0)
    total_cost_afn = models.DecimalField(
        max_digits=15, decimal_places=4, default=0)
    cost_per_liter_afn = models.DecimalField(
        max_digits=18, decimal_places=6, default=0)
    cost_per_kg_afn = models.DecimalField(
        max_digits=18, decimal_places=6, default=0)
    usd_to_afn_rate = models.DecimalField(
        max_digits=18, decimal_places=6, null=True, blank=True, editable=False,
        help_text="Saved AFN per USD for cost reporting; null when no rate exists.",
    )
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def save(self, *args, **kwargs):
        if self._state.adding and self.usd_to_afn_rate is None:
            from api.services.cost_currency import usd_cost_rate
            self.usd_to_afn_rate = usd_cost_rate(getattr(self, "process_date", None))
        if not self.process_number:
            from api.services.document_numbers import allocate_raw_material_process_number

            self.process_number = allocate_raw_material_process_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.process_number} - {self.product_name}'


class RawMaterialProcessItem(BaseModel):
    """An ingredient quantity entered for a production run."""
    process = models.ForeignKey(
        RawMaterialProcess,
        on_delete=models.CASCADE,
        related_name='items',
    )
    raw_material = models.ForeignKey(
        RawMaterial,
        on_delete=models.PROTECT,
        related_name='process_items',
    )
    quantity = models.DecimalField(max_digits=12, decimal_places=4)
    piece_count = models.PositiveIntegerField(default=0)
    material_cost_afn = models.DecimalField(
        max_digits=15, decimal_places=4, default=0)
    purchase_sources = models.JSONField(default=list)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.raw_material.name} - {self.quantity} {self.raw_material.unit}'
