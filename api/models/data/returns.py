from django.utils import timezone
from django.db import models
from django.contrib.contenttypes.models import ContentType
from account.models import User
from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.vendors import Vendor  
from api.models.data.products import Product
from api.models.data.sales import Sales, SalesItems  # Import the sales models

class Return(BaseModel):
    """Sales return model"""
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
    
    def save(self, *args, **kwargs):
        if not self.return_number:
            from api.services.document_numbers import allocate_return_number
            self.return_number = allocate_return_number()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"Return {self.return_number} for Sale {self.sales.invoice_number}"
    
    def calculate_total_amount(self):
        """Calculate total return amount from return items"""
        total = sum(item.return_amount for item in self.return_items.all())
        return total

class ReturnItems(BaseModel):
    """Sales return line items"""
    return_order = models.ForeignKey(Return, on_delete=models.CASCADE, related_name='return_items')
    sales_item = models.ForeignKey(SalesItems, on_delete=models.CASCADE)
    liter_amount = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    quantity_kg = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    batch_returns = models.JSONField(default=list, blank=True)
    return_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    return_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    def __str__(self):
        sale_item = self.sales_item
        stock = getattr(sale_item, 'stock', None)
        product = getattr(stock, 'product', None) if stock is not None else None
        if product is not None:
            label = product.name
        elif getattr(sale_item, 'raw_material_stock', None) is not None:
            label = sale_item.raw_material_stock.raw_material.name
        elif getattr(sale_item, 'storage_tank', None) is not None:
            label = sale_item.storage_tank.name
        else:
            label = 'Unknown item'
        qty = self.quantity_kg if sale_item.unit == SalesItems.UNIT_KG else self.liter_amount
        return f"Return {qty} of {label} for {self.return_order.return_number}"
    
    def save(self, *args, **kwargs):
        """Calculate return value using the same unit rules as sales lines."""
        from decimal import Decimal, ROUND_HALF_UP
        from api.utils.packaging import return_item_line_total, return_item_restore_pieces

        if self.sales_item.sales.is_free:
            self.return_price = 0

        sale_item = self.sales_item
        if sale_item.unit == SalesItems.UNIT_KG:
            quantity = Decimal(str(self.quantity_kg or 0))
            if quantity <= 0:
                quantity = Decimal(str(self.liter_amount or 0))
                if sale_item.sale_source == SalesItems.SOURCE_TANK:
                    from api.services.tank_inventory import get_tank_density
                    quantity *= get_tank_density(sale_item.storage_tank)
                elif sale_item.stock_id and sale_item.stock.product_id:
                    from api.utils.packaging import kilograms_from_pieces
                    quantity = kilograms_from_pieces(quantity, sale_item.stock.product)
                self.quantity_kg = quantity
            # Keep liter_amount as the restore piece count for packed kg returns.
            if sale_item.sale_source == SalesItems.SOURCE_STOCK:
                pieces = return_item_restore_pieces(self)
                if pieces > 0:
                    self.liter_amount = pieces.quantize(Decimal('0.001'), rounding=ROUND_HALF_UP)

        amount = return_item_line_total(self)
        self.return_amount = amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP) if amount > 0 else Decimal('0.00')
        super().save(*args, **kwargs)
    
    def clean(self):
        """Validate return quantity does not exceed the original sale line."""
        from decimal import Decimal
        from django.core.exceptions import ValidationError

        sale_item = self.sales_item
        if sale_item.unit == SalesItems.UNIT_KG:
            returned = Decimal(str(self.quantity_kg or 0))
            sold = Decimal(str(sale_item.quantity or 0))
            if returned > sold:
                raise ValidationError({'quantity_kg': 'Return quantity cannot exceed original sale quantity.'})
            return
        if Decimal(str(self.liter_amount or 0)) > Decimal(str(sale_item.liter_amount or 0)):
            raise ValidationError({'liter_amount': 'Return quantity cannot exceed original sale quantity.'})

def get_return_models():
    """
    Returns a dictionary containing the Return and ReturnItems models.
    
    Returns:
        dict: A dictionary with keys 'Return' and 'ReturnItems' containing the respective model classes.
    """
    return {
        'Return': Return,
        'ReturnItems': ReturnItems
    }