"""Trace expenses by category and reconcile each paid document with its GL legs."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.currency import CURRENCY_DEFINITIONS
from api.models.data.equipment import Equipment
from api.models.data.expenses import Expense
from api.models.data.journal import JournalLine
from api.utils.date_filters import apply_date_range
from .contracts import money

ZERO = Decimal('0')
CENT = Decimal('0.01')
CASH_CODE = {'cash': '1000', 'bank': '1050', 'sarafi': '1060'}


def _cent(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def expense_activity(scope):
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Expense activity needs both expense and payment accounts.'})

    documents = apply_date_range(Expense.objects.select_related('category'), 'expense_date',
                                 scope.start_date, scope.end_date)
    if scope.currency is not None:
        documents = documents.filter(currency=scope.currency)
    ct = ContentType.objects.filter(app_label='api', model='expense').values_list('pk', flat=True).first()
    lines = (JournalLine.objects.filter(journal_entry__content_type_id=ct,
                                        journal_entry__object_id__in=documents.values('pk'),
                                        journal_entry__deleted_at__isnull=True,
                                        deleted_at__isnull=True,
                                        gl_account__deleted_at__isnull=True)
             .select_related('gl_account', 'journal_entry') if ct else JournalLine.objects.none())
    by_source = defaultdict(list)
    for line in lines.iterator(chunk_size=1000):
        by_source[line.journal_entry.object_id].append(line)
    equipment_by_expense = dict(Equipment.objects.filter(expense_id__in=documents.values('pk'))
                                .values_list('expense_id', 'pk'))
    rows = []
    summaries = defaultdict(lambda: {'recorded': ZERO, 'matched': ZERO, 'matched_base': ZERO,
                                     'count': 0, 'matched_count': 0, 'review_count': 0})
    for doc in documents.iterator(chunk_size=1000):
        errors = []
        expected_cash = CASH_CODE.get(doc.payment_method)
        expected_base = None
        if doc.amount <= ZERO:
            errors.append('nonpositive_expense_amount')
        if expected_cash is None:
            errors.append('invalid_payment_method')
        if doc.exchange_rate is None or doc.exchange_rate <= ZERO or (doc.currency == 1 and doc.exchange_rate != 1):
            errors.append('invalid_historical_rate')
        else:
            expected_base = _cent(doc.amount * doc.exchange_rate)
            if doc.amount_base != expected_base:
                errors.append('source_base_amount_mismatch')
        own_lines = by_source[doc.pk]
        if not own_lines:
            errors.append('missing_expense_posting')
        elif len(own_lines) != 2 or len({line.journal_entry_id for line in own_lines}) != 1:
            errors.append('unexpected_expense_posting_lines')
        roles = defaultdict(list)
        for line in own_lines:
            if line.gl_account.code == '5000' and line.gl_account.category == 'expense':
                role = 'expense'
            elif line.gl_account.code == expected_cash and line.gl_account.category == 'asset':
                role = 'cash'
            else:
                role = 'unexpected'
            roles[role].append(line)
            if line.currency != doc.currency or line.exchange_rate != doc.exchange_rate or line.needs_rate_review:
                errors.append('line_currency_or_rate_mismatch')
            if line.base_debit is None or line.base_credit is None:
                errors.append('unknown_base_amount')
            if line.journal_entry.entry_date != doc.expense_date:
                errors.append('journal_date_mismatch')
        if roles['unexpected'] or len(roles['expense']) != 1 or len(roles['cash']) != 1:
            if own_lines:
                errors.append('wrong_expense_or_payment_account')
        else:
            expense_line, cash_line = roles['expense'][0], roles['cash'][0]
            if (expense_line.debit != doc.amount or expense_line.credit != ZERO
                    or cash_line.debit != ZERO or cash_line.credit != doc.amount):
                errors.append('native_amount_mismatch')
            if expected_base is not None and (expense_line.base_debit != expected_base
                    or expense_line.base_credit != ZERO or cash_line.base_debit != ZERO
                    or cash_line.base_credit != expected_base):
                errors.append('base_amount_mismatch')
        errors = sorted(set(errors))
        matched = not errors
        key = (doc.category_id, doc.category.name, doc.currency, doc.payment_method)
        group = summaries[key]
        group['recorded'] += doc.amount
        group['count'] += 1
        if matched:
            group['matched'] += doc.amount
            group['matched_base'] += expected_base
            group['matched_count'] += 1
        else:
            group['review_count'] += 1
        rows.append(dict(expense_id=doc.pk, expense_date=doc.expense_date.isoformat(),
                         category_id=doc.category_id, category_name=doc.category.name,
                         currency_id=doc.currency, payment_method=doc.payment_method,
                         amount=money(doc.amount), amount_base_afn=money(doc.amount_base),
                         equipment_id=equipment_by_expense.get(doc.pk),
                         posting_status='matched' if matched else 'review_required',
                         issues=errors, journal_ids=sorted({line.journal_entry_id for line in own_lines})))
    rows.sort(key=lambda row: (row['expense_date'], row['expense_id']))
    summary_rows = [dict(category_id=key[0], category_name=key[1], currency_id=key[2],
                         currency_code=CURRENCY_DEFINITIONS.get(key[2], {}).get('code'),
                         payment_method=key[3], recorded_amount=money(value['recorded']),
                         matched_amount=money(value['matched']), matched_base_afn=money(value['matched_base']),
                         document_count=value['count'], matched_count=value['matched_count'],
                         review_count=value['review_count'])
                    for key, value in sorted(summaries.items())]
    review_count = sum(value['review_count'] for value in summaries.values())
    return dict(meta={**scope.metadata(), 'report': 'expense_activity',
                      'source': 'expense_documents_and_journal_lines'},
                status='review_required' if review_count else 'supported_expenses_matched',
                review_count=review_count, summaries=summary_rows, rows=rows,
                limitations=[
                    'Recorded amounts include unmatched documents; matched amounts include only source documents with exact expense and cash-book legs.',
                    'Expense documents post recognition and payment together; unpaid accruals and manual GL expenses are outside this report.',
                    'Equipment linked to an Expense is shown by ID and must not be added again from the equipment table.',
                    'Owner withdrawals, payroll, production costs and depreciation have separate accounting treatment.',
                    'Matched posting checks do not certify the business purpose or historical completeness of expenses.',
                ])
