from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.products import Product
from api.models.data.vendors import Vendor


class InventoryBatch(BaseModel):
    """Optional FEFO lot layer. Quantities are in product base UOM."""

    STATUS_ACTIVE = 'active'
    STATUS_EXPIRED = 'expired'
    STATUS_EMPTY = 'empty'
    STATUS_DAMAGED = 'damaged'
    STATUS_RETURNED = 'returned'
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_EMPTY, 'Empty'),
        (STATUS_DAMAGED, 'Damaged'),
        (STATUS_RETURNED, 'Returned'),
    ]

    batch_number = models.CharField(max_length=50, unique=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='inventory_batches')
    warehouse = models.ForeignKey(
        'api.Warehouse',
        on_delete=models.PROTECT,
        related_name='inventory_batches',
        null=True,
        blank=True,
    )
    supplier = models.ForeignKey(
        Vendor,
        on_delete=models.PROTECT,
        related_name='inventory_batches',
        null=True,
        blank=True,
    )
    condition = models.CharField(
        max_length=20,
        choices=[('good', 'Good'), ('damaged', 'Damaged'), ('waste', 'Waste')],
        default='good',
    )
    pieces_received = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    remaining_pieces = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    expire_date = models.DateField(null=True, blank=True)
    manufacturing_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    received_date = models.DateTimeField(default=timezone.now)
    notes = models.TextField(blank=True, null=True)

    # Legacy aliases used by older batch UIs
    cartons_received = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    remaining_cartons = models.DecimalField(max_digits=18, decimal_places=6, default=0)

    class Meta:
        ordering = ['expire_date', 'id']

    def __str__(self):
        return f'{self.batch_number} ({self.remaining_pieces})'

    def save(self, *args, **kwargs):
        if not self.batch_number:
            self.batch_number = f'B{timezone.now().strftime("%y%m%d%H%M%S")}{self.product_id or 0}'
        if self.remaining_pieces <= 0:
            self.status = self.STATUS_EMPTY
        elif self.expire_date and self.expire_date < timezone.localdate():
            self.status = self.STATUS_EXPIRED
        super().save(*args, **kwargs)
