from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel
from api.models.data.currency import CURRENCY_CHOICES


class Equipment(BaseModel):
    """
    Fixed assets (chairs, desks, computers, vehicles, machines, etc.)

    Accounting (via existing journal engine):
      - new_purchase: Dr Fixed Assets · Cr Cash/Bank/Sarafi
      - opening:      Dr Fixed Assets · Cr Acc Dep · Cr Opening Balance Equity
      - expense:      linked Expense only (Dr OpEx · Cr Cash) — no fixed-asset journal
    """

    STATUS_IN_USE = 'in_use'
    STATUS_IN_STORAGE = 'in_storage'
    STATUS_UNDER_REPAIR = 'under_repair'
    STATUS_DISPOSED = 'disposed'
    STATUS_CHOICES = [
        (STATUS_IN_USE, 'In use'),
        (STATUS_IN_STORAGE, 'In storage'),
        (STATUS_UNDER_REPAIR, 'Under repair'),
        (STATUS_DISPOSED, 'Disposed'),
    ]

    ACQUISITION_NEW = 'new_purchase'
    ACQUISITION_OPENING = 'opening'
    ACQUISITION_OWNER = 'owner_contribution'
    ACQUISITION_EXPENSE = 'expense'
    ACQUISITION_CHOICES = [
        (ACQUISITION_NEW, 'New purchase'),
        (ACQUISITION_OPENING, 'Existing / opening asset'),
        (ACQUISITION_OWNER, 'Owner contribution'),
        (ACQUISITION_EXPENSE, 'Record as expense'),
    ]

    PAYMENT_CASH = 'cash'
    PAYMENT_BANK = 'bank'
    PAYMENT_SARAFI = 'sarafi'
    PAYMENT_METHOD_CHOICES = [
        (PAYMENT_CASH, 'Cash'),
        (PAYMENT_BANK, 'Bank'),
        (PAYMENT_SARAFI, 'Sarafi'),
    ]

    CATEGORY_FURNITURE = 'furniture'
    CATEGORY_COMPUTERS = 'computers'
    CATEGORY_PERIPHERALS = 'peripherals'
    CATEGORY_NETWORKING = 'networking'
    CATEGORY_ELECTRONICS = 'electronics'
    CATEGORY_COMMUNICATION = 'communication'
    CATEGORY_APPLIANCES = 'appliances'
    CATEGORY_SECURITY = 'security'
    CATEGORY_STORAGE = 'storage'
    CATEGORY_LIGHTING = 'lighting'
    CATEGORY_VEHICLE = 'vehicle'
    CATEGORY_MACHINE = 'machine'
    CATEGORY_OTHER = 'other'
    CATEGORY_CHOICES = [
        (CATEGORY_FURNITURE, 'Furniture'),
        (CATEGORY_COMPUTERS, 'Computers'),
        (CATEGORY_PERIPHERALS, 'Peripherals'),
        (CATEGORY_NETWORKING, 'Networking'),
        (CATEGORY_ELECTRONICS, 'Electronics'),
        (CATEGORY_COMMUNICATION, 'Communication'),
        (CATEGORY_APPLIANCES, 'Appliances'),
        (CATEGORY_SECURITY, 'Security'),
        (CATEGORY_STORAGE, 'Storage'),
        (CATEGORY_LIGHTING, 'Lighting'),
        (CATEGORY_VEHICLE, 'Vehicle'),
        (CATEGORY_MACHINE, 'Machine'),
        (CATEGORY_OTHER, 'Other'),
    ]

    name = models.CharField(max_length=150)
    category = models.CharField(
        max_length=100,
        choices=CATEGORY_CHOICES,
        blank=True,
        null=True,
    )
    serial_number = models.CharField(max_length=100, blank=True, null=True, unique=True)
    asset_tag = models.CharField(max_length=100, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit = models.CharField(max_length=50, blank=True, null=True, default='pcs')
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.IntegerField(choices=CURRENCY_CHOICES)
    acquired_date = models.DateField(default=timezone.localdate)
    acquisition_type = models.CharField(
        max_length=30,
        choices=ACQUISITION_CHOICES,
        default=ACQUISITION_NEW,
    )
    accumulated_depreciation = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text='Total accumulated depreciation (opening entry + all yearly runs)',
    )
    opening_accumulated_depreciation = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text='Accumulated depreciation at acquisition time (opening assets only). Never changed after creation.',
    )
    useful_life_months = models.PositiveIntegerField(blank=True, null=True)
    residual_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    depreciation_start_date = models.DateField(blank=True, null=True)
    condition = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_IN_USE)
    location = models.CharField(max_length=150, blank=True, null=True)
    assigned_to = models.ForeignKey(
        'Employee',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_equipment',
    )
    notes = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    is_opening_balance = models.BooleanField(default=False)
    record_as_expense = models.BooleanField(default=False)
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default=PAYMENT_CASH,
    )
    expense = models.OneToOneField(
        'Expense',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='equipment_source',
    )

    class Meta:
        ordering = ['name', 'id']
        verbose_name = 'Equipment'
        verbose_name_plural = 'Equipment'
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['is_active']),
            models.Index(fields=['acquisition_type']),
            models.Index(fields=['category']),
        ]

    def __str__(self):
        return f'{self.name} ({self.quantity})'

    @property
    def total_cost(self):
        qty = Decimal(str(self.quantity or 0))
        cost = Decimal(str(self.unit_cost or 0))
        return qty * cost

    @property
    def net_book_value(self):
        cost = self.total_cost
        acc = Decimal(str(self.accumulated_depreciation or 0))
        return max(cost - acc, Decimal('0'))

    def sync_legacy_acquisition_flags(self):
        acq = self.acquisition_type or self.ACQUISITION_NEW
        self.is_opening_balance = acq in (self.ACQUISITION_OPENING, self.ACQUISITION_OWNER)
        self.record_as_expense = acq == self.ACQUISITION_EXPENSE

    def clean(self):
        super().clean()
        cost = self.total_cost
        acc = Decimal(str(self.accumulated_depreciation or 0))
        if acc < 0:
            raise ValidationError({'accumulated_depreciation': 'Cannot be negative.'})
        if acc > cost:
            raise ValidationError({'accumulated_depreciation': 'Cannot exceed original cost.'})
        residual = Decimal(str(self.residual_value or 0))
        if residual < 0:
            raise ValidationError({'residual_value': 'Cannot be negative.'})
        if residual > cost:
            raise ValidationError({'residual_value': 'Cannot exceed original cost.'})
        if self.acquisition_type == self.ACQUISITION_EXPENSE and acc > 0:
            raise ValidationError(
                {'accumulated_depreciation': 'Not used when recording as expense.'}
            )

    def save(self, *args, **kwargs):
        if not (self.serial_number or '').strip():
            from api.services.document_numbers import allocate_equipment_serial_number
            self.serial_number = allocate_equipment_serial_number()
        self.sync_legacy_acquisition_flags()
        super().save(*args, **kwargs)


