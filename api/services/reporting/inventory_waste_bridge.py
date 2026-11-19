"""Compare waste and stock-count movements with saved inventory postings."""
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
MOVEMENTS = {
    'bottle_damage': 'stockbottledamage',
    'liquid_salvage_to_tank': 'stockbottledamage',
    'tank_leak': 'storagetankleak',
    'stock_adjustment': 'stockadjustment',
}


def inventory_waste_bridge(scope):
    if scope.start_date is not None or scope.currency is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'AFN waste inventory comparison supports only end_date.'})

    events = inventory_movement_review(ReportScope(end_date=scope.end_date))['events']
    sources = defaultdict(lambda: {'gross_out': ZERO, 'salvage_in': ZERO, 'adjustment_change': ZERO,
                                   'unknown': 0, 'event_count': 0, 'event_ids': set(), 'issues': set()})
    for event in events:
        model = MOVEMENTS.get(event['movement'])
        if model is None:
            continue
        row = sources[(model, event['source_id'])]
        row['event_count'] += 1
        row['event_ids'].add(event['event_id'])
        row['issues'].update(event['issues'])
        if event['value_afn'] is None:
            row['unknown'] += 1
            continue
        value = Decimal(event['value_afn'])
        if event['movement'] == 'liquid_salvage_to_tank':
            row['salvage_in'] += value
        elif event['movement'] == 'stock_adjustment':
            row['adjustment_change'] += value if event['direction'] == 'in' else -value
        else:
            row['gross_out'] += value

    types = dict(ContentType.objects.filter(app_label='api', model__in=set(MOVEMENTS.values()))
                 .values_list('model', 'pk'))
    by_type = {pk: model for model, pk in types.items()}
    lines = JournalLine.objects.filter(journal_entry__deleted_at__isnull=True,
        journal_entry__content_type_id__in=by_type, gl_account__code='1100')
    if scope.end_date is not None:
        lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
    postings = defaultdict(lambda: {'change': ZERO, 'unknown': 0, 'count': 0, 'journal_ids': set()})
    orphan_journals = set()
    orphan_line_count = 0
    for line in lines.select_related('journal_entry').iterator(chunk_size=1000):
        entry = line.journal_entry
        key = (by_type[entry.content_type_id], entry.object_id)
        if key not in sources:
            orphan_line_count += 1
            orphan_journals.add(entry.pk)
            continue
        row = postings[key]
        row['count'] += 1
        row['journal_ids'].add(entry.pk)
        if (line.base_debit is None or line.base_credit is None or line.needs_rate_review
                or line.exchange_rate is None or line.exchange_rate <= 0
                or (line.currency == 1 and line.exchange_rate != 1)):
            row['unknown'] += 1
        else:
            row['change'] += line.base_debit - line.base_credit

    rows = []
    for key, source in sorted(sources.items()):
        gl = postings[key]
        expected = (source['salvage_in'] - source['gross_out'] + source['adjustment_change']
                    if not source['unknown'] else None)
        recorded = gl['change'] if not gl['unknown'] else None
        difference = (expected.quantize(CENT, rounding=ROUND_HALF_UP) - recorded
                      if expected is not None and recorded is not None else None)
        issues = set(source['issues'])
        if not gl['count'] and expected is not None and expected != ZERO:
            issues.add('missing_inventory_posting')
        if gl['unknown']:
            issues.add('unknown_inventory_gl_base')
        if difference is not None and difference != ZERO:
            issues.add('inventory_cost_posting_mismatch')
        rows.append({
            'source_model': key[0], 'source_id': key[1],
            'gross_out_afn': string4(source['gross_out']) if not source['unknown'] else None,
            'salvage_in_afn': string4(source['salvage_in']) if not source['unknown'] else None,
            'expected_inventory_change_afn': string4(expected) if expected is not None else None,
            'inventory_gl_change_afn': money(recorded), 'difference_afn': money(difference),
            'event_count': source['event_count'], 'event_ids': sorted(source['event_ids']),
            'unknown_event_count': source['unknown'], 'unknown_base_count': gl['unknown'],
            'inventory_line_count': gl['count'], 'journal_ids': sorted(gl['journal_ids']),
            'issues': sorted(issues),
        })
    return {
        'meta': {**scope.metadata(), 'report': 'inventory_waste_bridge',
                 'source': 'waste_adjustment_inventory_events_and_journal_lines', 'currency_id': 1},
        'status': 'comparison_only', 'rows': rows,
        'orphan_inventory_line_count': orphan_line_count,
        'orphan_journal_ids': sorted(orphan_journals),
        'limitations': [
            'Bottle damage removes finished stock and salvaged liquid enters the tank once; only their net change is compared with 1100.',
            'Tank leaks and non-transfer batch adjustments are compared with their own 1100 postings; transfer adjustments are excluded.',
            'Missing source costs or saved GL base amounts make the affected comparison null, not zero.',
            'Legacy foreign-currency batch adjustment costs have no trusted AFN snapshot and remain unknown.',
            'This comparison does not certify opening stock, production, packing, stock transfers or total inventory value.',
        ],
    }
