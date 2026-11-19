"""Received raw-material purchase item values versus Inventory GL postings."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.journal import JournalLine
from api.models.data.raw_materials import RawMaterialPurchase, RawMaterialPurchaseItem
from .contracts import money
from .invoices import string4

ZERO = Decimal('0')
CENT = Decimal('0.01')


def _cent(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def inventory_purchase_bridge(scope):
    if scope.start_date is not None or scope.currency is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'AFN purchase capitalization is cumulative and supports only end_date.'})

    purchases = RawMaterialPurchase.objects.filter(status='received')
    if scope.end_date is not None:
        purchases = purchases.filter(purchase_date__lte=scope.end_date)
    purchases = list(purchases.order_by('purchase_date', 'pk'))
    ids = {purchase.pk for purchase in purchases}
    purchase_by_id = {purchase.pk: purchase for purchase in purchases}
    items = defaultdict(lambda: {'value': ZERO, 'count': 0})
    for item in RawMaterialPurchaseItem.objects.filter(purchase_id__in=ids).iterator(chunk_size=1000):
        items[item.purchase_id]['value'] += item.total_price_base
        items[item.purchase_id]['count'] += 1

    ct = ContentType.objects.filter(app_label='api', model='rawmaterialpurchase').values_list('pk', flat=True).first()
    gl_lines = JournalLine.objects.filter(journal_entry__deleted_at__isnull=True,
        journal_entry__content_type_id=ct, gl_account__code='1100') if ct else JournalLine.objects.none()
    if scope.end_date is not None:
        gl_lines = gl_lines.filter(journal_entry__entry_date__lte=scope.end_date)
    postings = defaultdict(lambda: {'value': ZERO, 'unknown': 0, 'wrong_currency': 0,
                                    'line_count': 0, 'journal_ids': set()})
    orphan_journals = set()
    orphan_line_count = 0
    for line in gl_lines.select_related('journal_entry').iterator(chunk_size=1000):
        source_id = line.journal_entry.object_id
        if source_id not in ids:
            orphan_line_count += 1
            orphan_journals.add(line.journal_entry_id)
            continue
        p = postings[source_id]
        p['line_count'] += 1
        p['journal_ids'].add(line.journal_entry_id)
        purchase = purchase_by_id[source_id]
        if line.currency != purchase.currency:
            p['wrong_currency'] += 1
        if (line.base_debit is None or line.base_credit is None or line.needs_rate_review
                or line.exchange_rate is None or line.exchange_rate <= 0
                or (line.currency == 1 and line.exchange_rate != 1)):
            p['unknown'] += 1
        else:
            p['value'] += line.base_debit - line.base_credit

    rows = []
    for purchase in purchases:
        item = items[purchase.pk]
        gl = postings[purchase.pk]
        item_value, header_value = item['value'], purchase.total_amount_base
        gl_value = gl['value'] if not gl['unknown'] else None
        issues = []
        if not item['count']:
            issues.append('missing_purchase_items')
        if item_value != header_value:
            issues.append('items_header_value_mismatch')
        if not gl['line_count']:
            issues.append('missing_inventory_posting')
        if gl['wrong_currency']:
            issues.append('inventory_line_currency_mismatch')
        if gl['unknown']:
            issues.append('unknown_inventory_base_value')
        if gl_value is not None and _cent(header_value) != gl_value:
            issues.append('header_inventory_gl_mismatch')
        rows.append({
            'purchase_id': purchase.pk, 'invoice_number': purchase.invoice_number,
            'purchase_date': purchase.purchase_date.isoformat(),
            'source_currency_id': purchase.currency,
            'item_count': item['count'], 'inventory_line_count': gl['line_count'],
            'item_value_afn': string4(item_value),
            'header_value_afn': string4(header_value),
            'items_header_difference_afn': string4(item_value - header_value),
            'inventory_gl_afn': money(gl_value),
            'header_gl_difference_afn': money(_cent(header_value) - gl_value) if gl_value is not None else None,
            'unknown_base_count': gl['unknown'],
            'journal_ids': sorted(gl['journal_ids']), 'issues': issues,
        })
    return {
        'meta': {**scope.metadata(), 'report': 'inventory_purchase_bridge',
                 'source': 'received_purchase_items_and_inventory_journal_lines',
                 'currency_id': 1},
        'status': 'comparison_only', 'rows': rows,
        'orphan_inventory_line_count': orphan_line_count,
        'orphan_journal_ids': sorted(orphan_journals),
        'limitations': [
            'Only received raw-material purchase capitalization is compared; this is not total stock value or the full 1100 balance.',
            'Item and header snapshots retain four AFN decimals; journal lines use cents and header comparison rounds once to cents.',
            'Unknown or invalid saved GL base values make that purchase GL amount and difference null.',
            'Inventory postings linked to non-eligible purchase documents are exposed as orphan journals, not assigned to a received bill.',
            'Historical edits/deletions, openings, production, packing, sales, returns and waste still require separate reconciliation.',
        ],
    }
