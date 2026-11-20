from django.core.exceptions import ValidationError
from django.db import models

from api.models.data.base import BaseModel


class UnitCategory(BaseModel):
    """Measurement category: count, weight, volume, length, other."""

    CODE_COUNT = 'count'
    CODE_WEIGHT = 'weight'
    CODE_VOLUME = 'volume'
    CODE_LENGTH = 'length'
    CODE_OTHER = 'other'
    CODE_CHOICES = [
        (CODE_COUNT, 'Count'),
        (CODE_WEIGHT, 'Weight'),
        (CODE_VOLUME, 'Volume'),
        (CODE_LENGTH, 'Length'),
        (CODE_OTHER, 'Other'),
    ]

    code = models.CharField(max_length=20, unique=True, choices=CODE_CHOICES)
    name = models.CharField(max_length=100)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'unit categories'

    def __str__(self):
        return self.name


class UnitOfMeasure(BaseModel):
    """Canonical unit within a category (piece, kg, liter, meter, …)."""

    category = models.ForeignKey(
        UnitCategory,
        on_delete=models.PROTECT,
        related_name='units',
    )
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=100)
    symbol = models.CharField(max_length=20)
    # Factor to the category reference unit (e.g. kg→g = 1000 if g is reference).
    # Used only for same-category conversions; packaging uses qty_in_base instead.
    is_category_reference = models.BooleanField(
        default=False,
        help_text='If true, this is the reference unit for the category.',
    )
    ratio_to_reference = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=1,
        help_text='1 of this unit = ratio_to_reference of the category reference unit.',
    )
    decimal_places = models.PositiveSmallIntegerField(default=4)

    class Meta:
        ordering = ['category__name', 'name']

    def __str__(self):
        return f'{self.name} ({self.symbol})'

    def clean(self):
        if self.ratio_to_reference is not None and self.ratio_to_reference <= 0:
            raise ValidationError({'ratio_to_reference': 'Must be positive.'})
