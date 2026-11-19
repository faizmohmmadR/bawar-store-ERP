from decimal import Decimal

from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.customers import Customer
from api.models.data.vendors import Vendor

class Loan(BaseModel):
    LOAN_TYPES = [
        ('loan_in', 'Loan Received'),
        ('loan_out', 'Loan Given'),
    ]
    
    LOANER_TYPES = [
        ('customer', 'Customer'),
        ('vendor', 'Vendor'),
    ]

    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('bank', 'Bank'),
        ('sarafi', 'Sarafi'),
    ]

    loaner_type = models.CharField(max_length=10, choices=LOANER_TYPES, default='customer')
    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='loans',
    )
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='loans',
    )

    amount = models.DecimalField(max_digits=15, decimal_places=2)
    amount_base = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    amount_paid_base = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0'))
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    loan_type = models.CharField(max_length=10, choices=LOAN_TYPES)
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default='cash',
        help_text='Cash/bank/sarafi account that increases (loan in) or decreases (loan out). Ignored for opening balance.',
    )
    loan_date = models.DateTimeField(default=timezone.now)
    bill_number = models.CharField(max_length=100, blank=True, null=True)
    bill_file = models.FileField(upload_to='loan_bills/', blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    is_opening_balance = models.BooleanField(
        default=False,
        help_text='Historical loan from before the system — no cash movement at creation.',
    )
    source_payment = models.ForeignKey(
        'api.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='generated_loans',
        help_text='When set, this loan was created by an intermediary credit payment.',
    )
    is_paid = models.BooleanField(default=False)

    class Meta:
        ordering = ['-loan_date']

    def save(self, *args, **kwargs):
        paid = Decimal(str(self.amount_paid or 0))
        total = Decimal(str(self.amount or 0))
        self.is_paid = total > 0 and paid >= total
        super().save(*args, **kwargs)

    def __str__(self):
        name = self.get_loaner_name()
        return f"{name} - {self.get_loan_type_display()} - {self.amount}"
    
    def get_loaner_name(self):
        if self.loaner_type == 'customer' and self.customer:
            return self.customer.name
        elif self.loaner_type == 'vendor' and self.vendor:
            return self.vendor.name
        return "Unknown"

    @property
    def balance_due(self):
        return max(self.amount - self.amount_paid, Decimal('0'))

    def update_payment_status(self):
        self.is_paid = self.amount_paid >= self.amount
        self.save(update_fields=['is_paid', 'updated_at'])
    
    def clean(self):
        from django.core.exceptions import ValidationError
        if self.loaner_type == 'customer' and not self.customer:
            raise ValidationError({'customer': 'Customer is required for customer loans'})
        if self.loaner_type == 'vendor' and not self.vendor:
            raise ValidationError({'vendor': 'Vendor is required for vendor loans'})

class LoanPayment(BaseModel):
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('bank', 'Bank'),
        ('sarafi', 'Sarafi'),
    ]

    loan = models.ForeignKey(Loan, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    amount_base = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default='cash',
        help_text='Cash/bank/sarafi account used for this settlement.',
    )
    payment_date = models.DateTimeField(default=timezone.now)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    bill_number = models.CharField(max_length=100, blank=True, null=True)
    bill_file = models.FileField(upload_to='loan_payment_bills/', blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-payment_date', '-id']

    def __str__(self):
        return f"Payment {self.amount} for {self.loan}"

    def save(self, *args, **kwargs):
        from api.services.currency_conversion import populate_loan_payment_base, refresh_loan_paid_base

        populate_loan_payment_base(self)
        super().save(*args, **kwargs)
        loan = self.loan
        total_paid = loan.payments.aggregate(total=models.Sum('amount'))['total'] or Decimal('0')
        loan.amount_paid = total_paid
        loan.is_paid = total_paid >= loan.amount
        refresh_loan_paid_base(loan)
        loan.save(update_fields=['amount_paid', 'amount_paid_base', 'is_paid', 'updated_at'])

    def delete(self, *args, **kwargs):
        from api.services.currency_conversion import refresh_loan_paid_base

        loan = self.loan
        super().delete(*args, **kwargs)
        total_paid = loan.payments.aggregate(total=models.Sum('amount'))['total'] or Decimal('0')
        loan.amount_paid = total_paid
        loan.is_paid = total_paid >= loan.amount
        refresh_loan_paid_base(loan)
        loan.save(update_fields=['amount_paid', 'amount_paid_base', 'is_paid', 'updated_at'])

