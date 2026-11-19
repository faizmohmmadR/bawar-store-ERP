from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import PermissionDenied, ValidationError

from api.models.data.attachment import AttachedDocument, MAX_DOCUMENT_BYTES
from api.models.data.payment import Payment
from api.models.data.sales import Sales

OWNER_MODELS = {
    'payment': Payment,
    'sale': Sales,
    'sales': Sales,
}


def resolve_owner(owner_type: str, object_id):
    model = OWNER_MODELS.get((owner_type or '').strip().lower())
    if not model:
        raise ValidationError({'owner_type': 'Must be "payment" or "sale".'})
    try:
        object_id = int(object_id)
    except (TypeError, ValueError):
        raise ValidationError({'object_id': 'A valid id is required.'})
    owner = model.objects.filter(pk=object_id).first()
    if not owner:
        raise ValidationError({'object_id': 'Related record not found.'})
    return owner


def assert_order_accessible(user, owner):
    """Orders are accessible when the user can view the parent module."""
    return


def assert_owner_accessible(user, owner):
    if isinstance(owner, Sales):
        assert_order_accessible(user, owner)
        return
    if isinstance(owner, Payment):
        order = owner.content_object
        if order is not None:
            assert_order_accessible(user, order)
            return


def assert_can_write_owner(user, owner):
    assert_owner_accessible(user, owner)
    if getattr(user, 'is_hq', False) or getattr(user, 'is_superuser', False):
        return
    if isinstance(owner, Payment):
        if (
            user.has_permission('add_payments')
            or user.has_permission('edit_payments')
            or user.has_permission('add_sale_payments')
            or user.has_permission('edit_sale_payments')
        ):
            return
        raise PermissionDenied('You cannot attach documents to this payment.')
    if isinstance(owner, Sales):
        if user.has_permission('add_sales') or user.has_permission('edit_sales'):
            return
        raise PermissionDenied('You cannot attach documents to this sale.')
    raise PermissionDenied('You cannot attach documents to this record.')


def documents_for(owner):
    ct = ContentType.objects.get_for_model(owner, for_concrete_model=False)
    return AttachedDocument.objects.filter(content_type=ct, object_id=owner.pk)


def _party_name_from_order(order):
    if order is None:
        return ''
    customer = getattr(order, 'customer', None)
    if customer is not None:
        return (getattr(customer, 'name', None) or '').strip()
    vendor = getattr(order, 'vendor', None)
    if vendor is not None:
        return (getattr(vendor, 'name', None) or '').strip()
    return ''


def document_title_base_for_owner(owner) -> str:
    """Human title from the parent payment/sale — never from the uploaded file name."""
    if isinstance(owner, Payment):
        order = owner.content_object
        invoice = ''
        if order is not None:
            invoice = (getattr(order, 'invoice_number', None) or '').strip()
            if not invoice and getattr(order, 'pk', None):
                invoice = f'#{order.pk}'
        party = _party_name_from_order(order)
        if owner.payment_type == 'sale':
            label = 'Sale Payment'
        elif owner.payment_type == 'purchase':
            label = 'Purchase Payment'
        else:
            label = 'Payment'
        if invoice and party:
            return f'{label} {invoice} — {party}'
        if invoice:
            return f'{label} {invoice}'
        if party:
            return f'{label} — {party}'
        return f'{label} #{owner.pk}' if owner.pk else label

    if isinstance(owner, Sales):
        invoice = (owner.invoice_number or '').strip()
        customer = _party_name_from_order(owner)
        if invoice and customer:
            return f'Sale {invoice} — {customer}'
        if invoice:
            return f'Sale {invoice}'
        if customer:
            return f'Sale — {customer}'
        return f'Sale #{owner.pk}' if owner.pk else 'Sale'

    return 'Document'


def _looks_like_filename(value: str) -> bool:
    lower = value.strip().lower()
    if '/' in lower or '\\' in lower:
        return True
    return lower.endswith(('.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.doc', '.docx'))


def unique_document_title(owner, preferred=None, exclude_id=None):
    """
    Return a unique title for this owner.
    Uses preferred when it is a real custom title; otherwise builds from the record.
    """
    base = (preferred or '').strip()
    record_base = document_title_base_for_owner(owner)
    if not base or base.lower() in {'document', 'untitled', 'file'} or _looks_like_filename(base):
        base = record_base
    base = base[:255]
    existing = documents_for(owner)
    if exclude_id:
        existing = existing.exclude(pk=exclude_id)
    used = {t.strip().lower() for t in existing.values_list('title', flat=True) if t}
    if base.lower() not in used:
        return base
    n = 2
    while f'{base} ({n})'.lower() in used:
        n += 1
    return f'{base} ({n})'[:255]


def serialize_document(doc, request=None):
    url = None
    if doc.file:
        try:
            url = doc.file.url
            if request:
                url = request.build_absolute_uri(url)
        except ValueError:
            url = None
    return {
        'id': doc.id,
        'title': doc.title,
        'original_name': doc.original_name,
        'file_url': url,
        'file_size': doc.file_size,
        'content_kind': doc.content_kind,
        'created_at': doc.created_at.isoformat() if doc.created_at else None,
    }


def validate_document_file(uploaded):
    if not uploaded:
        raise ValidationError({'file': 'A file is required.'})
    size = getattr(uploaded, 'size', 0) or 0
    if size > MAX_DOCUMENT_BYTES:
        raise ValidationError({'file': 'File is too large. Maximum size is 10 MB.'})
    name = (getattr(uploaded, 'name', '') or '').lower()
    if not name.endswith(('.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif')):
        raise ValidationError({'file': 'Only PDF and image files (JPG, PNG, WebP, GIF) are allowed.'})
    return uploaded
