"""Single physical Safe (cash register) — operational layer over GL Cash."""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.journal import GLAccount


class CashRegister(BaseModel):
    """The supermarket's one physical cash drawer (extensible to many later)."""

    name = models.CharField(max_length=120, default='Main Cash Drawer')
    code = models.CharField(max_length=40, unique=True, default='MAIN')
    linked_cash_account = models.ForeignKey(
        GLAccount,
        on_delete=models.PROTECT,
        related_name='cash_registers',
        help_text='Existing Cash GL account (typically code 1000).',
    )
    default_currency = models.IntegerField(choices=CURRENCY_CHOICES, default=1)
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['code']
        constraints = [
            models.UniqueConstraint(
                fields=['is_active'],
                condition=models.Q(is_active=True, deleted_at__isnull=True),
                name='uniq_one_active_cash_register',
            ),
        ]

    def __str__(self):
        return f'{self.code} — {self.name}'

    def clean(self):
        acct = self.linked_cash_account
        if acct is None:
            raise ValidationError({'linked_cash_account': 'Cash account is required.'})
        if getattr(acct, 'category', None) != 'asset':
            raise ValidationError({'linked_cash_account': 'Linked account must be an asset account.'})
        code = str(getattr(acct, 'code', '') or '')
        if not code.startswith('10'):
            raise ValidationError(
                {'linked_cash_account': 'Linked account should be a cash/bank/sarafi asset (10xx).'},
            )


class CashSession(BaseModel):
    """Daily (or multi-day) cash drawer session."""

    STATUS_OPEN = 'open'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_CLOSED, 'Closed'),
    ]

    cash_register = models.ForeignKey(
        CashRegister,
        on_delete=models.PROTECT,
        related_name='sessions',
    )
    session_number = models.CharField(max_length=40, unique=True)
    currency = models.IntegerField(choices=CURRENCY_CHOICES, default=1)
    opening_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    opening_source = models.CharField(
        max_length=40,
        blank=True,
        default='manual',
        help_text='manual | carry_forward',
    )
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='opened_cash_sessions',
    )
    opened_at = models.DateTimeField(default=timezone.now)
    expected_closing_balance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    actual_closing_balance = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    cash_difference = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    difference_reason = models.TextField(blank=True, null=True)
    carry_forward_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='closed_cash_sessions',
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-opened_at', '-id']
        constraints = [
            models.UniqueConstraint(
                fields=['cash_register'],
                condition=models.Q(status='open', deleted_at__isnull=True),
                name='uniq_one_open_cash_session_per_register',
            ),
        ]

    def __str__(self):
        return f'{self.session_number} ({self.status})'

    @property
    def is_open(self):
        return self.status == self.STATUS_OPEN


