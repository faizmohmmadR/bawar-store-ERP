from django.db import models
from api.models.data.base import BaseModel

from api.models.data.products import Product
from api.models.data.currency import CURRENCY_CHOICES

class Stock(BaseModel):
    """Product inventory; material-linked rows count their exact bottle or package unit."""

    CONDITION_GOOD = 'good'
    CONDITION_DAMAGED = 'damaged'
    CONDITION_WASTE = 'waste'
    CONDITION_CHOICES = [
        (CONDITION_GOOD, 'Good'),
        (CONDITION_DAMAGED, 'Damaged'),
        (CONDITION_WASTE, 'Waste'),
    ]

    product = models.ForeignKey(Product, on_delete=models.CASCADE)

    condition = models.CharField(
        max_length=20,
        choices=CONDITION_CHOICES,
        default=CONDITION_GOOD,
        db_index=True,
        help_text='Good, damaged, or waste — same product can have separate lots per condition',
    )
    piece_amount = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        help_text='Canonical product pieces, or the selected packaging-material units for linked stock.',
    )
    buy_price = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Moving average unit buy price in AFN (packed stock cost from packing/production)',
    )
    currency = models.IntegerField(
        choices=CURRENCY_CHOICES,
        default=1,
        help_text='Always AFN (1) for finished-goods stock costs',
    )
    expire_date = models.DateField(
        null=True,
        blank=True,
        help_text='Optional expiry date for notification alerts',
    )
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.product.name} [{self.condition}] - {self.piece_amount} pieces"

    @property
    def carton_amount(self):
        from api.utils.packaging import bottles_per_carton, cartons_from_pieces
        return cartons_from_pieces(
            self.piece_amount, bottles_per_carton(self.product),
        )

    @property
    def loose_pieces(self):
        from api.utils.packaging import bottles_per_carton, remainder_pieces
        return remainder_pieces(
            self.piece_amount, bottles_per_carton(self.product),
        )

    class Meta:
        unique_together = ['product', 'condition']
