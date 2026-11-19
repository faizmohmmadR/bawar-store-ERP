from decimal import Decimal, ROUND_HALF_UP

from django.db import models
from django.utils import timezone
from api.models.data.base import BaseModel
from api.models.data.currency import CURRENCY_CHOICES


class RawMaterialCategory(BaseModel):
    """Reusable categories shared by bottle and plastic definitions."""
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'raw material categories'

    def __str__(self):
        return self.name


class RawMaterial(BaseModel):
    """Raw material definition with a fixed inventory unit."""
    TYPE_BOTTLE = 'bottle'
    TYPE_BOTTLE_WITH_CAP = 'bottle_with_cap'
    TYPE_CAP = 'cap'
    TYPE_CAP_LABEL = 'cap_label'
    TYPE_LABEL = 'label'
    TYPE_LABEL_DOUBLE = 'label_double'
    TYPE_PLASTIC = 'plastic'
    TYPE_CARTON = 'carton'
    TYPE_CARTON_PLASTIC = 'carton_plastic'
    TYPE_CHEMISTRY = 'chemistry'
    TYPE_BOILER = 'boiler'
    TYPE_OTHER = 'other'
    TYPE_CHOICES = [
        (TYPE_BOTTLE, 'Bottle'),
        (TYPE_BOTTLE_WITH_CAP, 'Bottle with cap'),
        (TYPE_CAP, 'Cap'),
        (TYPE_CAP_LABEL, 'Cap label'),
        (TYPE_LABEL, 'Label (single)'),
        (TYPE_LABEL_DOUBLE, 'Label (double)'),
        (TYPE_PLASTIC, 'Plastic'),
        (TYPE_CARTON, 'Carton'),
        (TYPE_CARTON_PLASTIC, 'Carton plastic'),
        (TYPE_CHEMISTRY, 'Chemistry'),
        (TYPE_BOILER, 'Boiler'),
        (TYPE_OTHER, 'Other'),
    ]
    # Packing label row accepts either single or double label materials.
    LABEL_TYPES = (TYPE_LABEL, TYPE_LABEL_DOUBLE)
    # Packing cap row accepts plain caps or cap-label materials.
    CAP_TYPES = (TYPE_CAP, TYPE_CAP_LABEL)
    # Materials always stocked in kilograms.
    KG_ONLY_TYPES = (TYPE_CARTON_PLASTIC, TYPE_BOILER)
    # Materials that can be consumed as production ingredients.
    PRODUCTION_INGREDIENT_TYPES = (
        TYPE_CHEMISTRY,
        TYPE_CARTON_PLASTIC,
        TYPE_BOILER,
    )

    UNIT_KG = 'kg'
    UNIT_GRAM = 'g'
    UNIT_PIECE = 'piece'
    UNIT_CHOICES = [
        (UNIT_KG, 'Kilogram'),
        (UNIT_GRAM, 'Gram'),
        (UNIT_PIECE, 'Piece'),
    ]

    name = models.CharField(max_length=255)
    material_type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default=TYPE_CHEMISTRY,
        db_index=True,
    )
    category = models.ForeignKey(
        RawMaterialCategory, on_delete=models.PROTECT,
        related_name='materials', null=True, blank=True,
    )
    description = models.TextField(blank=True, null=True)
    unit = models.CharField(
        max_length=50,
        default='kg',
        choices=UNIT_CHOICES,
        help_text='Inventory unit used for purchases and stock.'
    )
    capacity_liters = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        help_text=(
            'Bottle volume in liters. For plastic/carton this is the matching '
            'bottle size (same liters as the bottle they wrap/hold).'
        ),
    )
    weight_per_piece_kg = models.DecimalField(max_digits=14, decimal_places=6, null=True, blank=True,
        help_text='Actual raw-material weight per piece in kg; separate from filled bottle capacity.')
    capacity_kg = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        help_text=(
            'Mass capacity in kilograms. For bottles: liquid mass of one bottle. '
            'For plastic/carton: matching bottle mass size (when bottles are kg-based).'
        ),
    )
    CAPACITY_UNIT_ML = 'ml'
    CAPACITY_UNIT_L = 'L'
    CAPACITY_UNIT_CHOICES = [
        (CAPACITY_UNIT_ML, 'Milliliters'),
        (CAPACITY_UNIT_L, 'Liters'),
    ]
    capacity_display_unit = models.CharField(
        max_length=2,
        choices=CAPACITY_UNIT_CHOICES,
        default=CAPACITY_UNIT_ML,
        blank=True,
        help_text='UI unit the user entered for capacity (ml or L). Stored liters are always canonical.',
    )
    bottles_per_carton = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='For carton materials: how many bottles fit in one carton.',
    )
    bottles_per_plastic = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text='For plastic materials: how many bottles fit in one plastic package.',
    )

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['name'],
                name='uniq_raw_material_name'
            ),
            models.CheckConstraint(
                condition=~models.Q(material_type__in=['bottle', 'bottle_with_cap', 'plastic']) | models.Q(category__isnull=False),
                name='packaging_material_requires_category',
            ),
        ]

    def __str__(self):
        return self.name


