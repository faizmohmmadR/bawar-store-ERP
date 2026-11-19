from django.db import models
from django.utils import timezone
from api.models.data.base import BaseModel

from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.products import Product
from api.models.data.vendors import Vendor


class InventoryBatch(BaseModel):
    """
    Inventory Batch/Lot model — unique lots for FEFO tracking.
    Batches are NEVER merged - each maintains its own identity.
    """
    STATUS_ACTIVE = 'active'
    STATUS_EXPIRED = 'expired'
    STATUS_EMPTY = 'empty'
    STATUS_DAMAGED = 'damaged'
    STATUS_RETURNED = 'returned'
    
    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_EMPTY, 'Empty'),
        (STATUS_DAMAGED, 'Damaged'),
        (STATUS_RETURNED, 'Returned'),
    ]

    batch_number = models.CharField(
        max_length=50,
        unique=True,
        help_text='Unique batch identifier (auto-generated)'
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='inventory_batches')
    supplier = models.ForeignKey(
        Vendor,
        on_delete=models.PROTECT,
        related_name='inventory_batches',
        null=True,
        blank=True,
        help_text='Supplier for this batch (optional)'
    )

    condition = models.CharField(
        max_length=20,
        choices=[
            ('good', 'Good'),
            ('damaged', 'Damaged'),
            ('waste', 'Waste'),
        ],
        default='good',
        help_text='Inventory condition for the batch'
    )
    
    # Quantity fields
    cartons_received = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        help_text='Cartons received in this batch'
    )
    pieces_received = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        help_text='Total pieces received (cartons_received × 8)'
    )
    remaining_pieces = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        default=0,
        help_text='Remaining pieces in this batch'
    )
    
    # Cost tracking
    unit_cost = models.DecimalField(
        max_digits=18,
        decimal_places=6,
        default=0,
        help_text='Moving average cost per piece in AFN at time of receipt',
    )
    receipt_unit_cost = models.DecimalField(max_digits=18, decimal_places=6, null=True, blank=True, editable=False)
    currency = models.IntegerField(
        choices=CURRENCY_CHOICES,
        default=1,
        help_text='Always AFN (1) for inventory batch costs',
    )
    
    # Date tracking
    expire_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text='Expiration date for FEFO allocation'
    )
    manufacturing_date = models.DateField(
        null=True,
        blank=True,
        help_text='Optional manufacturing date'
    )
    
    # Status
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
        db_index=True,
        help_text='Batch status'
    )
    
    # Notes
    notes = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ['expire_date', 'created_at']
        indexes = [
            models.Index(fields=['product', 'status']),
            models.Index(fields=['expire_date', 'status']),
        ]

    def __str__(self):
        return f"{self.batch_number} - {self.product.name} ({self.remaining_pieces} pieces)"

    def save(self, *args, **kwargs):
        from django.db import transaction
        from api.services.pooled_stock import capture_pool, update_pool
        with transaction.atomic():
            before = capture_pool(self)
            if self.receipt_unit_cost is None:
                self.receipt_unit_cost = self.unit_cost
                if kwargs.get('update_fields') is not None:
                    kwargs['update_fields'] = set(kwargs['update_fields']) | {'receipt_unit_cost'}
            if self.pk and not getattr(self, '_allow_cost_adjustment', False):
                old = before['rows'].get(self.pk)
                if old:
                    self.unit_cost = old['unit_cost']
            result = self._save_batch(*args, **kwargs)
            update_pool(self, before)
            return result

    def delete(self, *args, **kwargs):
        from django.db import transaction
        from api.services.pooled_stock import capture_pool, update_pool
        with transaction.atomic():
            before = capture_pool(self)
            old_pk = self.pk
            result = super().delete(*args, **kwargs)
            update_pool(self, before, removed_id=old_pk)
            return result

    def _save_batch(self, *args, **kwargs):
        if not self.batch_number:
            from api.services.document_numbers import allocate_batch_number
            self.batch_number = allocate_batch_number()
        
        # Auto-update status based on remaining quantity and expiration
        if self.remaining_pieces <= 0:
            self.status = self.STATUS_EMPTY
        elif self.expire_date and self.expire_date < timezone.localdate():
            self.status = self.STATUS_EXPIRED
        elif self.status == self.STATUS_EMPTY and self.remaining_pieces > 0:
            self.status = self.STATUS_ACTIVE
            
        super().save(*args, **kwargs)

    @property
    def cartons_remaining(self):
        """Calculate remaining cartons from pieces."""
        from api.utils.packaging import bottles_per_carton, cartons_from_pieces
        return cartons_from_pieces(
            self.remaining_pieces, bottles_per_carton(self.product),
        )

    @property
    def loose_pieces(self):
        """Calculate loose pieces after full cartons."""
        from api.utils.packaging import bottles_per_carton, remainder_pieces
        return remainder_pieces(
            self.remaining_pieces, bottles_per_carton(self.product),
        )

    @property
    def days_until_expiry(self):
        """Days until expiration (negative if expired)."""
        if not self.expire_date:
            return None
        return (self.expire_date - timezone.localdate()).days

    @property
    def is_expired(self):
        """Check if batch is expired."""
        if not self.expire_date:
            return False
        return self.expire_date < timezone.localdate()

    @property
    def is_near_expiry(self):
        """Check if batch expires within 30 days."""
        if not self.expire_date or self.is_expired:
            return False
        days = self.days_until_expiry
        return days is not None and days <= 30
