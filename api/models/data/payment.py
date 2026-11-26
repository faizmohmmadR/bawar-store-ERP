from django.utils import timezone
from django.db import models
from django.contrib.contenttypes.fields import GenericForeignKey, GenericRelation
from django.contrib.contenttypes.models import ContentType
from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.vendors import Vendor

class Payment(BaseModel):
    """Payment model for sales and purchase payments"""
    PAYMENT_TYPE_CHOICES = [
        ('sale', 'Sale Payment'),
        ('purchase', 'Purchase Payment'),
    ]
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('bank', 'Bank'),
        ('sarafi', 'Sarafi'),
        ('intermediary_credit', 'Intermediary Credit'),
    ]

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')


    is_advance = models.BooleanField(default=False, help_text='Cash retained as customer or supplier credit.')
    is_credit_application = models.BooleanField(default=False, help_text='Application of existing credit; no new cash movement.')
    general_payment = models.ForeignKey('api.GeneralPayment', null=True, blank=True, on_delete=models.PROTECT, related_name='allocations')
    payment_type = models.CharField(max_length=20, choices=PAYMENT_TYPE_CHOICES)
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default='cash',
        help_text='How money moved: cash, bank, or sarafi — selects the GL asset account',
    )
    intermediary_vendor = models.ForeignKey(
        Vendor,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='intermediary_payments',
        help_text='Intermediary (sarafi/bank) that paid on our behalf.',
    )
    intermediary_loan = models.ForeignKey(
        'api.Loan',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='source_payments',
        help_text='Linked payable loan created for intermediary credit payment.',
    )
    payment_date = models.DateTimeField(default=timezone.now)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    amount_base = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    documents = GenericRelation(
        'api.AttachedDocument',
        content_type_field='content_type',
        object_id_field='object_id',
        related_query_name='payment',
    )

    class Meta:
        ordering = ['-payment_date', '-id']
        verbose_name_plural = 'Payments'

    def __str__(self):
        return f"Payment {self.id} - {self.payment_type}/{self.payment_method} - {self.amount} {self.get_currency_display()}"



class GeneralPayment(BaseModel):
    """Receipt header; its Payment children are the actual bill settlements."""
    source_sale = models.OneToOneField('api.Sales', null=True, blank=True, on_delete=models.PROTECT, related_name='vendor_credit_receipt')
    payment_type = models.CharField(max_length=20, choices=Payment.PAYMENT_TYPE_CHOICES)
    customer = models.ForeignKey('api.Customer', null=True, blank=True, on_delete=models.PROTECT, related_name='general_payments')
    vendor = models.ForeignKey(Vendor, null=True, blank=True, on_delete=models.PROTECT, related_name='general_payments')
    payment_method = models.CharField(max_length=20, choices=[choice for choice in Payment.PAYMENT_METHOD_CHOICES if choice[0] != 'intermediary_credit'], default='cash')
    payment_date = models.DateTimeField(default=timezone.now)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    amount_base = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    reference_number = models.CharField(max_length=100, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-payment_date', '-id']
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='general_payment_positive_amount'),
            models.CheckConstraint(condition=(models.Q(payment_type='sale', customer__isnull=False, vendor__isnull=True) | models.Q(payment_type='purchase', vendor__isnull=False, customer__isnull=True)), name='general_payment_correct_party'),
        ]

    @property
    def available_credit(self):
        from decimal import Decimal
        from django.db.models import Sum
        advance = self.allocations.filter(is_advance=True).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        applied = self.allocations.filter(is_credit_application=True).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        return max(Decimal('0'), advance - applied)

    def soft_delete(self, user=None):
        """Trash the receipt and reverse every allocation (including Safe cash rows)."""
        from django.db import transaction

        with transaction.atomic():
            for payment in self.allocations.all():
                payment.soft_delete(user=user)
            super().soft_delete(user=user)

    def __str__(self):
        return f'GPAY-{self.pk}'
