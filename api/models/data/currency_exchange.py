from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES


class CurrencyExchange(BaseModel):
    """First-class currency exchange document (Phase 3).

    Moves real money between currency-specific cash/bank/sarafi accounts.
    Multi-currency journals are balanced in AFN, including realized FX.
    """

    STATUS_DRAFT = 'draft'
    STATUS_POSTED = 'posted'
    STATUS_REVERSED = 'reversed'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_POSTED, 'Posted'),
        (STATUS_REVERSED, 'Reversed'),
    ]

    METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('bank', 'Bank'),
        ('sarafi', 'Sarafi'),
    ]


    exchange_date = models.DateTimeField(default=timezone.now)
    from_currency = models.IntegerField(choices=CURRENCY_CHOICES)
    from_amount = models.DecimalField(max_digits=15, decimal_places=2)
    from_method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='cash')
    to_currency = models.IntegerField(choices=CURRENCY_CHOICES)
    to_amount = models.DecimalField(max_digits=15, decimal_places=2)
    to_method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='cash')
    rate = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=Decimal('0'),
        help_text='Cross rate: 1 unit of from_currency = this many units of to_currency.',
    )
    from_exchange_rate = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        null=True,
        blank=True,
        help_text='Deal rate: 1 unit of from_currency = this many AFN. AFN = 1.',
    )
    to_exchange_rate = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        null=True,
        blank=True,
        help_text='Deal rate: 1 unit of to_currency = this many AFN. AFN = 1.',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_POSTED)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_currency_exchanges',
    )
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-exchange_date', '-id']

    def __str__(self):
        return (
            f'FX {self.from_amount} {self.get_from_currency_display()} → '
            f'{self.to_amount} {self.get_to_currency_display()}'
        )

    def save(self, *args, **kwargs):
        from api.services.accounting.currency_exchange import fill_exchange_rates

        fill_exchange_rates(self)
        if self.status == self.STATUS_POSTED and self.posted_at is None:
            self.posted_at = timezone.now()
        super().save(*args, **kwargs)