class CashTransaction(BaseModel):
    """Physical drawer movement — may mirror an existing source document (no duplicate JE)."""

    DIRECTION_IN = 'in'
    DIRECTION_OUT = 'out'
    DIRECTION_CHOICES = [
        (DIRECTION_IN, 'Cash In'),
        (DIRECTION_OUT, 'Cash Out'),
    ]

    # Inflows
    CAT_CASH_SALE = 'cash_sale'
    CAT_CUSTOMER_DEBT_COLLECTION = 'customer_debt_collection'
    CAT_INITIAL_CASH = 'initial_cash'
    CAT_OWNER_CAPITAL = 'owner_capital_contribution'
    CAT_OTHER_RECEIPT = 'other_receipt'
    CAT_CASH_OVERAGE = 'cash_overage'
    # Outflows
    CAT_BUSINESS_EXPENSE = 'business_expense'
    CAT_CASH_PURCHASE = 'cash_purchase'
    CAT_SUPPLIER_PAYMENT = 'supplier_payment'
    CAT_OWNER_WITHDRAWAL = 'owner_withdrawal'
    CAT_CUSTOMER_REFUND = 'customer_refund'
    CAT_BANK_DEPOSIT = 'bank_deposit'
    CAT_OTHER_PAYMENT = 'other_payment'
    CAT_CASH_SHORTAGE = 'cash_shortage'
    CAT_SESSION_REMOVAL = 'session_removal'

    CATEGORY_CHOICES = [
        (CAT_CASH_SALE, 'Cash Sale'),
        (CAT_CUSTOMER_DEBT_COLLECTION, 'Customer Debt Collection'),
        (CAT_INITIAL_CASH, 'Initial Cash'),
        (CAT_OWNER_CAPITAL, 'Owner Capital Contribution'),
        (CAT_OTHER_RECEIPT, 'Other Receipt'),
        (CAT_CASH_OVERAGE, 'Cash Overage'),
        (CAT_BUSINESS_EXPENSE, 'Business Expense'),
        (CAT_CASH_PURCHASE, 'Cash Purchase'),
        (CAT_SUPPLIER_PAYMENT, 'Supplier Payment'),
        (CAT_OWNER_WITHDRAWAL, 'Owner Withdrawal'),
        (CAT_CUSTOMER_REFUND, 'Customer Refund'),
        (CAT_BANK_DEPOSIT, 'Bank Deposit'),
        (CAT_OTHER_PAYMENT, 'Other Payment'),
        (CAT_CASH_SHORTAGE, 'Cash Shortage'),
        (CAT_SESSION_REMOVAL, 'Session Removal'),
    ]

    STATUS_POSTED = 'posted'
    STATUS_VOID = 'void'
    STATUS_CHOICES = [
        (STATUS_POSTED, 'Posted'),
        (STATUS_VOID, 'Void'),
    ]

    cash_register = models.ForeignKey(
        CashRegister,
        on_delete=models.PROTECT,
        related_name='transactions',
    )
    cash_session = models.ForeignKey(
        CashSession,
        on_delete=models.PROTECT,
        related_name='transactions',
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.IntegerField(choices=CURRENCY_CHOICES, default=1)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    amount_base = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    description = models.TextField(blank=True, null=True)
    transaction_date = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_POSTED)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cash_transactions',
    )
    # Link to source document (Payment, Expense, Withdrawal, …) — prevents duplicates
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    object_id = models.PositiveIntegerField(null=True, blank=True)
    content_object = GenericForeignKey('content_type', 'object_id')
    # True when this row owns its own journal (manual / initial / over-short).
    # False when source document already posts the GL entry.
    posts_own_journal = models.BooleanField(default=False)

    class Meta:
        ordering = ['-transaction_date', '-id']
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name='cash_txn_positive_amount',
            ),
            models.UniqueConstraint(
                fields=['content_type', 'object_id', 'category'],
                condition=models.Q(
                    content_type__isnull=False,
                    object_id__isnull=False,
                    deleted_at__isnull=True,
                    status='posted',
                ),
                name='uniq_cash_txn_source_category',
            ),
        ]
        indexes = [
            models.Index(fields=['cash_session', 'direction', 'category']),
            models.Index(fields=['transaction_date']),
        ]

    def __str__(self):
        sign = '+' if self.direction == self.DIRECTION_IN else '-'
        return f'{sign}{self.amount} {self.category}'

    def clean(self):
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({'amount': 'Amount must be positive.'})


class CashCountLine(BaseModel):
    """Denomination count line captured at session close."""

    cash_session = models.ForeignKey(
        CashSession,
        on_delete=models.CASCADE,
        related_name='count_lines',
    )
    denomination = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField(default=0)
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        ordering = ['-denomination', 'id']
        unique_together = [('cash_session', 'denomination')]

    def save(self, *args, **kwargs):
        self.subtotal = (Decimal(str(self.denomination or 0)) * Decimal(str(self.quantity or 0))).quantize(
            Decimal('0.01'),
        )
        return super().save(*args, **kwargs)
