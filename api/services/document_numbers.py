"""Short, unique sequential document numbers for sales and purchases."""

from __future__ import annotations

from django.db import models, router, transaction
from django.utils import timezone

# Format: S26-0001 (sale), R26-0001 (raw material purchase)
_LEGACY_PREFIXES: dict[str, tuple[str, ...]] = {
    'S': (lambda y: f'INV-GEN-{y}-',),
    'P': (lambda y: f'PUR-{y}-',),
    'R': (lambda y: f'PUR-{y}-', lambda y: f'P{y % 100:02d}-'),
}


def _trailing_sequence(value: str) -> int | None:
    if not value or '-' not in value:
        return None
    suffix = value.rsplit('-', 1)[-1]
    return int(suffix) if suffix.isdigit() else None


def _max_sequence_for_prefixes(
    queryset: models.QuerySet,
    field: str,
    prefixes: tuple[str, ...],
) -> int:
    max_seq = 0
    for value in queryset.exclude(**{field: ''}).values_list(field, flat=True):
        normalized = str(value or '').strip().upper()
        for prefix in prefixes:
            if normalized.startswith(prefix.upper()):
                seq = _trailing_sequence(normalized)
                if seq is not None:
                    max_seq = max(max_seq, seq)
                break
    return max_seq


def next_sequential_document_number(
    *,
    prefix: str,
    model: type[models.Model],
    field: str = 'invoice_number',
    seq_width: int = 4,
    max_attempts: int = 200,
) -> str:
    """
    Allocate a short unique document number.

    Format: {prefix}{YY}-{sequence}
    Examples: S26-0001, R26-0042
    """
    if not prefix or not prefix.isalpha() or len(prefix) > 10:
        raise ValueError('prefix must contain 1 to 10 letters')

    from api.models.data.document_number_sequence import DocumentNumberSequence

    year = timezone.now().year
    head = f'{prefix}{year % 100:02d}-'
    legacy_builders = _LEGACY_PREFIXES.get(prefix, ())
    prefixes = (head, *(builder(year) for builder in legacy_builders))
    alias = router.db_for_write(model)
    # The default manager hides soft-deleted rows, but their unique numbers are
    # still occupied. The base manager includes those rows and restored history.
    documents = model._base_manager.using(alias).all()
    sequences = DocumentNumberSequence.objects.using(alias)
    key = f'{model._meta.label_lower}:{field}:{head}'
    with transaction.atomic(using=alias):
        sequences.get_or_create(key=key)
        sequence = sequences.select_for_update().get(key=key)
        # Reconcile on every reservation: backups, manual codes and imports can
        # contain numbers newer than the saved counter. Never reuse a number.
        maximum = _max_sequence_for_prefixes(documents, field, prefixes)
        sequence.last_value = max(sequence.last_value, maximum) + 1
        sequence.save(using=alias, update_fields=['last_value'])
        return f'{head}{sequence.last_value:0{seq_width}d}'


def allocate_sale_invoice_number() -> str:
    from api.models.data.sales import Sales

    return next_sequential_document_number(prefix='S', model=Sales)


def allocate_purchase_invoice_number() -> str:
    from api.models.data.purchases import Purchase

    return next_sequential_document_number(prefix='P', model=Purchase)


# Backwards-compatible alias
allocate_raw_material_purchase_invoice_number = allocate_purchase_invoice_number


def allocate_equipment_serial_number() -> str:
    """Allocate a unique equipment serial / asset label: E26-0001."""
    from api.models.data.equipment import Equipment

    return next_sequential_document_number(
        prefix='E',
        model=Equipment,
        field='serial_number',
    )


def allocate_stock_transfer_number() -> str:
    """Allocate a unique stock transfer number: T26-0001."""
    from api.models.data.stock_transfer import StockTransfer

    return next_sequential_document_number(
        prefix='T',
        model=StockTransfer,
        field='transfer_number',
    )


def allocate_batch_number(purchase_invoice: str | None = None, item_seq: int | None = None) -> str:
    """Allocate a unique batch number: B{YY}-{seq:04d}  e.g. B26-0001."""
    from api.models.data.inventory_batch import InventoryBatch

    return next_sequential_document_number(
        prefix='B',
        model=InventoryBatch,
        field='batch_number',
    )


def allocate_return_number() -> str:
    from api.models.data.returns import Return
    return next_sequential_document_number(prefix='RET', model=Return, field='return_number')


