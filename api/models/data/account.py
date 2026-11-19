from django.db import models
from django.utils import timezone
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey
from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES, get_currency


class EntryType(BaseModel):
    """Dynamic entry types for account transactions"""
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Account(BaseModel):
    """

    Double-entry books use GLAccount + JournalEntry. This model is for
    named operational accounts (cash drawers / bank books) only.
    """

    account_number = models.CharField(max_length=50)
    name = models.CharField(max_length=150, blank=True, null=True)
    currency = models.IntegerField(choices=CURRENCY_CHOICES)

    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-id']
        constraints = [
            models.UniqueConstraint(
                fields=['account_number'],
                name='uniq_account_number',
            ),
        ]

    def __str__(self):
        c = get_currency(self.currency)
        code = c['code'] if c else str(self.currency)
        label = self.name or self.account_number
        return f"{label} ({code})"


class AccountEntry(BaseModel):
    """
    Legacy operational ledger lines.

    Prefer JournalEntry / JournalLine for accounting. Kept for older
    customer/vendor statement views that still read these rows.
    """
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='entries')
    entry_type = models.ForeignKey(EntryType, on_delete=models.PROTECT, related_name='entries')
    entry_date = models.DateTimeField(default=timezone.now)
    debit_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    credit_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    
    # Generic foreign key for linking to any model
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE, null=True, blank=True)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    content_object = GenericForeignKey('content_type', 'object_id')
    
    class Meta:
        ordering = ['-entry_date', '-id']
    
    def __str__(self):
        return f"{self.account} - {self.entry_type.name} - Dr:{self.debit_amount} Cr:{self.credit_amount}"
