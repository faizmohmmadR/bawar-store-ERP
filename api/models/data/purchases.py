from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.currency import CURRENCY_CHOICES


class Purchase(BaseModel):
    """Vendor purchase of products (replaces RawMaterialPurchase)."""

    ORDER_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending'),
        ('received', 'Received'),
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

    vendor = models.ForeignKey(
        'api.Vendor',
        on_delete=models.PROTECT,
        related_name='purchases',
    )
    warehouse = models.ForeignKey(
        'api.Warehouse',
        on_delete=models.PROTECT,
        related_name='purchases',
    )
    invoice_number = models.CharField(max_length=50, unique=True, blank=True)
    bill_number = models.CharField(max_length=100, blank=True, null=True)
    purchase_date = models.DateTimeField(default=timezone.now)
    status = models.CharField(
        max_length=20,
        choices=ORDER_STATUS_CHOICES,
        default='draft',
    )
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    total_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    total_amount_base = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    paid_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    paid_amount_base = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    notes = models.TextField(blank=True, null=True)
    documents = GenericRelation(
        'api.AttachedDocument',
        content_type_field='content_type',
        object_id_field='object_id',
        related_query_name='purchase',
    )

    class Meta:
        ordering = ['-purchase_date', '-id']

    def save(self, *args, **kwargs):
        if not (self.invoice_number or '').strip():
            from api.services.document_numbers import allocate_purchase_invoice_number
            self.invoice_number = allocate_purchase_invoice_number()
        super().save(*args, **kwargs)

    def soft_delete(self, user=None):
        """Trash the purchase, reverse received stock, and reverse Safe cash payments."""
        from django.db import transaction

        from api.services.cash_register import soft_delete_linked_payments
        from api.services.inventory.engine import reverse_purchase_receipts

        with transaction.atomic():
            soft_delete_linked_payments(self, user=user)
            reverse_purchase_receipts(self, user=user)
            super().soft_delete(user=user)

    def __str__(self):
        return f'{self.invoice_number} - {self.vendor_id}'

    @property
    def subtotal_amount(self):
        return sum((item.total_price for item in self.items.all()), Decimal('0'))

    @property
    def final_total(self):
        return self.subtotal_amount


class PurchaseItem(BaseModel):
    """Purchase line with packaging UOM and snapshotted conversion."""

    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.CASCADE,
        related_name='items',
    )
    product = models.ForeignKey(
        'api.Product',
        on_delete=models.PROTECT,
        related_name='purchase_items',
    )
    packaging = models.ForeignKey(
        'api.ProductPackaging',
        on_delete=models.PROTECT,
        related_name='purchase_items',
    )
    quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        help_text='Quantity in the selected purchase packaging.',
    )
    conversion_factor = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=1,
        help_text='Snapshot of packaging.qty_in_base at posting.',
    )
    base_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='quantity × conversion_factor (or measured weight for variable packs).',
    )
    # For variable-weight packages, operator enters actual measured base qty.
    measured_base_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        null=True,
        blank=True,
    )
    price_per_unit = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        help_text='Price per purchase packaging unit in purchase currency.',
    )
    profit_percent = models.DecimalField(
        max_digits=8,
        decimal_places=4,
        default=0,
        help_text='Markup % over purchase unit cost used to derive sale_price.',
    )
    sale_price = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Target retail selling price per this packaging unit (purchase currency).',
    )
    total_price = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    price_per_unit_base = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    total_price_base = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    discount_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    lot_number = models.CharField(max_length=100, blank=True, null=True)
    expiry_date = models.DateField(null=True, blank=True)
    manufacturing_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.product_id} × {self.quantity}'

    def save(self, *args, **kwargs):
        if self.purchase.is_free:
            self.price_per_unit = Decimal('0')
        if self.packaging_id and not self.conversion_factor:
            self.conversion_factor = self.packaging.qty_in_base
        factor = Decimal(str(self.conversion_factor or 1))
        qty = Decimal(str(self.quantity or 0))
        if self.measured_base_quantity is not None:
            self.base_quantity = Decimal(str(self.measured_base_quantity))
        else:
            self.base_quantity = (qty * factor).quantize(
                Decimal('0.000001'), rounding=ROUND_HALF_UP,
            )
        self.total_price = (
            qty * Decimal(str(self.price_per_unit or 0))
            - Decimal(str(self.discount_amount or 0))
        ).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
        rate = Decimal(str(self.purchase.exchange_rate or 1))
        self.price_per_unit_base = (
            Decimal(str(self.price_per_unit or 0)) * rate
        ).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        self.total_price_base = (
            self.total_price * rate
        ).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
        if kwargs.get('update_fields') is not None:
            kwargs['update_fields'] = set(kwargs['update_fields']) | {
                'base_quantity', 'total_price', 'price_per_unit_base',
                'total_price_base', 'conversion_factor',
            }
        super().save(*args, **kwargs)
        # Refresh purchase totals
        purchase = self.purchase
        total = sum(
            (Decimal(str(i.total_price)) for i in purchase.items.all()),
            Decimal('0'),
        )
        total_base = sum(
            (Decimal(str(i.total_price_base)) for i in purchase.items.all()),
            Decimal('0'),
        )
        Purchase.objects.filter(pk=purchase.pk).update(
            total_amount=total,
            total_amount_base=total_base,
        )
        # Item post_save runs inside super().save() before totals are written, so
        # re-sync the purchase journal once the header totals are final.
        from api.services.accounting import sync_purchase_journal
        purchase.refresh_from_db()
        sync_purchase_journal(purchase)


class PurchaseLandedCost(BaseModel):
    """Additional purchase costs allocated into inventory valuation."""

    METHOD_VALUE = 'value'
    METHOD_QUANTITY = 'quantity'
    METHOD_CHOICES = [
        (METHOD_VALUE, 'By line value'),
        (METHOD_QUANTITY, 'By base quantity'),
    ]

    purchase = models.ForeignKey(
        Purchase,
        on_delete=models.CASCADE,
        related_name='landed_costs',
    )
    label = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=15, decimal_places=4)
    currency = models.IntegerField(choices=CURRENCY_CHOICES, default=1)
    amount_base = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    allocation_method = models.CharField(
        max_length=20, choices=METHOD_CHOICES, default=METHOD_VALUE,
    )
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['id']
