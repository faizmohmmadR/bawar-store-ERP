"""Sale and return inventory-event costs versus their saved 1100 postings."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.journal import JournalLine
from .contracts import ReportScope, money
from .inventory_movement_review import inventory_movement_review
from .invoices import string4

ZERO = Decimal('0')
CENT = Decimal('0.01')
MOVEMENT_SOURCE = {'sale_inventory_out': 'sales', 'sale_inventory_return': 'return'}


def inventory_sale_bridge(scope):
    if scope.start_date is not None or scope.currency is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'AFN sale inventory cost comparison supports only end_date.'})

    events = inventory_movement_review(ReportScope(end_date=scope.end_date))['events']
    source_rows = defaultdict(lambda: {'value': ZERO, 'unknown': 0, 'event_count': 0,
                                       'event_ids': [], 'issues': set()})
    for event in events:
        source_model = MOVEMENT_SOURCE.get(event['movement'])
        if source_model is None:
            continue
        key = (source_model, event['source_id'])
        row = source_rows[key]
        row['event_count'] += 1
        row['event_ids'].append(event['event_id'])
        row['issues'].update(event['issues'])
        if event['value_afn'] is None:
            row['unknown'] += 1
        else:
            row['value'] += Decimal(event['value_afn'])

    types = dict(ContentType.objects.filter(app_label='api', model__in=['sales', 'return'])
                 .values_list('model', 'pk'))
    by_type = {pk: model for model, pk in types.items()}
    lines = JournalLine.objects.filter(journal_entry__deleted_at__isnull=True,
        journal_entry__content_type_id__in=by_type, gl_account__code='1100')
    if scope.end_date is not None:
        lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
    postings = defaultdict(lambda: {'value': ZERO, 'unknown': 0,
                                    'line_count': 0, 'journal_ids': set()})
    orphan_journals = set()
    orphan_line_count = 0
    for line in lines.select_related('journal_entry').iterator(chunk_size=1000):
        entry = line.journal_entry
        key = (by_type[entry.content_type_id], entry.object_id)
        if key not in source_rows:
            orphan_line_count += 1
            orphan_journals.add(entry.pk)
            continue
        row = postings[key]
        row['line_count'] += 1
        row['journal_ids'].add(entry.pk)
        if (line.base_debit is None or line.base_credit is None or line.needs_rate_review
                or line.exchange_rate is None or line.exchange_rate <= 0
                or (line.currency == 1 and line.exchange_rate != 1)):
            row['unknown'] += 1
        else:
            value = line.base_credit - line.base_debit if key[0] == 'sales' else line.base_debit - line.base_credit
            row['value'] += value

    rows = []
    for key, source in sorted(source_rows.items()):
        gl = postings[key]
        expected = source['value'] if not source['unknown'] else None
        recorded = gl['value'] if not gl['unknown'] else None
        difference = (expected.quantize(CENT, rounding=ROUND_HALF_UP) - recorded
                      if expected is not None and recorded is not None else None)
        issues = set(source['issues'])
        if not gl['line_count'] and expected is not None and expected != ZERO:
            issues.add('missing_inventory_posting')
        if gl['unknown']:
            issues.add('unknown_inventory_gl_base')
        if difference is not None and difference != ZERO:
            issues.add('inventory_cost_posting_mismatch')
        rows.append({
            'source_model': key[0], 'source_id': key[1],
            'movement': 'sale_inventory_out' if key[0] == 'sales' else 'sale_inventory_return',
            'event_ids': sorted(source['event_ids']),
            'event_count': source['event_count'],
            'expected_cost_afn': string4(expected) if expected is not None else None,
            'inventory_gl_afn': money(recorded),
            'difference_afn': money(difference),
            'unknown_event_count': source['unknown'],
            'unknown_base_count': gl['unknown'],
            'inventory_line_count': gl['line_count'],
            'journal_ids': sorted(gl['journal_ids']), 'issues': sorted(issues),
        })
    return {
        'meta': {**scope.metadata(), 'report': 'inventory_sale_bridge',
                 'source': 'sale_return_inventory_events_and_journal_lines',
                 'currency_id': 1},
        'status': 'comparison_only', 'rows': rows,
        'orphan_inventory_line_count': orphan_line_count,
        'orphan_journal_ids': sorted(orphan_journals),
        'limitations': [
            'Only sale and return inventory costs are compared with 1100; this is not full stock valuation.',
            'Sale credits reduce inventory and return debits restore it; free and employee sales use the same inventory-side rule.',
            'One unknown event cost or saved GL base amount makes the affected comparison null rather than zero.',
            'Cost snapshots may be edited historically; a zero difference does not certify opening stock, production, packing or waste.',
        ],
    }
