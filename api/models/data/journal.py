from decimal import Decimal

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES


class GLAccount(BaseModel):
    """Chart of accounts.

    Single workspace ERP - one set of accounts for all operations.
    Currency lives on the journal line for multi-currency support.
    """

    CATEGORY_CHOICES = [
        ('asset', 'Asset'),
        ('liability', 'Liability'),
        ('equity', 'Equity'),
        ('revenue', 'Revenue'),
        ('expense', 'Expense'),
    ]

    code = models.CharField(max_length=20)
    name = models.CharField(max_length=150)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    description = models.TextField(blank=True, null=True)
    is_system = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    currency = models.IntegerField(
        null=True,
        blank=True,
        help_text='Currency this account tracks (null = base AFN)',
    )

    class Meta:
        ordering = ['code']
        constraints = [
            models.UniqueConstraint(
                fields=['currency', 'code'],
                name='uniq_gl_account_currency_code',
            ),
        ]

    def __str__(self):
        from api.models.data.currency import get_currency
        c = get_currency(self.currency)
        ccode = c['code'] if c else 'AFN'
        return f"{self.code} - {self.name} [{ccode}]"


class AccountingSettings(BaseModel):
    """Singleton mapping of business sections to default GL accounts."""

    cash_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    inventory_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    accounts_receivable_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    accounts_payable_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    sales_revenue_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    sales_returns_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    cogs_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
        help_text='Cost of Goods Sold account for inventory valuation'
    )
    expense_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    payroll_expense_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    employee_advance_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    loan_receivable_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    loan_payable_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+'
    )
    bank_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
        help_text='Primary bank account (separate from petty cash)',
    )
    prepaid_expense_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    sales_tax_payable_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    equity_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    retained_earnings_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    other_income_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    petty_cash_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    fixed_asset_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    accumulated_depreciation_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    accrued_expenses_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    opening_balance_equity_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    purchase_discount_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    sales_discount_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    bank_charges_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    stock_adjustment_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    depreciation_expense_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    bad_debt_expense_account = models.ForeignKey(
        GLAccount, on_delete=models.PROTECT, null=True, blank=True, related_name='+',
    )
    usd_to_afn_rate = models.DecimalField(
        max_digits=18, decimal_places=6, default=Decimal('87.20'),
        help_text='1 USD equals this many AFN',
    )
    fiscal_year_start_month = models.PositiveSmallIntegerField(
        default=3,
        help_text='Month when fiscal year begins (1-12). Default 3 = March.',
    )
    fiscal_year_start_day = models.PositiveSmallIntegerField(
        default=21,
        help_text='Day when fiscal year begins. Default 21 (Hamal 1 approx.).',
    )
    current_fiscal_year = models.ForeignKey(
        'FiscalYear',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    is_configured = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Accounting Settings'
        verbose_name_plural = 'Accounting Settings'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return 'Accounting Settings'


class JournalEntry(BaseModel):
    """Balanced double-entry journal header linked to a source transaction."""

    entry_date = models.DateTimeField(default=timezone.now)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    is_auto = models.BooleanField(default=True)
    is_closing_entry = models.BooleanField(default=False)

    fiscal_year = models.ForeignKey(
        'FiscalYear',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='journal_entries',
    )
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE, null=True, blank=True)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    content_object = GenericForeignKey('content_type', 'object_id')

    class Meta:
        ordering = ['-entry_date', '-id']
        verbose_name_plural = 'Journal entries'
        indexes = [
            models.Index(fields=['entry_date'], name='api_je_date_idx'),
            models.Index(fields=['content_type', 'object_id'], name='api_je_content_idx'),
        ]

    def __str__(self):
        return f"JE-{self.id} {self.reference_number or ''}".strip()

    @property
    def total_debit(self):
        return sum((line.debit for line in self.lines.all()), Decimal('0'))

    @property
    def total_credit(self):
        return sum((line.credit for line in self.lines.all()), Decimal('0'))

    @property
    def total_base_debit(self):
        return sum((line.base_debit or Decimal('0') for line in self.lines.all()), Decimal('0'))

    @property
    def total_base_credit(self):
        return sum((line.base_credit or Decimal('0') for line in self.lines.all()), Decimal('0'))


