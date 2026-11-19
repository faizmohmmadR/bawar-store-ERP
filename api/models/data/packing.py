
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.products import Product
from api.models.data.raw_materials import RawMaterialStock
from api.models.data.stock import Stock
from api.models.data.storage_tank import StorageTank


class PackingRun(BaseModel):
    """A transaction that bottles bulk liquid from a tank into finished stock."""
    COMPONENT_BOTTLE = 'bottle'
    COMPONENT_CAP = 'cap'
    COMPONENT_CAP_LABEL = 'cap_label'
    COMPONENT_LABEL = 'label'
    COMPONENT_PLASTIC = 'plastic'
    COMPONENT_CARTON = 'carton'
    COMPONENT_CARTON_PLASTIC = 'carton_plastic'
    COMPONENT_CHOICES = [
        (COMPONENT_BOTTLE, 'Bottle'),
        (COMPONENT_CAP, 'Cap'),
        (COMPONENT_CAP_LABEL, 'Cap label'),
        (COMPONENT_LABEL, 'Label'),
        (COMPONENT_PLASTIC, 'Plastic'),
        (COMPONENT_CARTON, 'Carton'),
        (COMPONENT_CARTON_PLASTIC, 'Carton plastic'),
    ]

    packing_number = models.CharField(max_length=40, unique=True, blank=True)
    storage_tank = models.ForeignKey(
        StorageTank,
        on_delete=models.PROTECT,
        related_name='packing_runs',
        null=True, blank=True,
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='packing_runs',
        null=True,
        blank=True,
    )
    finished_stock = models.ForeignKey(
        Stock,
        on_delete=models.PROTECT,
        related_name='packing_runs',
        null=True,
        blank=True,
    )
    packing_return = models.ForeignKey('PackingReturn', on_delete=models.PROTECT, null=True, blank=True, related_name='packing_runs')
    returned_bottle_count = models.PositiveIntegerField(default=0)
    returned_cost_afn = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    quantity_liters = models.DecimalField(max_digits=12, decimal_places=4)
    quantity_kg = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    bottle_volume_liters = models.DecimalField(max_digits=8, decimal_places=4)
    bottle_count = models.PositiveIntegerField()
    liquid_cost_afn = models.DecimalField(max_digits=15, decimal_places=4)
    packaging_cost_afn = models.DecimalField(max_digits=15, decimal_places=4)
    total_cost_afn = models.DecimalField(max_digits=15, decimal_places=4)
    cost_per_bottle_afn = models.DecimalField(max_digits=15, decimal_places=6)
    usd_to_afn_rate = models.DecimalField(
        max_digits=18, decimal_places=6, null=True, blank=True, editable=False,
        help_text="Saved AFN per USD for cost reporting; null when no rate exists.",
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at', '-id']

    def save(self, *args, **kwargs):
        if self._state.adding and self.usd_to_afn_rate is None:
            from api.services.cost_currency import usd_cost_rate
            # Packing has no business packing_date field; use created_at when known,
            # otherwise "now" for brand-new rows before first save.
            rate_at = getattr(self, 'created_at', None)
            self.usd_to_afn_rate = usd_cost_rate(rate_at)
        if not self.packing_number:
            from api.services.document_numbers import allocate_packing_number
            self.packing_number = allocate_packing_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.packing_number} - {self.storage_tank.name if self.storage_tank_id else self.product}'


class PackingRunComponent(BaseModel):
    packing_run = models.ForeignKey(
        PackingRun,
        on_delete=models.CASCADE,
        related_name='components',
    )
    component_type = models.CharField(
        max_length=20,
        choices=PackingRun.COMPONENT_CHOICES + [('returned_carton', 'Returned bottle carton')],
    )
    stock = models.ForeignKey(
        Stock,
        on_delete=models.PROTECT,
        related_name='packing_consumptions',
        null=True,
        blank=True,
    )
    raw_material_stock = models.ForeignKey(
        RawMaterialStock,
        on_delete=models.PROTECT,
        related_name='packing_run_components',
        null=True,
        blank=True,
    )
    quantity_pieces = models.DecimalField(max_digits=12, decimal_places=4)
    unit_cost_afn = models.DecimalField(max_digits=15, decimal_places=6)
    total_cost_afn = models.DecimalField(max_digits=15, decimal_places=4)
    inventory_allocations = models.JSONField(default=list)

    class Meta:
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(
                fields=['packing_run', 'component_type'],
                name='uniq_packing_run_component_type',
            ),
        ]

    def __str__(self):
        material = self.raw_material_stock or self.stock
        return f'{self.packing_run.packing_number} - {self.get_component_type_display()} ({material})'


class PackingRunOutput(BaseModel):
    """A separate, traceable piece-based stock output for selected packaging."""
    packing_run = models.ForeignKey(PackingRun, on_delete=models.CASCADE, related_name='outputs')
    component_type = models.CharField(max_length=20, choices=PackingRun.COMPONENT_CHOICES + [('returned_carton', 'Returned bottle carton'), ('returned_bottle', 'Returned bottles')])
    stock = models.ForeignKey(Stock, on_delete=models.PROTECT, related_name='packing_outputs')
    inventory_batch = models.OneToOneField('api.InventoryBatch', on_delete=models.PROTECT, related_name='packing_output')
    quantity_pieces = models.DecimalField(max_digits=12, decimal_places=4)
    total_cost_afn = models.DecimalField(max_digits=15, decimal_places=4)
    unit_cost_afn = models.DecimalField(max_digits=15, decimal_places=6)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['packing_run', 'component_type'], name='uniq_packing_output_type')]


class PackingReturn(BaseModel):
    """Audit of filled bottles taken from stock for another packaging operation."""
    stock = models.ForeignKey(Stock, on_delete=models.PROTECT, related_name='packing_returns')
    bottle_count = models.PositiveIntegerField()
    packaging_cost_afn = models.DecimalField(max_digits=15, decimal_places=4)
    performed_by = models.ForeignKey('account.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    first_returned_at = models.DateTimeField(null=True, blank=True)
    last_returned_at = models.DateTimeField(null=True, blank=True)
    remaining_bottle_count = models.PositiveIntegerField(default=0)
    inventory_moved = models.BooleanField(default=False)
    unit_cost_afn = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    expire_date = models.DateField(null=True, blank=True)
    bottle_volume_liters = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    bottle_weight_kg = models.DecimalField(max_digits=12, decimal_places=6, default=0)
    bottle_sources = models.JSONField(default=list)
    components = models.JSONField(default=list)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [models.UniqueConstraint(fields=['stock'], condition=models.Q(deleted_at__isnull=True), name='uniq_returned_pool_stock')]


class PackingReturnEvent(BaseModel):
    packing_return = models.ForeignKey(PackingReturn, on_delete=models.CASCADE, related_name='return_events')
    returned_at = models.DateTimeField(default=timezone.now)
    bottle_count = models.PositiveIntegerField()
    inventory_moved = models.BooleanField(default=True)
    unit_cost_afn = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    bottle_sources = models.JSONField(default=list)
    details = models.JSONField(default=dict)
    notes = models.TextField(blank=True)
    performed_by = models.ForeignKey('account.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        ordering = ['-returned_at', '-id']
