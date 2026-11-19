from django.utils import timezone
from django.db import models
from django.contrib.contenttypes.fields import GenericRelation
from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.customers import Customer
from api.models.data.salesmen import Salesman
from api.models.data.stock import Stock
from api.models.data.storage_tank import StorageTank


class Sales(BaseModel):
    """Sales order model"""
    ORDER_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('confirmed', 'Confirmed'),
        ('shipped', 'Shipped'),
        ('delivered', 'Delivered'),
        ('invoiced', 'Invoiced'),
        ('cancelled', 'Cancelled'),
    ]

    transaction_type = models.CharField(max_length=4, choices=[('paid', 'Paid'), ('free', 'Free')], default='paid')

    @property
    def is_free(self):
        return self.transaction_type == 'free'

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='sales', null=True, blank=True)
    vendor = models.ForeignKey('api.Vendor', on_delete=models.PROTECT, related_name='raw_material_sales', null=True, blank=True)
    employee = models.ForeignKey(
        'api.Employee',
        on_delete=models.PROTECT,
        related_name='product_sales',
        null=True,
        blank=True,
        help_text='When set, this sale settles against the employee salary (goods as paid salary).',
    )
    vendor_transaction = models.CharField(max_length=20, choices=[('sale', 'Sale'), ('purchase_return', 'Purchase return')], default='sale')

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(customer__isnull=False, vendor__isnull=True, employee__isnull=True)
                    | models.Q(customer__isnull=True, vendor__isnull=False, employee__isnull=True)
                    | models.Q(customer__isnull=True, vendor__isnull=True, employee__isnull=False)
                ),
                name='sale_exactly_one_party',
            ),
        ]

    salesman = models.ForeignKey(
        Salesman,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='sales',
        help_text='Optional salesman who earns commission on this sale.',
    )

    invoice_number = models.CharField(max_length=50, unique=True, blank=True)
    sale_date = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=20, choices=ORDER_STATUS_CHOICES, default='draft')
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    discount_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=4)
    total_amount_base = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    paid_amount = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    paid_amount_base = models.DecimalField(max_digits=15, decimal_places=4, default=0)
    exchange_rate = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=1,
        help_text=(
            'Snapshot of Settings→Exchange Rates at sale_date '
            '(1 sale-currency = this many AFN). Not a separate rate table.'
        ),
    )
    bill_no = models.CharField(max_length=100, blank=True, null=True, help_text='Optional external bill/reference number')
    plate_number = models.CharField(max_length=50, blank=True, null=True, help_text='Vehicle plate number (پلیټ نمبر)')
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

    @property
    def subtotal_amount(self):
        """Subtotal before discount."""
        from api.utils.packaging import sales_item_line_total

        total = 0
        for item in self.sales_items.all():
            total += sales_item_line_total(item)
        return total

    @property
    def discount_amount(self):
        """Calculate discount amount"""
        return (self.subtotal_amount * self.discount_percentage) / 100

    @property
    def final_total(self):
        """Calculate final total after discount"""
        return self.subtotal_amount - self.discount_amount

    def __str__(self):
        party = self.vendor or self.customer or self.employee
        party_name = getattr(party, 'name', None) or getattr(party, 'full_name', '') or ''
        return f"{self.invoice_number}- {party_name}"