class JournalLine(BaseModel):
    """Native debit/credit plus historical AFN equivalent (authoritative ledger)."""

    journal_entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='lines')
    gl_account = models.ForeignKey(GLAccount, on_delete=models.PROTECT, related_name='journal_lines')
    currency = models.IntegerField(
        choices=CURRENCY_CHOICES,
        help_text='Native/transaction currency of this line',
    )
    debit = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    credit = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    exchange_rate = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        null=True,
        blank=True,
        help_text='Historical rate: 1 unit of line currency = this many AFN. AFN = 1.',
    )
    base_debit = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='AFN equivalent of debit at exchange_rate (reporting, not Cash AFN).',
    )
    base_credit = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='AFN equivalent of credit at exchange_rate (reporting, not Cash AFN).',
    )
    needs_rate_review = models.BooleanField(
        default=False,
        help_text='True when historical rate/base could not be backfilled without inventing a rate.',
    )
    description = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        ordering = ['id']
        indexes = [
            models.Index(fields=['currency'], name='api_jl_currency_idx'),
            models.Index(fields=['gl_account', 'currency'], name='api_jl_gl_currency_idx'),
            models.Index(fields=['needs_rate_review'], name='api_jl_rate_review_idx'),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(debit__gte=0) & models.Q(credit__gte=0),
                name='journalline_debit_credit_nonnegative',
            ),
            models.CheckConstraint(
                check=~(models.Q(debit__gt=0) & models.Q(credit__gt=0)),
                name='journalline_not_both_debit_and_credit',
            ),
        ]

    def __str__(self):
        return f"{self.gl_account.code} Dr:{self.debit} Cr:{self.credit}"

    def clean(self):
        from django.core.exceptions import ValidationError

        from api.models.data.currency import BASE_CURRENCY_ID
        from api.services.accounting.journal_fx import validate_base_sides, validate_native_sides

        validate_native_sides(self.debit, self.credit)
        if self.base_debit is not None or self.base_credit is not None:
            validate_base_sides(self.base_debit or 0, self.base_credit or 0)
        if self.exchange_rate is not None and self.exchange_rate <= 0:
            raise ValidationError({'exchange_rate': 'exchange_rate must be positive.'})
        if self.currency == BASE_CURRENCY_ID and self.exchange_rate not in (None, Decimal('1'), Decimal('1.000000')):
            raise ValidationError({'exchange_rate': 'AFN exchange rate must be 1.'})


# Chart of accounts template.
# All accounts are created once for the single workspace.
DEFAULT_GL_ACCOUNTS = [
    # Assets
    ('1000', 'Cash',                    'asset'),
    ('1050', 'Bank',                    'asset'),
    ('1060', 'Sarafi',                  'asset'),
    ('1100', 'Inventory',               'asset'),
    ('1150', 'Clearing',   'asset'),
    ('1200', 'Accounts Receivable',     'asset'),
    ('1300', 'Employee Advances',       'asset'),
    ('1310', 'Loans Receivable',        'asset'),
    ('1320', 'Supplier Advances',       'asset'),
    ('1400', 'Fixed Assets',            'asset'),
    ('1410', 'Accumulated Depreciation - Fixed Assets', 'asset'),
    # Liabilities
    ('2000', 'Accounts Payable',        'liability'),
    ('2010', 'Third Party Settlement Payable', 'liability'),
    ('2100', 'Loans Payable',           'liability'),
    ('2200', 'Commission Payable',      'liability'),
    ('2300', 'Customer Advances',       'liability'),
    # Equity
    ('3000', 'Opening Balance Equity',  'equity'),
    ('3100', "Owner's Draw",            'equity'),
    ('3200', 'Retained Earnings',       'equity'),
    # Revenue
    ('4000', 'Sales Revenue',           'revenue'),
    ('4100', 'Sales Returns',           'revenue'),
    ('4200', 'Other Income',  'revenue'),
    ('4300', 'Realized FX Gain',        'revenue'),
    ('4400', 'Unrealized FX Gain',      'revenue'),
    # Expenses
    ('5000', 'Operating Expenses',      'expense'),
    ('5070', 'Stock Adjustments',       'expense'),
    ('5100', 'Payroll Expense',         'expense'),
    ('5150', 'Depreciation Expense',    'expense'),
    ('5200', 'Cost of Goods Sold',      'expense'),
    ('5220', 'Free Goods Distribution', 'expense'),
    ('5250', 'Commission Expense',      'expense'),
    ('5350', 'Realized FX Loss',        'expense'),
    ('5400', 'Unrealized FX Loss',      'expense'),
]
