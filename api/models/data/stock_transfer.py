
from django.conf import settings
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.products import Product
from api.models.data.stock import Stock


class StockTransfer(BaseModel):
    """

    """

    REASON_EXPIRED = 'expired'
    REASON_DAMAGED = 'damaged'
    REASON_OTHER = 'other'
    REASON_CHOICES = [
        (REASON_EXPIRED, 'Expired'),
        (REASON_DAMAGED, 'Damaged'),
        (REASON_OTHER, 'Other'),
    ]

    STATUS_COMPLETED = 'completed'
    STATUS_CHOICES = [
        (STATUS_COMPLETED, 'Completed'),
    ]

    transfer_number = models.CharField(max_length=50, unique=True)


    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='stock_transfers_from',
    )
    target_product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='stock_transfers_to',
    )
    condition = models.CharField(
        max_length=20,
        choices=Stock.CONDITION_CHOICES,
        default=Stock.CONDITION_GOOD,
    )
    reason = models.CharField(
        max_length=20,
        choices=REASON_CHOICES,
        default=REASON_OTHER,
    )
    piece_amount = models.DecimalField(max_digits=12, decimal_places=4)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    currency = models.IntegerField(choices=CURRENCY_CHOICES, default=1)
    total_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    transfer_date = models.DateTimeField(default=timezone.now)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_COMPLETED,
    )
    notes = models.TextField(blank=True, null=True)
    source_stock = models.ForeignKey(
        Stock,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfers_out',
    )
    target_stock = models.ForeignKey(
        Stock,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfers_in',
    )
    source_batch = models.ForeignKey(
        InventoryBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfers_out',
        help_text='Primary source batch when a single batch was selected',
    )
    transferred_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_transfers',
    )



    class Meta:
        ordering = ['-transfer_date', '-id']
        indexes = [
            models.Index(fields=['transfer_date']),
            models.Index(fields=['reason']),
        ]

    def __str__(self):
        return (
            f'{self.transfer_number}: {self.piece_amount} pcs '
            f'{self.product} transfer'
        )