class SalesItems(BaseModel):
    """
    Sales line items.

    Sources:
    - stock: sell packed finished goods by carton/dana (pieces + FEFO batches)
    - tank: fill customer's container from StorageTank bulk liquid by liters
    - raw_material: sell packaging/chemistry raw materials from RawMaterialStock
    """
    SOURCE_STOCK = 'stock'
    SOURCE_TANK = 'tank'
    SOURCE_RAW_MATERIAL = 'raw_material'
    SOURCE_CHOICES = [
        (SOURCE_STOCK, 'Packed stock'),
        (SOURCE_TANK, 'Tank fill'),
        (SOURCE_RAW_MATERIAL, 'Raw material'),
    ]

    UNIT_CARTON = 'carton'
    UNIT_BOTTLE = 'bottle'
    UNIT_PLASTIC = 'plastic'
    UNIT_DANA = 'dana'  # legacy alias for bottle/piece
    UNIT_PIECE = 'piece'
    UNIT_LITER = 'liter'
    UNIT_KG = 'kg'
    UNIT_CHOICES = [
        (UNIT_CARTON, 'Carton'),
        (UNIT_BOTTLE, 'Bottle'),
        (UNIT_PLASTIC, 'Plastic'),
        (UNIT_DANA, 'Dana'),
        (UNIT_PIECE, 'Piece'),
        (UNIT_LITER, 'Liter'),
        (UNIT_KG, 'Kilogram'),
    ]
    PIECE_UNITS = {UNIT_BOTTLE, UNIT_PLASTIC, UNIT_DANA, UNIT_PIECE, 'pieces'}

    sales = models.ForeignKey(Sales, on_delete=models.CASCADE, related_name='sales_items')
    sale_source = models.CharField(
        max_length=16,
        choices=SOURCE_CHOICES,
        default=SOURCE_STOCK,
        db_index=True,
        help_text=(
            'stock = packed inventory; tank = bulk fill from storage tank; '
            'raw_material = sell raw material stock'
        ),
    )
    stock = models.ForeignKey(
        Stock,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='sales_items',
    )
    storage_tank = models.ForeignKey(
        StorageTank,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='sales_items',
    )
    raw_material_stock = models.ForeignKey(
        'api.RawMaterialStock',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='sales_items',
        help_text='Raw material inventory row for raw_material sale lines.',
    )
    unit = models.CharField(
        max_length=10,
        choices=UNIT_CHOICES,
        default=UNIT_CARTON,
        help_text=(
            'carton/bottle/plastic/kg for stock; liter/kg for tank; '
            'piece/kg for raw materials'
        ),
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        help_text='Quantity in the selected unit (cartons, pieces, liters, or kilograms)',
    )
    liter_amount = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        help_text='For stock lines: piece equivalent. For tank lines: liters sold, including kg conversion.',
    )
    kilogram_amount = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        help_text='Mass represented by this sale line, in kilograms.',
    )
    sell_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        help_text='Price per selected unit (carton, piece, or liter)',
    )
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Inventory cost per piece (stock) or per liter (tank) in AFN',
    )
    cost_is_known = models.BooleanField(default=False)
    commission_amount = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        help_text='Commission per selected unit (carton, bottle, plastic, or liter) always in AFN.',
    )
    piece_count = models.PositiveIntegerField(
        default=0,
        help_text=(
            'Optional package/piece count deducted with kilogram raw-material sales.'
        ),
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(
                        sale_source='stock',
                        stock__isnull=False,
                        storage_tank__isnull=True,
                        raw_material_stock__isnull=True,
                    )
                    | models.Q(
                        sale_source='tank',
                        storage_tank__isnull=False,
                        stock__isnull=True,
                        raw_material_stock__isnull=True,
                    )
                    | models.Q(
                        sale_source='raw_material',
                        raw_material_stock__isnull=False,
                        stock__isnull=True,
                        storage_tank__isnull=True,
                    )
                ),
                name='salesitems_source_stock_xor_tank_xor_raw_material',
            ),
        ]

    def __str__(self):
        if self.sale_source == self.SOURCE_TANK and self.storage_tank_id:
            return f"{self.storage_tank.name} - {self.quantity} L @ {self.sell_price}"
        if self.sale_source == self.SOURCE_RAW_MATERIAL and self.raw_material_stock_id:
            name = self.raw_material_stock.raw_material.name
            return f"{name} - {self.quantity} {self.unit} @ {self.sell_price}"
        product = self.stock.product.name if self.stock_id and self.stock.product_id else 'Item'
        return f"{product} - {self.quantity} {self.unit} @ {self.sell_price}"
