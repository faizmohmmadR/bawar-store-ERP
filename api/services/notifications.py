"""In-app stock alert notifications (expiry + low/out of stock).

Canonical creation path for Notification rows. Used by API actions and the
scan_stock_alerts management command.
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.notification import Notification
from api.models.data.stock import Stock
from api.services.stock_expiry import get_expiry_report, mark_expired_batches

D = Decimal
DEFAULT_NEAR_DAYS = 30
DEFAULT_LOW_STOCK_THRESHOLD = 100


def _quantize(value) -> str:
    return str(D(str(value or 0)).quantize(D('0.01')))


def _batch_purchase_label(batch: InventoryBatch) -> str:
    if batch.supplier_id and getattr(batch, 'supplier', None):
        return f'Supplier {batch.supplier.name}'
    return 'Stock batch'


def _ensure_unread(
    *,
    notification_type: str,
    obj,
    title: str,
    message: str,
) -> tuple[Notification, bool]:
    """Create or refresh an unread notification for a linked object.

    Returns (notification, created).
    """
    ct = ContentType.objects.get_for_model(obj)
    existing = (
        Notification.objects.filter(
            notification_type=notification_type,
            content_type=ct,
            object_id=obj.pk,
            is_read=False,
        )
        .order_by('-id')
        .first()
    )
    if existing:
        changed = False
        if existing.title != title:
            existing.title = title
            changed = True
        if existing.message != message:
            existing.message = message
            changed = True
        if changed:
            existing.save(update_fields=['title', 'message', 'updated_at'])
        return existing, False

    note = Notification.objects.create(
        title=title,
        message=message,
        notification_type=notification_type,
        content_type=ct,
        object_id=obj.pk,
    )
    return note, True


def _resolve_stale_expiry_notifications() -> int:
    """Mark unread expiry alerts read when the lot is gone or no longer near expiry."""
    ct = ContentType.objects.get_for_model(InventoryBatch)
    unread = Notification.objects.filter(
        notification_type='stock_expiry',
        is_read=False,
        content_type=ct,
    ).select_related()
    today = timezone.localdate()
    resolved = 0
    for note in unread.iterator():
        batch = (
            InventoryBatch.objects.filter(pk=note.object_id)
            .only('id', 'remaining_pieces', 'expire_date', 'status')
            .first()
        )
        if not batch:
            note.is_read = True
            note.save(update_fields=['is_read', 'updated_at'])
            resolved += 1
            continue
        remaining = D(str(batch.remaining_pieces or 0))
        if remaining <= 0 or batch.status == InventoryBatch.STATUS_EMPTY:
            note.is_read = True
            note.save(update_fields=['is_read', 'updated_at'])
            resolved += 1
            continue
        if batch.expire_date and (batch.expire_date - today).days > DEFAULT_NEAR_DAYS:
            note.is_read = True
            note.save(update_fields=['is_read', 'updated_at'])
            resolved += 1
    return resolved


def _resolve_stale_low_stock_notifications(*, threshold: int) -> int:
    ct = ContentType.objects.get_for_model(Stock)
    unread = Notification.objects.filter(
        notification_type='low_stock',
        is_read=False,
        content_type=ct,
    )
    resolved = 0
    for note in unread.iterator():
        stock = Stock.objects.filter(pk=note.object_id).only('id', 'piece_amount').first()
        if not stock:
            note.is_read = True
            note.save(update_fields=['is_read', 'updated_at'])
            resolved += 1
            continue
        qty = D(str(stock.piece_amount or 0))
        if qty > D(threshold):
            note.is_read = True
            note.save(update_fields=['is_read', 'updated_at'])
            resolved += 1
    return resolved


def scan_stock_alerts(
    *,
    days_ahead: int = DEFAULT_NEAR_DAYS,
    low_stock_threshold: int = DEFAULT_LOW_STOCK_THRESHOLD,
    include_low_stock: bool = True,
    mark_expired: bool = True,
) -> dict:
    """Scan inventory and upsert unread stock_expiry / low_stock notifications."""
    days_ahead = max(1, int(days_ahead or DEFAULT_NEAR_DAYS))
    low_stock_threshold = max(0, int(low_stock_threshold or 0))

    if mark_expired:
        mark_expired_batches()

    report = get_expiry_report(days_ahead=max(days_ahead, 90))
    created: list[Notification] = []
    refreshed = 0

    # Already expired (still on hand)
    for batch in report['batches']['already_expired']:
        days_over = abs(batch.days_until_expiry or 0)
        title = f'Stock Expired: {batch.product.name}'
        message = (
            f'Batch {batch.batch_number} expired '
            f'{days_over} day{"s" if days_over != 1 else ""} ago '
            f'({batch.expire_date}). '
            f'Remaining: {_quantize(batch.remaining_pieces)} pcs. '
            f'Unit cost: {_quantize(batch.unit_cost)}. '
            f'{_batch_purchase_label(batch)}.'
        )
        note, was_created = _ensure_unread(
            notification_type='stock_expiry',
            obj=batch,
            title=title,
            message=message,
        )
        if was_created:
            created.append(note)
        else:
            refreshed += 1

    # Near expiry within configured window (7-day + 30-day buckets, clipped by days_ahead)
    near_batches: list[InventoryBatch] = []
    near_batches.extend(report['batches']['near_7_days'])
    if days_ahead > 7:
        near_batches.extend(report['batches']['near_30_days'])
    if days_ahead > 30:
        near_batches.extend(
            [b for b in report['batches']['near_90_days'] if (b.days_until_expiry or 0) <= days_ahead]
        )

    for batch in near_batches:
        days_left = batch.days_until_expiry or 0
        urgency = 'Expiring Very Soon' if days_left <= 7 else 'Expiring Soon'
        title = f'{urgency}: {batch.product.name}'
        message = (
            f'Batch {batch.batch_number} expires in {days_left} day'
            f'{"s" if days_left != 1 else ""} ({batch.expire_date}). '
            f'Remaining: {_quantize(batch.remaining_pieces)} pcs. '
            f'Unit cost: {_quantize(batch.unit_cost)}. '
            f'{_batch_purchase_label(batch)}.'
        )
        note, was_created = _ensure_unread(
            notification_type='stock_expiry',
            obj=batch,
            title=title,
            message=message,
        )
        if was_created:
            created.append(note)
        else:
            refreshed += 1

    low_created = 0
    if include_low_stock:
        stocks = (
            Stock.objects.select_related('product')
            .filter(
                piece_amount__lte=low_stock_threshold,
                condition=Stock.CONDITION_GOOD,
            )
        )
        for stock in stocks.iterator():
            qty = D(str(stock.piece_amount or 0))
            product_name = stock.product.name if stock.product_id else f'Stock #{stock.pk}'
            if qty <= 0:
                title = f'Out of Stock: {product_name}'
                message = (
                    f'{product_name} has 0 pieces on hand.'
                )
            else:
                title = f'Low Stock: {product_name}'
                message = (
                    f'{product_name} is low: {_quantize(qty)} pcs remaining'
                    f' (threshold {low_stock_threshold}).'
                )
            note, was_created = _ensure_unread(
                notification_type='low_stock',
                obj=stock,
                title=title,
                message=message,
            )
            if was_created:
                created.append(note)
                low_created += 1
            else:
                refreshed += 1

    resolved_expiry = _resolve_stale_expiry_notifications()
    resolved_low = (
        _resolve_stale_low_stock_notifications(threshold=low_stock_threshold)
        if include_low_stock
        else 0
    )

    return {
        'created': len(created),
        'refreshed': refreshed,
        'resolved': resolved_expiry + resolved_low,
        'low_stock_created': low_created,
        'expiry_created': len(created) - low_created,
        'notifications': created,
        'summary': report.get('summary') or {},
    }
