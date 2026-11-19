"""Native supplier bill versus trade-linked accounts-payable bridge."""
from collections import defaultdict
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.journal import JournalLine
from api.models.data.payment import Payment
from .contracts import ReportScope
from .invoices import string4
from .vendors import vendor_invoice_balances

ZERO = Decimal('0')


def vendor_ap_bridge(scope):
    if scope.start_date is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'A cumulative supplier payable bridge supports only end_date and currency.'})

    bills = vendor_invoice_balances(ReportScope(end_date=scope.end_date, currency=scope.currency))
    purchase_ids = {row['purchase_id'] for row in bills['rows']}
    types = dict(ContentType.objects.filter(app_label='api', model__in=['rawmaterialpurchase', 'payment'])
                 .values_list('model', 'pk'))
    lines = JournalLine.objects.filter(
        journal_entry__deleted_at__isnull=True, gl_account__code='2000',
    )
    if scope.end_date is not None:
        lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
    if scope.currency is not None:
        lines = lines.filter(currency=scope.currency)
    payment_ids = set(lines.filter(journal_entry__content_type_id=types.get('payment'))
                      .values_list('journal_entry__object_id', flat=True))
    trade_payments = set(Payment.objects.filter(
        pk__in=payment_ids, payment_type='purchase', is_advance=False,
        content_type_id=types.get('rawmaterialpurchase'), object_id__in=purchase_ids,
    ).values_list('pk', flat=True))

    grouped = defaultdict(lambda: {'document': ZERO, 'unused_credit': ZERO,
                                   'trade_gl': ZERO, 'other_gl': ZERO,
                                   'invoice_issue_count': 0, 'trade_line_count': 0,
                                   'other_line_count': 0, 'account_ids': set(),
                                   'other_journal_ids': set()})
    for bill in bills['rows']:
        grouped[bill['currency_id']]['document'] += Decimal(bill['closing_balance'])
    for party in bills['parties']:
        row = grouped[party['currency_id']]
        row['unused_credit'] += Decimal(party['unused_credit'])
        row['invoice_issue_count'] += party['issue_count']
    for line in lines.select_related('journal_entry').iterator(chunk_size=1000):
        row = grouped[line.currency]
        row['account_ids'].add(line.gl_account_id)
        entry = line.journal_entry
        linked = (
            entry.content_type_id == types.get('rawmaterialpurchase') and entry.object_id in purchase_ids
            or entry.content_type_id == types.get('payment') and entry.object_id in trade_payments
        )
        row['trade_gl' if linked else 'other_gl'] += line.credit - line.debit
        row['trade_line_count' if linked else 'other_line_count'] += 1
        if not linked:
            row['other_journal_ids'].add(entry.pk)

    rows = []
    for currency_id, row in sorted(grouped.items()):
        total_gl = row['trade_gl'] + row['other_gl']
        rows.append({
            'currency_id': currency_id,
            'bill_balance': string4(row['document']),
            'unused_supplier_credit': string4(row['unused_credit']),
            'trade_gl_balance': string4(row['trade_gl']),
            'trade_difference': string4(row['document'] - row['trade_gl']),
            'other_gl_balance': string4(row['other_gl']),
            'total_gl_balance': string4(total_gl),
            'total_difference': string4(row['document'] - total_gl),
            'invoice_issue_count': row['invoice_issue_count'],
            'trade_line_count': row['trade_line_count'],
            'other_line_count': row['other_line_count'],
            'account_ids': sorted(row['account_ids']),
            'other_journal_ids': sorted(row['other_journal_ids']),
        })
    return {
        'meta': {**scope.metadata(), 'report': 'vendor_ap_bridge',
                 'source': 'supplier_bills_and_journal_lines', 'amount_scale': 4,
                 'sign_convention': 'credit_minus_debit'},
        'status': 'comparison_only', 'rows': rows,
        'limitations': [
            'Native amounts are compared separately by currency; AFN carrying values and FX revaluation are not included.',
            'Only received purchase and payment journal sources linked to currently eligible bills count as trade postings.',
            'Unused supplier credit belongs to a separate GL account and is displayed but not subtracted from bill/AP comparison.',
            'Loan, manual, orphaned and other postings remain in other_gl_balance; journal line has no reliable vendor identity.',
            'A zero difference does not certify bill history, source-document completeness or historical edits/deletions.',
        ],
    }
