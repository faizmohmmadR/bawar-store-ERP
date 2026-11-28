from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.customers import Customer
from api.models.data.stock import Stock


class Sales(BaseModel):
    """Sales order for product packaging lines."""

    ORDER_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('confirmed', 'Confirmed'),
        ('shipped', 'Shipped'),
        ('delivered', 'Delivered'),
        ('invoiced', 'Invoiced'),
        ('cancelled', 'Cancelled'),
    ]

    transaction_type = models.CharField(
        max_length=4,
        choices=[('paid', 'Paid'), ('free', 'Free')],
        default='paid',
    )

    @property
    def is_free(self):
        return self.transaction_type == 'free'

    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, related_name='sales', null=True, blank=True,
    )
    vendor = models.ForeignKey(
        'api.Vendor', on_delete=models.PROTECT, related_name='sales', null=True, blank=True,
    )
    employee = models.ForeignKey(
        'api.Employee',
        on_delete=models.PROTECT,
        related_name='product_sales',
        null=True,
        blank=True,
        help_text='When set, this sale settles against employee salary.',
    )
    warehouse = models.ForeignKey(
        'api.Warehouse',
        on_delete=models.PROTECT,
        related_name='sales',
        null=True,
        blank=True,
    )

    class Meta:
        constraints = [
            # At most one party; walk-in sales may have none.
            models.CheckConstraint(
                condition=(
                    models.Q(customer__isnull=True, vendor__isnull=True, employee__isnull=True)
                    | models.Q(customer__isnull=False, vendor__isnull=True, employee__isnull=True)
                    | models.Q(customer__isnull=True, vendor__isnull=False, employee__isnull=True)
                    | models.Q(customer__isnull=True, vendor__isnull=True, employee__isnull=False)
                ),
                name='sale_at_most_one_party',
            ),
        ]

    invoice_number = models.CharField(max_length=50, unique=True, blank=True)
    sale_date = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=20, choices=ORDER_STATUS_CHOICES, default='draft')
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=4)
    total_amount_base = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    paid_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    paid_amount_base = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    bill_no = models.CharField(max_length=100, blank=True, null=True)
    plate_number = models.CharField(max_length=50, blank=True, null=True)
    notes = models.CharField(blank=True, null=True, max_length=255)
    documents = GenericRelation(
        'api.AttachedDocument',
        content_type_field='content_type',
        object_id_field='object_id',
        related_query_name='sale',
    )

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            from api.services.document_numbers import allocate_sale_invoice_number
            self.invoice_number = allocate_sale_invoice_number()
        super().save(*args, **kwargs)

    def soft_delete(self, user=None):
        """Trash the sale, restore delivered stock, and reverse linked Safe payments."""
        from django.db import transaction

        from api.services.cash_register import soft_delete_linked_payments
        from api.services.inventory.engine import reverse_sale_deliveries

        with transaction.atomic():
            soft_delete_linked_payments(self, user=user)
            reverse_sale_deliveries(self, user=user)
            super().soft_delete(user=user)

    @property
    def subtotal_amount(self):
        total = Decimal('0')
        for item in self.sales_items.all():
            total += Decimal(str(item.quantity or 0)) * Decimal(str(item.sell_price or 0))
        return total

    @property
    def discount_amount(self):
        return (self.subtotal_amount * Decimal(str(self.discount_percentage or 0))) / Decimal('100')

    @property
    def final_total(self):
        return self.subtotal_amount - self.discount_amount

    def __str__(self):
        party = self.vendor or self.customer or self.employee
        party_name = getattr(party, 'name', None) or getattr(party, 'full_name', '') or ''
        return f'{self.invoice_number}- {party_name}'


class SalesItems(BaseModel):
    """Sale line: product sold in a packaging unit; stock moved in base UOM."""

    sales = models.ForeignKey(Sales, on_delete=models.CASCADE, related_name='sales_items')
    product = models.ForeignKey(
        'api.Product',
        on_delete=models.PROTECT,
        related_name='sales_items',
    )
    packaging = models.ForeignKey(
        'api.ProductPackaging',
        on_delete=models.PROTECT,
        related_name='sales_items',
    )
    stock = models.ForeignKey(
        Stock,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales_items',
        help_text='Optional legacy stock mirror row.',
    )
    quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Quantity in selected packaging.',
    )
    conversion_factor = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=1,
        help_text='Snapshot of packaging.qty_in_base at sale time.',
    )
    base_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='quantity × conversion_factor in product base UOM.',
    )
    # Keep liter_amount as alias of base_quantity for older serializers during transition.
    liter_amount = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    sell_price = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Price per packaging unit in sale currency.',
    )
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='AVCO cost per base UOM in AFN at sale time.',
    )
    cost_is_known = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if self.sales_id and self.sales.is_free:
            self.sell_price = Decimal('0')
        if self.packaging_id and (not self.conversion_factor or self.conversion_factor == 0):
            self.conversion_factor = self.packaging.qty_in_base
        if not self.product_id and self.packaging_id:
            self.product_id = self.packaging.product_id
        qty = Decimal(str(self.quantity or 0))
        factor = Decimal(str(self.conversion_factor or 1))
        self.base_quantity = (qty * factor).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        self.liter_amount = self.base_quantity
        if kwargs.get('update_fields') is not None:
            kwargs['update_fields'] = set(kwargs['update_fields']) | {
                'base_quantity', 'liter_amount', 'conversion_factor', 'product',
            }
        super().save(*args, **kwargs)

    @property
    def line_total(self):
        return (
            Decimal(str(self.quantity or 0)) * Decimal(str(self.sell_price or 0))
        ).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)

    def __str__(self):
        name = getattr(self.product, 'name', self.product_id)
        pkg = getattr(self.packaging, 'name', '')
        return f'{name} ({pkg}) × {self.quantity} @ {self.sell_price}'
