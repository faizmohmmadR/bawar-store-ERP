"""
Legacy Stock row kept as a thin compatibility mirror of InventoryBalance
for code paths that still expect product+condition. New code should use
InventoryBalance + StockMovement exclusively.
"""
from django.db import models

from api.models.data.base import BaseModel
from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.products import Product


class Stock(BaseModel):
    """Aggregated good/damaged/waste buckets per product (optional mirror)."""

    CONDITION_GOOD = 'good'
    CONDITION_DAMAGED = 'damaged'
    CONDITION_WASTE = 'waste'
    CONDITION_CHOICES = [
        (CONDITION_GOOD, 'Good'),
        (CONDITION_DAMAGED, 'Damaged'),
        (CONDITION_WASTE, 'Waste'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stocks')
    warehouse = models.ForeignKey(
        'api.Warehouse',
        on_delete=models.PROTECT,
        related_name='stocks',
        null=True,
        blank=True,
    )
    condition = models.CharField(
        max_length=20,
        choices=CONDITION_CHOICES,
        default=CONDITION_GOOD,
        db_index=True,
    )
    piece_amount = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Quantity in product base UOM.',
    )
    buy_price = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Moving average unit cost in AFN (base UOM).',
    )
    currency = models.IntegerField(choices=CURRENCY_CHOICES, default=1)
    expire_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ['product', 'condition', 'warehouse']

    def __str__(self):
        return f'{self.product_id} [{self.condition}] = {self.piece_amount}'
