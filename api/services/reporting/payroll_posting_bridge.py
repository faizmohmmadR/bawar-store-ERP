"""Native payroll settlement and advance postings versus their source rows."""
from collections import defaultdict
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.journal import JournalLine
from api.models.data.payroll import Payroll
from api.models.data.returns import Return
from .contracts import money

ZERO = Decimal('0')


def payroll_posting_bridge(scope):
    if scope.start_date is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'A cumulative payroll posting bridge supports only end_date and currency.'})

    payrolls = Payroll.objects.select_related('source_sale')
    if scope.end_date is not None:
        payrolls = payrolls.filter(payment_date__lte=scope.end_date)
    if scope.currency is not None:
        payrolls = payrolls.filter(currency=scope.currency)
    types = dict(ContentType.objects.filter(app_label='api', model__in=['payroll', 'sales', 'return'])
                 .values_list('model', 'pk'))
    grouped = defaultdict(lambda: {'salary_money': ZERO, 'salary_goods': ZERO,
                                   'advance_money': ZERO, 'advance_goods': ZERO,
                                   'salary_gl': ZERO, 'advance_gl': ZERO,
                                   'other_salary_gl': ZERO, 'other_advance_gl': ZERO,
                                   'source_issue_count': 0, 'salary_line_count': 0,
                                   'advance_line_count': 0, 'other_line_count': 0,
                                   'account_ids': set(), 'other_journal_ids': set()})
    salary_payroll_ids, advance_payroll_ids, goods_sale_ids = set(), set(), set()
    for payroll in payrolls.iterator(chunk_size=1000):
        row = grouped[payroll.currency]
        goods = payroll.payment_method == Payroll.PAYMENT_GOODS or bool(payroll.source_sale_id)
        salary = payroll.payroll_type == Payroll.PAYROLL_TYPE_SALARY
        amount = payroll.amount
        if amount < ZERO:
            row['source_issue_count'] += 1
        if goods:
            row['salary_goods' if salary else 'advance_goods'] += amount
            sale = payroll.source_sale
            if (not salary or payroll.payment_method != Payroll.PAYMENT_GOODS or sale is None
                    or sale.deleted_at is not None or sale.employee_id != payroll.employee_id
                    or sale.currency != payroll.currency or sale.status in ('draft', 'cancelled')
                    or sale.customer_id or sale.vendor_id or sale.is_free):
                row['source_issue_count'] += 1
            else:
                goods_sale_ids.add(sale.pk)
        elif salary:
            row['salary_money'] += amount
            salary_payroll_ids.add(payroll.pk)
        elif payroll.payroll_type == Payroll.PAYROLL_TYPE_ADVANCE:
            row['advance_money'] += amount
            advance_payroll_ids.add(payroll.pk)
        else:
            row['source_issue_count'] += 1

    lines = JournalLine.objects.filter(
        journal_entry__deleted_at__isnull=True,
        gl_account__code__in=('5100', '1300'),
    )
    if scope.end_date is not None:
        lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
    if scope.currency is not None:
        lines = lines.filter(currency=scope.currency)
    return_ids = set(lines.filter(journal_entry__content_type_id=types.get('return'))
                     .values_list('journal_entry__object_id', flat=True))
    goods_return_ids = set(Return.objects.filter(
        pk__in=return_ids, sales_id__in=goods_sale_ids,
    ).values_list('pk', flat=True))
    for line in lines.select_related('journal_entry', 'gl_account').iterator(chunk_size=1000):
        row = grouped[line.currency]
        row['account_ids'].add(line.gl_account_id)
        entry = line.journal_entry
        if line.gl_account.code == '5100':
            linked = (
                entry.content_type_id == types.get('payroll') and entry.object_id in salary_payroll_ids
                or entry.content_type_id == types.get('sales') and entry.object_id in goods_sale_ids
                or entry.content_type_id == types.get('return') and entry.object_id in goods_return_ids
            )
            bucket = 'salary_gl' if linked else 'other_salary_gl'
            if linked:
                row['salary_line_count'] += 1
        else:
            linked = entry.content_type_id == types.get('payroll') and entry.object_id in advance_payroll_ids
            bucket = 'advance_gl' if linked else 'other_advance_gl'
            if linked:
                row['advance_line_count'] += 1
        row[bucket] += line.debit - line.credit
        if not linked:
            row['other_line_count'] += 1
            row['other_journal_ids'].add(entry.pk)

    rows = []
    for currency_id, row in sorted(grouped.items()):
        salary_docs = row['salary_money'] + row['salary_goods']
        rows.append({
            'currency_id': currency_id,
            'salary_paid_money': money(row['salary_money']),
            'salary_paid_goods': money(row['salary_goods']),
            'advance_paid_money': money(row['advance_money']),
            'advance_paid_goods_review': money(row['advance_goods']),
            'salary_gl_posted': money(row['salary_gl']),
            'salary_posting_difference': money(salary_docs - row['salary_gl']),
            'advance_gl_posted': money(row['advance_gl']),
            'advance_posting_difference': money(row['advance_money'] - row['advance_gl']),
            'other_salary_gl': money(row['other_salary_gl']),
            'other_advance_gl': money(row['other_advance_gl']),
            'source_issue_count': row['source_issue_count'],
            'salary_line_count': row['salary_line_count'],
            'advance_line_count': row['advance_line_count'],
            'other_line_count': row['other_line_count'],
            'account_ids': sorted(row['account_ids']),
            'other_journal_ids': sorted(row['other_journal_ids']),
        })
    return {
        'meta': {**scope.metadata(), 'report': 'payroll_posting_bridge',
                 'source': 'payroll_settlements_and_journal_lines',
                 'sign_convention': 'debit_minus_credit'},
        'status': 'comparison_only', 'rows': rows,
        'limitations': [
            'This compares paid salary and employee advances with native GL postings, not earned salary or a certified payroll payable.',
            'Goods salary is posted on the linked sale; goods returns reduce that sale posting. A separate payroll cash journal is not expected.',
            'Overtime, absence and food affect entitlement calculations but are not separate 5100/1300 postings until paid or accrued.',
            'Other account postings remain visible separately; manual journals have no reliable employee identity.',
            'Current goods settlement amounts can differ from a historical cutoff after later returns or edits; zero differences do not certify history.',
        ],
    }
