"""In-app stock alert notifications (expiry + low/out of stock).

Low-stock alerts use each product's reorder_level / min_stock_level against
InventoryBalance (base units), not a global piece threshold.
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import F, Q, Sum
from django.utils import timezone

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.inventory_ledger import InventoryBalance
from api.models.data.notification import Notification
from api.models.data.products import Product
from api.models.data.stock import Stock
from api.models.data.warehouse import Warehouse
from api.services.stock_expiry import get_expiry_report, mark_expired_batches
from api.services.uom.conversion import d

DEFAULT_NEAR_DAYS = 30
# Kept for API/command backwards compatibility; ignored for per-product alerts.
DEFAULT_LOW_STOCK_THRESHOLD = 100


def _quantize(value) -> str:
    return str(d(value).quantize(Decimal('0.01')))


def _uom_label(product) -> str:
    uom = getattr(product, 'base_uom', None)
    if uom is None:
        return 'base'
    return getattr(uom, 'symbol', None) or getattr(uom, 'name', None) or 'base'


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


def _mark_unread_read(notes) -> int:
    resolved = 0
    for note in notes:
        note.is_read = True
        note.save(update_fields=['is_read', 'updated_at'])
        resolved += 1
    return resolved


def product_stock_alert_state(product, qty) -> str | None:
    """Return 'out' | 'critical' | 'low' | None for on-hand qty in base units."""
    if product is None or not getattr(product, 'track_inventory', True):
        return None

    on_hand = d(qty)
    reorder = d(getattr(product, 'reorder_level', 0) or 0)
    minimum = d(getattr(product, 'min_stock_level', 0) or 0)

    if reorder <= 0 and minimum <= 0:
        return None

    if on_hand <= 0:
        return 'out'
    if minimum > 0 and on_hand <= minimum:
        return 'critical'
    if reorder > 0 and on_hand <= reorder:
        return 'low'
    return None


def _warehouse_on_hand(product_id, warehouse_id) -> Decimal:
    total = (
        InventoryBalance.objects.filter(
            product_id=product_id,
            warehouse_id=warehouse_id,
        ).aggregate(total=Sum('quantity_on_hand'))['total']
    )
    return d(total or 0)


def _alert_anchor_balance(product_id, warehouse_id):
    """Stable InventoryBalance row used as the notification link target."""
    return (
        InventoryBalance.objects.filter(
            product_id=product_id,
            warehouse_id=warehouse_id,
            lot__isnull=True,
        ).order_by('id').first()
        or InventoryBalance.objects.filter(
            product_id=product_id,
            warehouse_id=warehouse_id,
        ).order_by('id').first()
    )


def _low_stock_message(product, warehouse, qty, state: str) -> tuple[str, str]:
    name = getattr(product, 'name', None) or f'Product #{getattr(product, "pk", "?")}'
    wh_name = getattr(warehouse, 'name', None) or f'Warehouse #{getattr(warehouse, "pk", "?")}'
    unit = _uom_label(product)
    qty_label = _quantize(qty)
    reorder = _quantize(getattr(product, 'reorder_level', 0) or 0)
    minimum = _quantize(getattr(product, 'min_stock_level', 0) or 0)

    if state == 'out':
        return (
            f'Out of Stock: {name}',
            f'{name} has 0 {unit} on hand in {wh_name}. Reorder level: {reorder} {unit}.',
        )
    if state == 'critical':
        return (
            f'Critical Stock: {name}',
            (
                f'{name} is critically low in {wh_name}: {qty_label} {unit} on hand '
                f'(min {minimum} {unit}, reorder {reorder} {unit}).'
            ),
        )
    return (
        f'Low Stock: {name}',
        (
            f'{name} is below reorder level in {wh_name}: {qty_label} {unit} on hand '
            f'(reorder at {reorder} {unit}).'
        ),
    )


def sync_balance_stock_alert(balance: InventoryBalance | None = None, *, product=None, warehouse=None):
    """Create/refresh or clear the low-stock notification for one product+warehouse.

    Prefer calling with the balance that just moved; product/warehouse are used
    when aggregating or during scans.
    """
    if balance is not None:
        product = product or balance.product
        warehouse = warehouse or balance.warehouse
        product_id = balance.product_id
        warehouse_id = balance.warehouse_id
    else:
        if product is None or warehouse is None:
            return None, False
        product_id = product.pk
        warehouse_id = warehouse.pk

    if product is None or not getattr(product, 'track_inventory', True):
        return None, False

    qty = _warehouse_on_hand(product_id, warehouse_id)
    state = product_stock_alert_state(product, qty)
    anchor = balance if (balance is not None and balance.lot_id is None) else _alert_anchor_balance(
        product_id, warehouse_id,
    )
    if anchor is None:
        return None, False

    ct = ContentType.objects.get_for_model(InventoryBalance)
    unread = list(
        Notification.objects.filter(
            notification_type='low_stock',
            content_type=ct,
            object_id=anchor.pk,
            is_read=False,
        )
    )

    if state is None:
        _mark_unread_read(unread)
        return None, False

    title, message = _low_stock_message(product, warehouse, qty, state)
    return _ensure_unread(
        notification_type='low_stock',
        obj=anchor,
        title=title,
        message=message,
    )


def _resolve_stale_expiry_notifications() -> int:
    """Mark unread expiry alerts read when the lot is gone or no longer near expiry."""
    ct = ContentType.objects.get_for_model(InventoryBatch)
    unread = Notification.objects.filter(
        notification_type='stock_expiry',
        is_read=False,
        content_type=ct,
    )
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
        remaining = d(batch.remaining_pieces or 0)
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


def _resolve_legacy_stock_low_notifications() -> int:
    """Clear unread low-stock alerts still linked to the legacy Stock model."""
    ct = ContentType.objects.get_for_model(Stock)
    unread = Notification.objects.filter(
        notification_type='low_stock',
        is_read=False,
        content_type=ct,
    )
    return _mark_unread_read(list(unread.iterator()))


def _resolve_stale_low_stock_notifications() -> int:
    """Mark InventoryBalance low-stock alerts read when stock is healthy again."""
    ct = ContentType.objects.get_for_model(InventoryBalance)
    unread = Notification.objects.filter(
        notification_type='low_stock',
        is_read=False,
        content_type=ct,
    ).select_related()
    resolved = 0
    for note in unread.iterator():
        balance = (
            InventoryBalance.objects.select_related('product', 'warehouse')
            .filter(pk=note.object_id)
            .first()
        )
        if not balance:
            note.is_read = True
            note.save(update_fields=['is_read', 'updated_at'])
            resolved += 1
            continue
        qty = _warehouse_on_hand(balance.product_id, balance.warehouse_id)
        if product_stock_alert_state(balance.product, qty) is None:
            note.is_read = True
            note.save(update_fields=['is_read', 'updated_at'])
            resolved += 1
    return resolved


def low_stock_balance_queryset():
    """Balances that should appear on the low-stock list / feed alerts."""
    return (
        InventoryBalance.objects.select_related('product', 'warehouse', 'product__base_uom')
        .filter(product__track_inventory=True)
        .filter(Q(product__reorder_level__gt=0) | Q(product__min_stock_level__gt=0))
        .filter(
            Q(quantity_on_hand__lte=0)
            | Q(
                product__min_stock_level__gt=0,
                quantity_on_hand__lte=F('product__min_stock_level'),
            )
            | Q(
                product__reorder_level__gt=0,
                quantity_on_hand__lte=F('product__reorder_level'),
            )
        )
    )


def scan_stock_alerts(
    *,
    days_ahead: int = DEFAULT_NEAR_DAYS,
    low_stock_threshold: int = DEFAULT_LOW_STOCK_THRESHOLD,
    include_low_stock: bool = True,
    mark_expired: bool = True,
) -> dict:
    """Scan inventory and upsert unread stock_expiry / low_stock notifications."""
    del low_stock_threshold  # per-product levels replace the global threshold
    days_ahead = max(1, int(days_ahead or DEFAULT_NEAR_DAYS))

    if mark_expired:
        mark_expired_batches()

    report = get_expiry_report(days_ahead=max(days_ahead, 90))
    created: list[Notification] = []
    refreshed = 0

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
        # One evaluation per product+warehouse (sum lot rows).
        pair_rows = list(
            InventoryBalance.objects.filter(product__track_inventory=True)
            .filter(Q(product__reorder_level__gt=0) | Q(product__min_stock_level__gt=0))
            .values_list('product_id', 'warehouse_id')
            .distinct()
        )
        product_ids = {pid for pid, _ in pair_rows}
        warehouse_ids = {wid for _, wid in pair_rows}
        products = {
            p.id: p
            for p in Product.objects.filter(id__in=product_ids).select_related('base_uom')
        }
        warehouses = {
            w.id: w
            for w in Warehouse.objects.filter(id__in=warehouse_ids)
        }
        for product_id, warehouse_id in pair_rows:
            product = products.get(product_id)
            warehouse = warehouses.get(warehouse_id)
            if not product or not warehouse:
                continue
            note, was_created = sync_balance_stock_alert(product=product, warehouse=warehouse)
            if note is None:
                continue
            if was_created:
                created.append(note)
                low_created += 1
            else:
                refreshed += 1

    resolved_expiry = _resolve_stale_expiry_notifications()
    resolved_low = 0
    if include_low_stock:
        resolved_low = (
            _resolve_stale_low_stock_notifications()
            + _resolve_legacy_stock_low_notifications()
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