class RawMaterialPurchase(BaseModel):
    """Purchase order for raw materials"""
    ORDER_STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending'),
        ('received', 'Received'),
        ('cancelled', 'Cancelled'),
    ]

    transaction_type = models.CharField(max_length=4, choices=[('paid', 'Paid'), ('free', 'Free')], default='paid')

    @property
    def is_free(self):
        return self.transaction_type == 'free'

    vendor = models.ForeignKey(
        'api.Vendor',
        on_delete=models.PROTECT,
        related_name='raw_material_purchases'
    )
    invoice_number = models.CharField(max_length=50, unique=True, blank=True)
    bill_number = models.CharField(max_length=100, blank=True, null=True)
    purchase_date = models.DateTimeField(default=timezone.now)
    status = models.CharField(
        max_length=20,
        choices=ORDER_STATUS_CHOICES,
        default='draft'
    )
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    total_amount = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        default=0
    )
    total_amount_base = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        default=0,
        help_text='Purchase total converted to AFN at the purchase-date exchange rate.',
    )
    paid_amount = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        default=0
    )
    paid_amount_base = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        default=0,
        help_text='Paid total converted to AFN from linked payment amount_base values.',
    )
    exchange_rate = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=1,
        help_text=(
            'Snapshot of Settings→Exchange Rates at purchase_date '
            '(1 purchase-currency = this many AFN). Not a separate rate table.'
        ),
    )
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['-purchase_date', '-id']

    def save(self, *args, **kwargs):
        if not (self.invoice_number or '').strip():
            from api.services.document_numbers import allocate_raw_material_purchase_invoice_number

            self.invoice_number = allocate_raw_material_purchase_invoice_number()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.invoice_number} - {self.vendor.name}"

    @property
    def subtotal_amount(self):
        """Calculate subtotal from items"""
        total = 0
        for item in self.items.all():
            total += item.total_price
        return total

    @property
    def final_total(self):
        """Grand total based on the purchase items."""
        return self.subtotal_amount


class RawMaterialPurchaseItem(BaseModel):
    """Line item for raw material purchase"""
    purchase = models.ForeignKey(
        RawMaterialPurchase,
        on_delete=models.CASCADE,
        related_name='items'
    )
    raw_material = models.ForeignKey(
        RawMaterial,
        on_delete=models.PROTECT,
        related_name='purchase_items'
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text='Quantity in the raw material unit'
    )
    piece_count = models.PositiveIntegerField(
        default=0,
        help_text='Additional piece or package count for kilogram-based materials'
    )
    price_per_unit = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        help_text='Price per unit'
    )
    total_price = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        help_text='Total price (quantity × price per unit)'
    )
    price_per_unit_base = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Unit price converted to AFN at the purchase-date exchange rate.',
    )
    total_price_base = models.DecimalField(
        max_digits=15,
        decimal_places=4,
        default=0,
        help_text='Line total converted to AFN at the purchase-date exchange rate.',
    )
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.raw_material.name} - {self.quantity} {self.raw_material.unit}"

    def save(self, *args, **kwargs):
        # Store the source-currency values and their purchase-date AFN costs.
        if self.purchase.is_free:
            self.price_per_unit = Decimal('0')
        self.total_price = self.quantity * self.price_per_unit
        exchange_rate = Decimal(str(self.purchase.exchange_rate or 1))
        self.price_per_unit_base = (
            Decimal(str(self.price_per_unit)) * exchange_rate
        ).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
        self.total_price_base = (
            Decimal(str(self.quantity)) * self.price_per_unit_base
        ).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
        if kwargs.get('update_fields') is not None:
            kwargs['update_fields'] = set(kwargs['update_fields']) | {
                'total_price', 'price_per_unit_base', 'total_price_base',
            }
        super().save(*args, **kwargs)
        # Update purchase total
        self.purchase.save()


class RawMaterialStock(BaseModel):
    zero_cost_allowed = models.BooleanField(default=False, help_text='Known zero acquisition cost from an explicit free receipt.')
    """Stock tracking in each raw material's configured unit."""
    raw_material = models.ForeignKey(
        RawMaterial,
        on_delete=models.PROTECT,
        related_name='stocks'
    )
    quantity = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        help_text='Current stock quantity in the raw material unit'
    )
    piece_count = models.PositiveIntegerField(
        default=0,
        help_text='Additional piece or package count for kilogram-based materials'
    )
    last_purchase_price = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text=(
            'Current moving weighted-average price per unit in AFN. '
            'Converted from the purchase currency using the purchase-date exchange rate.'
        ),
    )
    last_purchase_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ['raw_material__name']
        unique_together = ['raw_material']

    def __str__(self):
        return f"{self.raw_material.name}: {self.quantity} {self.raw_material.unit}"

    def update_stock(self, quantity: float, price_per_unit: float = None):
        """Apply a locked receipt/quantity adjustment at the current moving average."""
        from django.db import transaction
        from api.services.weighted_average import d, receive_raw_stock
        with transaction.atomic():
            stock = type(self).objects.select_for_update().get(pk=self.pk)
            price = d(price_per_unit) if price_per_unit is not None else d(stock.last_purchase_price)
            if price < 0:
                from rest_framework.exceptions import ValidationError
                raise ValidationError('Stock price cannot be negative.')
            if d(quantity) > 0:
                stock.last_purchase_date = timezone.localdate()
            receive_raw_stock(stock, quantity, d(quantity) * price)
            self.refresh_from_db()
