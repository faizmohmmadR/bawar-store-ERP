"""Native customer invoice versus trade-linked accounts-receivable bridge."""
from collections import defaultdict
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.journal import JournalLine
from api.models.data.payment import Payment
from api.models.data.returns import Return
from .contracts import ReportScope
from .invoices import customer_invoice_balances, string4

ZERO = Decimal('0')


def customer_ar_bridge(scope):
    if scope.start_date is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'A cumulative customer receivable bridge supports only end_date and currency.'})

    invoices = customer_invoice_balances(ReportScope(end_date=scope.end_date, currency=scope.currency))
    sale_ids = {row['sale_id'] for row in invoices['rows']}
    types = dict(ContentType.objects.filter(app_label='api', model__in=['sales', 'payment', 'return'])
                 .values_list('model', 'pk'))
    lines = JournalLine.objects.filter(
        journal_entry__deleted_at__isnull=True, gl_account__code='1200',
    )
    if scope.end_date is not None:
        lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
    if scope.currency is not None:
        lines = lines.filter(currency=scope.currency)
    payment_ids = set(lines.filter(journal_entry__content_type_id=types.get('payment'))
                      .values_list('journal_entry__object_id', flat=True))
    return_ids = set(lines.filter(journal_entry__content_type_id=types.get('return'))
                     .values_list('journal_entry__object_id', flat=True))
    trade_payments = set(Payment.objects.filter(
        pk__in=payment_ids, payment_type='sale', is_advance=False,
        content_type_id=types.get('sales'), object_id__in=sale_ids,
    ).values_list('pk', flat=True))
    trade_returns = set(Return.objects.filter(
        pk__in=return_ids, sales_id__in=sale_ids,
    ).values_list('pk', flat=True))

    grouped = defaultdict(lambda: {'document': ZERO, 'trade_gl': ZERO, 'other_gl': ZERO,
                                   'invoice_issue_count': 0, 'trade_line_count': 0,
                                   'other_line_count': 0, 'account_ids': set(),
                                   'other_journal_ids': set()})
    for party in invoices['parties']:
        row = grouped[party['currency_id']]
        row['document'] += Decimal(party['closing_balance'])
        row['invoice_issue_count'] += party['issue_count']
    for line in lines.select_related('journal_entry').iterator(chunk_size=1000):
        row = grouped[line.currency]
        row['account_ids'].add(line.gl_account_id)
        entry = line.journal_entry
        linked = (
            entry.content_type_id == types.get('sales') and entry.object_id in sale_ids
            or entry.content_type_id == types.get('payment') and entry.object_id in trade_payments
            or entry.content_type_id == types.get('return') and entry.object_id in trade_returns
        )
        row['trade_gl' if linked else 'other_gl'] += line.debit - line.credit
        row['trade_line_count' if linked else 'other_line_count'] += 1
        if not linked:
            row['other_journal_ids'].add(entry.pk)

    rows = []
    for currency_id, row in sorted(grouped.items()):
        total_gl = row['trade_gl'] + row['other_gl']
        rows.append({
            'currency_id': currency_id,
            'invoice_balance': string4(row['document']),
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
        'meta': {**scope.metadata(), 'report': 'customer_ar_bridge',
                 'source': 'customer_invoices_and_journal_lines', 'amount_scale': 4,
                 'sign_convention': 'debit_minus_credit'},
        'status': 'comparison_only', 'rows': rows,
        'limitations': [
            'Native amounts are compared separately by currency; AFN carrying values and FX revaluation are not included.',
            'Only live sale, payment and return journal sources linked to currently eligible customer invoices count as trade postings; customer advances are a separate account.',
            'Loan, manual, orphaned and other postings remain in other_gl_balance; journal line has no reliable customer identity.',
            'A zero difference does not certify invoice history, source-document completeness or historical edits/deletions.',
        ],
    }
