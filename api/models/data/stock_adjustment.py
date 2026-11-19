from django.db import models, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from api.models.data.base import BaseModel
from api.models.data.inventory_batch import InventoryBatch


class StockAdjustment(BaseModel):
    """
    Stock adjustments at the batch level.
    Each adjustment is linked to a specific batch for full traceability.
    """
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
        related_name='adjustments'
    )
    adjustment_type = models.CharField(
        max_length=30,
        choices=ADJUSTMENT_TYPE_CHOICES,
    )
    unit_cost = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True, editable=False)
    quantity_before = models.DecimalField(max_digits=12, decimal_places=4)
    quantity_after = models.DecimalField(max_digits=12, decimal_places=4)
    quantity_change = models.DecimalField(max_digits=12, decimal_places=4)
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
        indexes = [
            models.Index(fields=['inventory_batch', 'adjustment_type']),
            models.Index(fields=['adjustment_date']),
            models.Index(fields=['adjustment_type']),
        ]

    def __str__(self):
        return f"{self.adjustment_type} - Batch {self.inventory_batch.batch_number} ({self.quantity_change:+} pieces)"

    @transaction.atomic
    def save(self, *args, **kwargs):
        if self.quantity_after < 0:
            raise ValidationError(
                {'quantity_after': 'Quantity after adjustment cannot be negative.'})

        self.quantity_change = self.quantity_after - self.quantity_before

        if self.pk is None:  # Only on creation
            # Lock the batch row to prevent race conditions
            batch = InventoryBatch.objects.select_for_update().get(pk=self.inventory_batch_id)
            self.unit_cost = batch.unit_cost
            batch.remaining_pieces = self.quantity_after
            if batch.remaining_pieces <= 0:
                batch.status = InventoryBatch.STATUS_EMPTY
            elif batch.expire_date and batch.expire_date < timezone.localdate():
                batch.status = InventoryBatch.STATUS_EXPIRED
            else:
                batch.status = InventoryBatch.STATUS_ACTIVE
            batch._skip_batch_journal = True
            batch.save(update_fields=['remaining_pieces', 'status'])

            # Sync the legacy Stock summary row
            _sync_stock_from_batches(batch)

        super().save(*args, **kwargs)


def _sync_stock_from_batches(batch):
    from api.models.data.stock import Stock
    from api.services.stock_valuation import sync_stock_valuation
    stock = Stock.objects.filter(product=batch.product, condition=batch.condition).first()
    if stock is not None:
        sync_stock_valuation(stock)