class EquipmentDepreciation(BaseModel):
    """
    One depreciation run per year per asset.

    Journal: Dr Depreciation Expense (5150) · Cr Accumulated Depreciation (1410)

    Rules:
    - Only one record per (equipment, year).
    - amount must be > 0 and <= current net book value.
    - Records are add-only from the UI (no edit, no delete via API).
    - On save the signal posts the journal and updates equipment.accumulated_depreciation.
    """

    equipment = models.ForeignKey(
        Equipment,
        on_delete=models.CASCADE,
        related_name='depreciation_entries',
    )
    year = models.PositiveIntegerField(
        help_text='Fiscal/calendar year this depreciation covers (e.g. 2024)',
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text='Depreciation amount for this year',
    )
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['year']
        unique_together = [('equipment', 'year')]
        verbose_name = 'Equipment Depreciation'
        verbose_name_plural = 'Equipment Depreciation Entries'

    def __str__(self):
        return f'{self.equipment.name} — {self.year} — {self.amount}'

    def clean(self):
        super().clean()
        if self.amount is None or self.amount <= 0:
            raise ValidationError({'amount': 'Depreciation amount must be greater than zero.'})
        # NBV = total_cost - opening_accumulated_depreciation - sum(all other yearly entries)
        qs = EquipmentDepreciation.objects.filter(equipment=self.equipment)
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        yearly_others = sum(Decimal(str(e.amount)) for e in qs)
        opening = Decimal(str(self.equipment.opening_accumulated_depreciation or 0))
        nbv = self.equipment.total_cost - opening - yearly_others
        if Decimal(str(self.amount)) > nbv:
            raise ValidationError(
                {'amount': f'Depreciation amount ({self.amount}) exceeds net book value ({nbv:.2f}).'}
            )
