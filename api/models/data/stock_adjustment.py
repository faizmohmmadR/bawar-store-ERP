from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.inventory_batch import InventoryBatch


class StockAdjustment(BaseModel):
    """Batch-level adjustment audit row."""

    ADJUSTMENT_TYPE_EXPIRED = 'expired'
    ADJUSTMENT_TYPE_DAMAGED = 'damaged'
    ADJUSTMENT_TYPE_LOST = 'lost'
    ADJUSTMENT_TYPE_MANUAL = 'manual_correction'
    ADJUSTMENT_TYPE_RETURNED = 'returned'
    ADJUSTMENT_TYPE_TRANSFER = 'transfer'
    ADJUSTMENT_TYPE_CHOICES = [
        (ADJUSTMENT_TYPE_EXPIRED, 'Expired'),
        (ADJUSTMENT_TYPE_DAMAGED, 'Damaged'),
        (ADJUSTMENT_TYPE_LOST, 'Lost'),
        (ADJUSTMENT_TYPE_MANUAL, 'Manual Correction'),
        (ADJUSTMENT_TYPE_RETURNED, 'Returned'),
        (ADJUSTMENT_TYPE_TRANSFER, 'Transfer'),
    ]

    inventory_batch = models.ForeignKey(
        InventoryBatch,
        on_delete=models.CASCADE,
        related_name='adjustments',
        null=True,
        blank=True,
    )
    product = models.ForeignKey(
        'api.Product',
        on_delete=models.PROTECT,
        related_name='stock_adjustments',
        null=True,
        blank=True,
    )
    warehouse = models.ForeignKey(
        'api.Warehouse',
        on_delete=models.PROTECT,
        related_name='stock_adjustments',
        null=True,
        blank=True,
    )
    adjustment_type = models.CharField(max_length=30, choices=ADJUSTMENT_TYPE_CHOICES)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True)
    quantity_before = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    quantity_after = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    quantity_change = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    reason = models.TextField(blank=True, null=True)
    reference_number = models.CharField(max_length=50, blank=True, null=True)
    adjusted_by = models.ForeignKey(
        'account.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_adjustments',
    )
    adjustment_date = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-adjustment_date']

    def save(self, *args, **kwargs):
        self.quantity_change = self.quantity_after - self.quantity_before
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.adjustment_type} ({self.quantity_change:+})'
