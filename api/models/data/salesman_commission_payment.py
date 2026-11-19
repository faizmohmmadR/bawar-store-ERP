from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_CHOICES


class SalesmanCommissionPayment(BaseModel):
    """
    Settlement of earned salesman commission.

    Commission is always tracked and paid in AFN (functional currency).
    Accrual posts on the sale (Dr Commission Expense · Cr Commission Payable);
    this document settles the payable (Dr Payable · Cr Cash/Bank/Sarafi).
    """

    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('bank', 'Bank'),
        ('sarafi', 'Sarafi'),
    ]

    salesman = models.ForeignKey(
        'api.Salesman',
        on_delete=models.PROTECT,
        related_name='commission_payments',
    )
    payment_date = models.DateTimeField(default=timezone.now)
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default='cash',
        help_text='Cash book credited when the commission is paid',
    )
    amount = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        help_text='Payment amount in AFN',
    )
    amount_base = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        default=0,
        help_text='AFN amount (same as amount; commission is always AFN).',
    )
    currency = models.IntegerField(
        choices=CURRENCY_CHOICES,
        default=BASE_CURRENCY_ID,
        help_text='Always AFN for commission payments.',
    )
    exchange_rate = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=1,
    )
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-payment_date', '-id']
        verbose_name = 'Salesman commission payment'
        verbose_name_plural = 'Salesman commission payments'

    def __str__(self):
        return f'Commission pay {self.amount} to {self.salesman_id}'

    def save(self, *args, **kwargs):
        self.currency = BASE_CURRENCY_ID
        self.exchange_rate = 1
        self.amount_base = self.amount
        super().save(*args, **kwargs)
