from django.db import models
from api.models.data.base import BaseModel



class Product(BaseModel):
    """Product model for inventory items (fuel, lubricants, etc.)"""
    raw_material = models.OneToOneField(
        'api.RawMaterial', on_delete=models.PROTECT, null=True, blank=True,
        related_name='stock_product',
        help_text='Exact packaging material represented by this piece-based stock product.',
    )
    packaging_type = models.CharField(max_length=10, null=True, blank=True,
        choices=[('bottle', 'Bottle'), ('carton', 'Carton'), ('plastic', 'Plastic')])

    @property
    def stock_kind(self):
        kind = self.packaging_type or (self.raw_material.material_type if self.raw_material_id else None)
        if kind is None and self.bottles_per_carton == 1 and (self.bottle_capacity_kg or self.bottle_capacity_liters):
            return 'bottle'
        return 'bottle' if kind == 'bottle_with_cap' else kind

    @property
    def is_piece_stock(self):
        return bool(self.stock_kind)

    name = models.CharField(max_length=255)
    barcode = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    bottle_capacity_kg = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True,
        help_text='Canonical mass held by one bottle in kilograms.',
    )
    bottle_capacity_liters = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        null=True,
        blank=True,
        help_text='Liquid capacity of one bottle for packaged liquid products.',
    )
    density_kg_per_liter = models.DecimalField(
        max_digits=10,
        decimal_places=6,
        default=1,
        help_text='Mass of one liter of this liquid, in kilograms.',
    )
    carton_capacity_liters = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        help_text='Liquid capacity of one carton for packaged liquid products.',
    )
    bottles_per_carton = models.PositiveIntegerField(
        default=8,
        help_text='Number of bottles per carton for this product variant.',
    )


    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['packaging_type', 'name'], name='uniq_named_packaging_product'),
            models.UniqueConstraint(
                fields=['barcode'],
                name='uniq_product_barcode',
            ),
        ]

    def save(self, *args, **kwargs):
        # Nullable uniqueness is supported by SQLite, MySQL and MariaDB.
        # Missing barcodes must be NULL so multiple unbarcoded products are allowed.
        if self.barcode == '':
            self.barcode = None
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.barcode})"
