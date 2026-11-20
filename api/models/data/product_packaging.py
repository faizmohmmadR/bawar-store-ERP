from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.currency import CURRENCY_CHOICES


class ProductPackaging(BaseModel):
    """
    Product-specific packaging / sell-buy unit.

    qty_in_base = how many base UOM units one package contains.
    Example: Carton of water with base=Bottle and qty_in_base=12.
    """

    product = models.ForeignKey(
        'api.Product',
        on_delete=models.CASCADE,
        related_name='packagings',
    )
    name = models.CharField(max_length=100)
    uom = models.ForeignKey(
        'api.UnitOfMeasure',
        on_delete=models.PROTECT,
        related_name='product_packagings',
        null=True,
        blank=True,
        help_text='Optional display UOM label; conversion uses qty_in_base.',
    )
    qty_in_base = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        help_text='One of this packaging equals this many base UOM units.',
    )
    is_base = models.BooleanField(
        default=False,
        help_text='True for the 1:1 base packaging row.',
    )
    for_purchase = models.BooleanField(default=True)
    for_sale = models.BooleanField(default=True)
    for_stock = models.BooleanField(default=True)
    is_default_purchase = models.BooleanField(default=False)
    is_default_sale = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    barcode = models.CharField(max_length=100, blank=True, null=True)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    # Variable-weight: conversion factor is not fixed; actual base qty recorded per txn.
    is_variable_weight = models.BooleanField(default=False)

    class Meta:
        ordering = ['product_id', 'sort_order', 'qty_in_base', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'name'],
                name='uniq_product_packaging_name',
            ),
            models.UniqueConstraint(
                fields=['barcode'],
                name='uniq_product_packaging_barcode',
                condition=models.Q(barcode__isnull=False),
            ),
        ]

    def save(self, *args, **kwargs):
        if self.barcode == '':
            self.barcode = None
        return super().save(*args, **kwargs)

    def clean(self):
        if self.qty_in_base is None or self.qty_in_base <= 0:
            raise ValidationError({'qty_in_base': 'Must be positive.'})
        if self.is_base and self.qty_in_base != 1:
            raise ValidationError({'qty_in_base': 'Base packaging must have qty_in_base = 1.'})

    def __str__(self):
        return f'{self.product_id}:{self.name} (×{self.qty_in_base})'

    def is_effective(self, on_date=None):
        day = on_date or timezone.localdate()
        if self.effective_from and day < self.effective_from:
            return False
        if self.effective_to and day > self.effective_to:
            return False
        return self.is_active


class ProductBarcode(BaseModel):
    """Additional barcodes that resolve to a product packaging."""

    product = models.ForeignKey(
        'api.Product',
        on_delete=models.CASCADE,
        related_name='barcodes',
    )
    packaging = models.ForeignKey(
        ProductPackaging,
        on_delete=models.CASCADE,
        related_name='barcodes',
    )
    barcode = models.CharField(max_length=100, unique=True)
    is_primary = models.BooleanField(default=False)

    class Meta:
        ordering = ['product_id', 'barcode']

    def __str__(self):
        return self.barcode


class ProductPrice(BaseModel):
    """Independent selling (or purchase list) price per packaging."""

    PRICE_RETAIL = 'retail'
    PRICE_WHOLESALE = 'wholesale'
    PRICE_SPECIAL = 'special'
    PRICE_MIN = 'minimum'
    PRICE_PURCHASE = 'purchase'
    PRICE_CHOICES = [
        (PRICE_RETAIL, 'Retail'),
        (PRICE_WHOLESALE, 'Wholesale'),
        (PRICE_SPECIAL, 'Special'),
        (PRICE_MIN, 'Minimum'),
        (PRICE_PURCHASE, 'Purchase list'),
    ]

    product = models.ForeignKey(
        'api.Product',
        on_delete=models.CASCADE,
        related_name='prices',
    )
    packaging = models.ForeignKey(
        ProductPackaging,
        on_delete=models.CASCADE,
        related_name='prices',
    )
    price_type = models.CharField(max_length=20, choices=PRICE_CHOICES, default=PRICE_RETAIL)
    currency = models.IntegerField(choices=CURRENCY_CHOICES, default=1)
    amount = models.DecimalField(max_digits=18, decimal_places=6)
    effective_from = models.DateField(null=True, blank=True)
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['product_id', 'packaging_id', 'price_type']

    def __str__(self):
        return f'{self.product_id}/{self.packaging_id}/{self.price_type}={self.amount}'
