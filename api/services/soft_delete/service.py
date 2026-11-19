from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from api.services.soft_delete.registry import TRASH_REGISTRY, TRASH_RETENTION_DAYS, get_registry_entry


def _display_label(entry, obj):
    try:
        return entry['display'](obj) or f'{entry["label"]} #{obj.pk}'
    except Exception:
        return f'{entry["label"]} #{obj.pk}'


def _filter_by_date_range(qs, date_field, start_date, end_date):
    """Filter queryset by date range."""
    if start_date:
        qs = qs.filter(**{f'{date_field}__gte': start_date})
    if end_date:
        qs = qs.filter(**{f'{date_field}__lte': end_date})
    return qs


def list_trash_items(user, *, query_params=None, model_key=None, search=''):
    rows = []
    keys = [model_key] if model_key else list(TRASH_REGISTRY.keys())
    now = timezone.now()

    for key in keys:
        entry = get_registry_entry(key)
        if not entry:
            continue
        model = entry['model_class']
        if not hasattr(model, 'all_objects'):
            continue
        qs = model.all_objects.filter(deleted_at__isnull=False)
        if search:
            # Best-effort label search in Python for mixed models
            pass
        for obj in qs.order_by('-deleted_at')[:500]:
            label = _display_label(entry, obj)
            if search and search.lower() not in label.lower():
                continue
            purge_at = obj.deleted_at + timedelta(days=TRASH_RETENTION_DAYS)
            rows.append({
                'id': obj.pk,
                'model': key,
                'model_label': entry['label'],
                'label': label,
                'deleted_at': obj.deleted_at,
                'deleted_by': obj.deleted_by_id,
                'deleted_by_name': getattr(obj.deleted_by, 'username', None) if obj.deleted_by_id else None,
                'purge_at': purge_at,
                'days_until_purge': max(0, (purge_at.date() - now.date()).days),
            })

    rows.sort(key=lambda r: r['deleted_at'], reverse=True)
    return rows


def _get_trashed_object(entry, obj_id, user, query_params=None):
    model = entry['model_class']
    try:
        obj = model.all_objects.get(pk=obj_id, deleted_at__isnull=False)
    except model.DoesNotExist as exc:
        raise NotFound('Item not found in trash.') from exc

    scoped = model.all_objects.filter(pk=obj.pk, deleted_at__isnull=False)
    if not scoped.exists():
        raise NotFound('Item not found in trash.')
    return obj


def restore_trash_item(model_key, obj_id, user, *, query_params=None):
    entry = get_registry_entry(model_key)
    if not entry:
        raise ValidationError({'model': 'Unknown trash type.'})
    obj = _get_trashed_object(entry, obj_id, user, query_params=query_params)
    obj.restore()
    return {'model': model_key, 'id': obj.pk, 'restored': True}


def permanent_delete_trash_item(model_key, obj_id, user, *, query_params=None, system=False):
    from api.services.soft_delete import handlers

    entry = get_registry_entry(model_key)
    if not entry:
        raise ValidationError({'model': 'Unknown trash type.'})
    model = entry['model_class']
    if system:
        try:
            obj = model.all_objects.get(pk=obj_id, deleted_at__isnull=False)
        except model.DoesNotExist as exc:
            raise NotFound('Item not found in trash.') from exc
    else:
        obj = _get_trashed_object(
            entry, obj_id, user, query_params=query_params)
    handler_key = entry.get('hard_delete')
    if handler_key:
        handlers.run_hard_delete(handler_key, obj)
    else:
        with transaction.atomic():
            obj.delete()
    return {'model': model_key, 'id': obj_id, 'deleted': True}


def purge_expired_trash(*, dry_run=False):
    cutoff = timezone.now() - timedelta(days=TRASH_RETENTION_DAYS)
    purged = []
    for key in TRASH_REGISTRY:
        entry = get_registry_entry(key)
        model = entry['model_class']
        if not hasattr(model, 'all_objects'):
            continue
        qs = model.all_objects.filter(
            deleted_at__isnull=False, deleted_at__lt=cutoff)
        for obj in qs.iterator():
            purged.append({'model': key, 'id': obj.pk})
            if not dry_run:
                permanent_delete_trash_item(
                    key, obj.pk, user=None, system=True)
    return purged
