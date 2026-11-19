from django.conf import settings
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.journal import GLAccount


# Cash-book GL codes that may be credited on owner withdrawals.
WITHDRAWAL_GL_CODES = frozenset({'1000', '1050', '1060'})
GL_CODE_TO_PAYMENT_METHOD = {
    '1000': 'cash',
    '1050': 'bank',
    '1060': 'sarafi',
}


class Withdrawal(BaseModel):
    """
    Owner / partner cash withdrawal from a specific company Cash / Bank / Sarafi GL.

    Accounting (not an operating expense):
      Dr  Owner's Draw (3100) — reduces equity
      Cr  Selected Cash / Bank / Sarafi GL — reduces asset
    """

    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('bank', 'Bank'),
        ('sarafi', 'Sarafi'),
    ]

    gl_account = models.ForeignKey(
        GLAccount,
        on_delete=models.PROTECT,
        related_name='withdrawals',
        help_text='Exact Cash / Bank / Sarafi GL account money is taken from',
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default='cash',
        help_text='Derived from gl_account.code for reports / cash-out sections',
    )
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    amount_base = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    withdrawal_date = models.DateTimeField(default=timezone.now)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)

    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_withdrawals',
    )

    class Meta:
        ordering = ['-withdrawal_date', '-id']

    def __str__(self):
        acct = getattr(self.gl_account, 'code', '?')
        return f'Withdraw {self.amount} from {acct} ({self.withdrawal_date:%Y-%m-%d})'
