"""Shared InventoryBatch query helpers for sellable vs on-hand / expiry views."""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone

from api.models.data.inventory_batch import InventoryBatch


ON_HAND_STATUSES = (
    InventoryBatch.STATUS_ACTIVE,
    InventoryBatch.STATUS_EXPIRED,
)


def today():
    return timezone.localdate()


def sellable_batch_q():
    """Batches that may still be sold (active and not past expire_date)."""
    return Q(
        status=InventoryBatch.STATUS_ACTIVE,
        remaining_pieces__gt=Decimal('0'),
    ) & (Q(expire_date__isnull=True) | Q(expire_date__gte=today()))


def on_hand_batch_q():
    """Batches still physically in the warehouse (active or expired with qty)."""
    return Q(
        status__in=ON_HAND_STATUSES,
        remaining_pieces__gt=Decimal('0'),
    )


def expired_on_hand_q():
    """Expired lots that still have remaining pieces."""
    return Q(
        status__in=ON_HAND_STATUSES,
        remaining_pieces__gt=Decimal('0'),
        expire_date__isnull=False,
        expire_date__lt=today(),
    )


def near_expiry_q(days_ahead=30):
    """Active lots expiring within the look-ahead window (not yet expired)."""
    cutoff = today() + timedelta(days=int(days_ahead))
    return Q(
        status=InventoryBatch.STATUS_ACTIVE,
        remaining_pieces__gt=Decimal('0'),
        expire_date__gte=today(),
        expire_date__lte=cutoff,
    )


def expiring_attention_q(days_ahead=30, include_expired=True):
    """Lots needing expiry attention: near-expiry and optionally already expired."""
    q = near_expiry_q(days_ahead)
    if include_expired:
        q = q | expired_on_hand_q()
    return q


def filter_batches_for_stock(product, condition):
    """Base filter matching the legacy Stock row identity for an InventoryBatch."""
    return Q(
        product=product,
        condition=condition,
    )
