from decimal import Decimal

from django.conf import settings
from django.db import models

from api.models.data.base import BaseModel


class FiscalYear(BaseModel):
    """Accounting fiscal year with optional year-end close."""

    STATUS_OPEN = 'open'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_CLOSED, 'Closed'),
    ]

    name = models.CharField(max_length=50)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    is_current = models.BooleanField(default=False)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='closed_fiscal_years',
    )
    closing_journal = models.ForeignKey(
        'JournalEntry',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    net_income = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-start_date']
        verbose_name = 'Fiscal Year'
        verbose_name_plural = 'Fiscal Years'
        constraints = [
            models.UniqueConstraint(
                fields=['start_date', 'end_date'],
                name='unique_fiscal_year_range',
            ),
        ]

    def __str__(self):
        return f'{self.name} ({self.start_date} — {self.end_date})'
