from django.db import models
from api.models.data.base import BaseModel
from api.models.data.sales import Sales, SalesItems
from api.models.data.inventory_batch import InventoryBatch

class SaleBatchAllocation(BaseModel):
    """
    Tracks which inventory batches were allocated to each sale item.
    Enables FEFO (First Expired First Out) tracking and traceability.
    """
    sale = models.ForeignKey(Sales, on_delete=models.CASCADE, related_name='batch_allocations')
    sale_item = models.ForeignKey(
        SalesItems,
        on_delete=models.CASCADE,
        related_name='batch_allocations'
    )
    inventory_batch = models.ForeignKey(
        InventoryBatch,
        on_delete=models.PROTECT,
        related_name='sale_allocations'
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text='Quantity of pieces allocated from this batch'
    )

    unit_cost = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True, editable=False)

    returned_quantity = models.DecimalField(max_digits=12, decimal_places=4, default=0)

    class Meta:
        unique_together = ['sale_item', 'inventory_batch']
        ordering = ['inventory_batch__expire_date']

    def __str__(self):
        return f"{self.sale.invoice_number} - Batch {self.inventory_batch.batch_number} ({self.quantity} pieces)"

