from django.conf import settings
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel



class FxRevaluation(BaseModel):
    """Period-end FX revaluation run (Phase 4).

    (idempotent). Native foreign-currency balances are unchanged; only AFN
    carrying (base_*) is adjusted. Inventory is never revalued.
    """

    STATUS_DRAFT = 'draft'
    STATUS_POSTED = 'posted'
    STATUS_REVERSED = 'reversed'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_POSTED, 'Posted'),
        (STATUS_REVERSED, 'Reversed'),
    ]


    as_of_date = models.DateField(
        help_text='Balances through end of this date are revalued at closing rates.',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_POSTED)
    notes = models.TextField(blank=True, null=True)
    total_gain = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_loss = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    closing_rates = models.JSONField(
        default=dict,
        blank=True,
        help_text='Map of currency_id → closing rate used (1 unit = X AFN).',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_fx_revaluations',
    )
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-as_of_date', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=['as_of_date'],
                name='uniq_fx_revaluation_as_of',
            ),
        ]

    def __str__(self):
        return f'FX revaluation {self.id} @ {self.as_of_date} ({self.status})'

    def save(self, *args, **kwargs):
        if self.status == self.STATUS_POSTED and self.posted_at is None:
            self.posted_at = timezone.now()
        super().save(*args, **kwargs)
