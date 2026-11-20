from decimal import Decimal, ROUND_HALF_UP

from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.sales import Sales, SalesItems


class Return(BaseModel):
    """Customer sales return."""

    sales = models.ForeignKey(Sales, on_delete=models.CASCADE, related_name='returns')
    return_number = models.CharField(max_length=50, unique=True, blank=True)
    return_date = models.DateTimeField(default=timezone.now)
    reason = models.CharField(max_length=200, null=True, blank=True)
    currency = models.IntegerField(choices=CURRENCY_CHOICES, default=1)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount_base = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    refund_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    refund_amount_base = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    notes = models.CharField(blank=True, null=True, max_length=255)
    is_sellable = models.BooleanField(
        default=True,
        help_text='If false, returned goods are not restored to sellable stock.',
    )

    def save(self, *args, **kwargs):
        if not self.return_number:
            from api.services.document_numbers import allocate_return_number
            self.return_number = allocate_return_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Return {self.return_number} for Sale {self.sales.invoice_number}'


class ReturnItems(BaseModel):
    """Return line referencing an original sale line; quantities in packaging units."""

    return_order = models.ForeignKey(Return, on_delete=models.CASCADE, related_name='return_items')
    sales_item = models.ForeignKey(SalesItems, on_delete=models.CASCADE, related_name='return_items')
    quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Quantity in the original sale packaging unit.',
    )
    conversion_factor = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    base_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    # Compatibility alias used by older accounting helpers.
    liter_amount = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    return_price = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    return_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    batch_returns = models.JSONField(default=list, blank=True)

    def save(self, *args, **kwargs):
        sale_item = self.sales_item
        if sale_item.sales.is_free:
            self.return_price = Decimal('0')
        factor = Decimal(str(
            self.conversion_factor
            or sale_item.conversion_factor
            or 1
        ))
        self.conversion_factor = factor
        qty = Decimal(str(self.quantity or 0))
        if qty <= 0 and self.liter_amount:
            # Accept legacy liter_amount as base qty input.
            self.base_quantity = Decimal(str(self.liter_amount))
            self.quantity = (self.base_quantity / factor).quantize(
                Decimal('0.000001'), rounding=ROUND_HALF_UP,
            ) if factor else self.base_quantity
        else:
            self.base_quantity = (qty * factor).quantize(
                Decimal('0.000001'), rounding=ROUND_HALF_UP,
            )
        self.liter_amount = self.base_quantity
        if not self.return_price:
            self.return_price = sale_item.sell_price
        self.return_amount = (
            Decimal(str(self.quantity or 0)) * Decimal(str(self.return_price or 0))
        ).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
        super().save(*args, **kwargs)

    def __str__(self):
        name = getattr(getattr(self.sales_item, 'product', None), 'name', 'item')
        return f'Return {self.quantity} of {name}'
