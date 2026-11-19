"""Stock expiry service - works with InventoryBatch lots.

Identifies and manages expired and near-expiry inventory using batch-based
inventory. Expired lots remain visible while they still have remaining pieces
so warehouse staff can see product + purchase origin.
"""
from datetime import timedelta

from django.utils import timezone

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.stock_adjustment import StockAdjustment
from api.services.batch_queries import (
    expired_on_hand_q,
    near_expiry_q,
)


def _batch_base_qs():
    return InventoryBatch.objects.select_related('product', 'supplier')


def get_expired_batches(days_threshold=0):
    """
    Get all expired batches that still have remaining pieces.

    Includes both status=active (not yet flipped) and status=expired.
    """
    qs = _batch_base_qs().filter(expired_on_hand_q())
    if days_threshold:
        cutoff = timezone.localdate() - timedelta(days=days_threshold)
        qs = qs.filter(expire_date__lt=cutoff)
    return qs.order_by('expire_date')


def get_near_expiry_batches(days_threshold=30):
    """Get batches expiring soon (not yet expired) with remaining pieces."""
    return (
        _batch_base_qs()
        .filter(near_expiry_q(days_threshold))
        .order_by('expire_date')
    )


def mark_expired_batches():
    """
    Mark all expired on-hand batches as status=expired.

    Returns:
        Number of batches marked as expired
    """
    expired = get_expired_batches().filter(status=InventoryBatch.STATUS_ACTIVE)
    count = expired.count()
    expired.update(status=InventoryBatch.STATUS_EXPIRED)
    return count


def create_expiry_adjustment(batch, reason="Auto-expired"):
    """
    Create a stock adjustment for an expired batch.

    Records the expiration as an adjustment and zeroes remaining quantity.
    StockAdjustment.save() handles batch update and legacy Stock sync.
    """
    adjustment = StockAdjustment(
        inventory_batch=batch,
        adjustment_type=StockAdjustment.ADJUSTMENT_TYPE_EXPIRED,
        quantity_before=batch.remaining_pieces,
        quantity_after=0,
        quantity_change=-batch.remaining_pieces,
        reason=reason,
        adjusted_by=None,
    )
    adjustment.save()  # StockAdjustment.save() updates batch + legacy Stock
    return adjustment


def process_expired_batches(auto_adjust=False):
    """
    Process all expired batches that still have remaining pieces.

    Args:
        auto_adjust: If True, create adjustments that zero remaining qty

    Returns:
        Dictionary with processing statistics
    """
    expired_batches = list(get_expired_batches())

    stats = {
        'total_expired': len(expired_batches),
        'total_pieces': 0,
        'adjustments_created': 0,
    }

    for batch in expired_batches:
        stats['total_pieces'] += batch.remaining_pieces or 0

        if auto_adjust and batch.remaining_pieces > 0:
            create_expiry_adjustment(batch)
            stats['adjustments_created'] += 1
        elif batch.status != InventoryBatch.STATUS_EXPIRED:
            batch.status = InventoryBatch.STATUS_EXPIRED
            batch.save(update_fields=['status'])

    return stats


def get_expiry_report(days_ahead=90):
    """
    Generate a comprehensive expiry report for on-hand lots with expire dates.
    """
    today = timezone.localdate()

    batches_with_expiry = _batch_base_qs().filter(
        expire_date__isnull=False,
        remaining_pieces__gt=0,
        status__in=[InventoryBatch.STATUS_ACTIVE, InventoryBatch.STATUS_EXPIRED],
    )

    already_expired = []
    near_expiry_7 = []
    near_expiry_30 = []
    near_expiry_90 = []
    future = []

    for batch in batches_with_expiry:
        days_until = (batch.expire_date - today).days

        if days_until < 0:
            already_expired.append(batch)
        elif days_until <= 7:
            near_expiry_7.append(batch)
        elif days_until <= 30:
            near_expiry_30.append(batch)
        elif days_until <= 90:
            near_expiry_90.append(batch)
        else:
            future.append(batch)

    return {
        'summary': {
            'already_expired_count': len(already_expired),
            'already_expired_pieces': sum(b.remaining_pieces for b in already_expired),
            'near_7_days_count': len(near_expiry_7),
            'near_7_days_pieces': sum(b.remaining_pieces for b in near_expiry_7),
            'near_30_days_count': len(near_expiry_30),
            'near_30_days_pieces': sum(b.remaining_pieces for b in near_expiry_30),
            'near_90_days_count': len(near_expiry_90),
            'near_90_days_pieces': sum(b.remaining_pieces for b in near_expiry_90),
        },
        'batches': {
            'already_expired': already_expired,
            'near_7_days': near_expiry_7,
            'near_30_days': near_expiry_30,
            'near_90_days': near_expiry_90,
            'future': future,
        },
    }
