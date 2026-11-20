from django.core.exceptions import ValidationError
from django.db import models

from api.models.data.base import BaseModel


class ProductCategory(BaseModel):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'product categories'

    def __str__(self):
        return self.name


class Product(BaseModel):
    """
    Single inventory identity for trading/supermarket products.

    Stock is always maintained in base_uom. Purchase/sale units are
    ProductPackaging rows with qty_in_base conversion factors.
    """

    COSTING_AVCO = 'avco'
    COSTING_FIFO = 'fifo'
    COSTING_CHOICES = [
        (COSTING_AVCO, 'Weighted Average'),
        (COSTING_FIFO, 'FIFO'),
    ]

    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=64, blank=True, null=True, unique=True)
    internal_reference = models.CharField(max_length=64, blank=True, null=True)
    barcode = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text='Optional primary barcode (usually base packaging).',
    )
    category = models.ForeignKey(
        ProductCategory,
        on_delete=models.PROTECT,
        related_name='products',
        null=True,
        blank=True,
    )
    brand = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    image = models.ImageField(upload_to='products/', blank=True, null=True)

    base_uom = models.ForeignKey(
        'api.UnitOfMeasure',
        on_delete=models.PROTECT,
        related_name='base_products',
    )
    default_purchase_packaging = models.ForeignKey(
        'api.ProductPackaging',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    default_sales_packaging = models.ForeignKey(
        'api.ProductPackaging',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )

    min_stock_level = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    reorder_level = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    max_stock_level = models.DecimalField(
        max_digits=18, decimal_places=6, null=True, blank=True,
    )

    costing_method = models.CharField(
        max_length=10, choices=COSTING_CHOICES, default=COSTING_AVCO,
    )
    # Moving average unit cost in AFN per base UOM.
    average_cost = models.DecimalField(max_digits=18, decimal_places=6, default=0)

    track_inventory = models.BooleanField(default=True)
    track_batch = models.BooleanField(default=False)
    track_expiry = models.BooleanField(default=False)
    track_serial = models.BooleanField(default=False)
    allow_negative_stock = models.BooleanField(default=False)
    quantity_decimal_places = models.PositiveSmallIntegerField(default=4)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['barcode'],
                name='uniq_product_barcode',
                condition=models.Q(barcode__isnull=False),
            ),
        ]

    def save(self, *args, **kwargs):
        if self.barcode == '':
            self.barcode = None
        if self.sku == '':
            self.sku = None
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    def clean(self):
        if self.min_stock_level < 0 or self.reorder_level < 0:
            raise ValidationError('Stock levels cannot be negative.')
