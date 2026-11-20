from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils import timezone

from account.models import User
from api.models.data.base import BaseModel


class InventoryLot(BaseModel):
    """Optional batch/lot for expiry/FEFO tracking."""

    product = models.ForeignKey(
        'api.Product',
        on_delete=models.PROTECT,
        related_name='lots',
    )
    warehouse = models.ForeignKey(
        'api.Warehouse',
        on_delete=models.PROTECT,
        related_name='lots',
    )
    lot_number = models.CharField(max_length=100)
    manufacturing_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    quantity_received = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    quantity_remaining = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    vendor = models.ForeignKey(
        'api.Vendor',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='inventory_lots',
    )
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['expiry_date', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'warehouse', 'lot_number'],
                name='uniq_lot_per_warehouse',
            ),
        ]

    def __str__(self):
        return f'{self.lot_number} ({self.product_id})'


class InventoryBalance(BaseModel):
    """Cached on-hand balance per product/warehouse/(optional lot)."""

    product = models.ForeignKey(
        'api.Product',
        on_delete=models.PROTECT,
        related_name='inventory_balances',
    )
    warehouse = models.ForeignKey(
        'api.Warehouse',
        on_delete=models.PROTECT,
        related_name='inventory_balances',
    )
    lot = models.ForeignKey(
        InventoryLot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='balances',
    )
    quantity_on_hand = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    quantity_reserved = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    average_cost = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='AVCO unit cost in AFN for this balance row.',
    )

    class Meta:
        ordering = ['product_id', 'warehouse_id']
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'warehouse', 'lot'],
                name='uniq_balance_product_warehouse_lot',
            ),
        ]

    @property
    def quantity_available(self):
        return self.quantity_on_hand - self.quantity_reserved

    def __str__(self):
        return f'{self.product_id}@{self.warehouse_id}: {self.quantity_on_hand}'


class StockMovement(BaseModel):
    """
    Immutable inventory movement ledger.

    Corrections use reversal movements — never edit posted rows in place.
    Quantities that decrease stock are stored as negative base_quantity.
    """

    TYPE_PURCHASE_RECEIPT = 'purchase_receipt'
    TYPE_SALES_DELIVERY = 'sales_delivery'
    TYPE_CUSTOMER_RETURN = 'customer_return'
    TYPE_SUPPLIER_RETURN = 'supplier_return'
    TYPE_TRANSFER_OUT = 'transfer_out'
    TYPE_TRANSFER_IN = 'transfer_in'
    TYPE_ADJUSTMENT_IN = 'adjustment_in'
    TYPE_ADJUSTMENT_OUT = 'adjustment_out'
    TYPE_DAMAGE = 'damage'
    TYPE_EXPIRY = 'expiry'
    TYPE_CONSUMPTION = 'consumption'
    TYPE_OPENING = 'opening'
    TYPE_PACKAGE_OPEN = 'package_open'
    TYPE_CHOICES = [
        (TYPE_PURCHASE_RECEIPT, 'Purchase receipt'),
        (TYPE_SALES_DELIVERY, 'Sales delivery'),
        (TYPE_CUSTOMER_RETURN, 'Customer return'),
        (TYPE_SUPPLIER_RETURN, 'Supplier return'),
        (TYPE_TRANSFER_OUT, 'Transfer out'),
        (TYPE_TRANSFER_IN, 'Transfer in'),
        (TYPE_ADJUSTMENT_IN, 'Adjustment increase'),
        (TYPE_ADJUSTMENT_OUT, 'Adjustment decrease'),
        (TYPE_DAMAGE, 'Damage'),
        (TYPE_EXPIRY, 'Expiry'),
        (TYPE_CONSUMPTION, 'Internal consumption'),
        (TYPE_OPENING, 'Opening balance'),
        (TYPE_PACKAGE_OPEN, 'Package open'),
    ]

    product = models.ForeignKey(
        'api.Product',
        on_delete=models.PROTECT,
        related_name='stock_movements',
    )
    warehouse = models.ForeignKey(
        'api.Warehouse',
        on_delete=models.PROTECT,
        related_name='stock_movements',
    )
    lot = models.ForeignKey(
        InventoryLot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='movements',
    )
    movement_type = models.CharField(max_length=32, choices=TYPE_CHOICES, db_index=True)
    base_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        help_text='Signed quantity in product base UOM.',
    )
    packaging = models.ForeignKey(
        'api.ProductPackaging',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='movements',
    )
    transaction_quantity = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        help_text='Signed quantity in transaction packaging/UOM.',
    )
    conversion_factor = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=1,
        help_text='Snapshot: base units per 1 transaction unit at posting time.',
    )
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Unit cost in AFN per base UOM.',
    )
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='stock_movements',
    )
    notes = models.TextField(blank=True, null=True)

    # Source document (purchase item, sale item, adjustment, …)
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    object_id = models.PositiveIntegerField(null=True, blank=True)
    source = GenericForeignKey('content_type', 'object_id')

    class Meta:
        ordering = ['-occurred_at', '-id']
        indexes = [
            models.Index(fields=['product', 'warehouse', 'occurred_at']),
            models.Index(fields=['content_type', 'object_id']),
        ]

    def __str__(self):
        return f'{self.movement_type} {self.base_quantity} {self.product_id}'


class InventoryPackageBalance(BaseModel):
    """
    Optional physical packaging state (unopened cartons vs loose pieces).
    Does not affect canonical InventoryBalance — display/ops aid only.
    """

    product = models.ForeignKey(
        'api.Product',
        on_delete=models.CASCADE,
        related_name='package_balances',
    )
    warehouse = models.ForeignKey(
        'api.Warehouse',
        on_delete=models.CASCADE,
        related_name='package_balances',
    )
    packaging = models.ForeignKey(
        'api.ProductPackaging',
        on_delete=models.CASCADE,
        related_name='package_balances',
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=6, default=0)
    is_opened = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['product', 'warehouse', 'packaging', 'is_opened'],
                name='uniq_package_balance_state',
            ),
        ]
