"""Recorded cash activity by cash/book account, independent of legacy reports.

Cash balance alone is not a cash-flow statement: a currency exchange moves
money between two cash books and must remain visible without being presented
as an external receipt or payment.  This module only reads posted journal
lines and preserves native currencies separately.
"""
from collections import defaultdict
from decimal import Decimal

from api.models.data.currency import CURRENCY_DEFINITIONS
from api.models.data.journal import JournalLine
from .contracts import money

ZERO = Decimal('0')
CASH_CODES = ('1000', '1050', '1060')

SOURCE_KINDS = {
    'payment': 'invoice_settlement',
    'generalpayment': 'advance_receipt',
    'expense': 'operating_expense',
    'withdrawal': 'owner_withdrawal',
    'payroll': 'payroll_payment',
    'loan': 'loan_principal',
    'loanpayment': 'loan_repayment',
    'currencyexchange': 'internal_currency_exchange',
    'salesmancommissionpayment': 'commission_payment',
    'equipment': 'equipment_purchase',
}
INTERNAL_KINDS = {'internal_currency_exchange'}


def _source_kind(line):
    entry = line.journal_entry
    model = entry.content_type.model if entry.content_type_id else None
    return model, SOURCE_KINDS.get(model, 'manual_or_unlinked')


def cash_activity(scope):
    """Return native cash-book movements and balances through the cutoff."""
    if scope.account_id is not None:
        # The cash account filter is useful and unambiguous for this report.
        account_filter = {'gl_account_id': scope.account_id}
    else:
        account_filter = {}
    lines = JournalLine.objects.filter(
        journal_entry__deleted_at__isnull=True,
        gl_account__code__in=CASH_CODES,
        **account_filter,
    )
    if scope.currency is not None:
        lines = lines.filter(currency=scope.currency)
    if scope.end_date:
        lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
    lines = lines.select_related('gl_account', 'journal_entry', 'journal_entry__content_type').order_by(
        'journal_entry__entry_date', 'journal_entry_id', 'id',
    )

    totals = defaultdict(lambda: {
        'account_id': None, 'code': None, 'name': None, 'currency_id': None,
        'deleted_account': False,
        'opening': ZERO, 'external_in': ZERO, 'external_out': ZERO,
        'internal_in': ZERO, 'internal_out': ZERO,
    })
    movements, kinds = [], defaultdict(lambda: {'in': ZERO, 'out': ZERO, 'count': 0})
    for line in lines.iterator(chunk_size=1000):
        amount = (line.debit or ZERO) - (line.credit or ZERO)
        key = (line.gl_account_id, line.currency)
        total = totals[key]
        total.update(account_id=line.gl_account_id, code=line.gl_account.code,
                     name=line.gl_account.name, currency_id=line.currency,
                     deleted_account=line.gl_account.deleted_at is not None)
        if scope.start_date and line.journal_entry.entry_date < scope.start_date:
            total['opening'] += amount
            continue
        model, kind = _source_kind(line)
        internal = kind in INTERNAL_KINDS
        if amount >= ZERO:
            total['internal_in' if internal else 'external_in'] += amount
        else:
            total['internal_out' if internal else 'external_out'] += -amount
        bucket = kinds[(line.currency, kind)]
        bucket['in' if amount >= ZERO else 'out'] += abs(amount)
        bucket['count'] += 1
        movements.append({
            'cash_line_id': line.pk,
            'journal_id': line.journal_entry_id,
            'entry_date': line.journal_entry.entry_date.isoformat(),
            'account_id': line.gl_account_id,
            'code': line.gl_account.code,
            'deleted_account': line.gl_account.deleted_at is not None,
            'currency_id': line.currency,
            'source_model': model,
            'source_id': line.journal_entry.object_id,
            'activity_kind': kind,
            'is_internal': internal,
            'direction': 'in' if amount >= ZERO else 'out',
            'amount': money(abs(amount)),
            'reference_number': line.journal_entry.reference_number,
            'description': line.description or line.journal_entry.description,
        })
    rows = []
    for total in totals.values():
        closing = (total['opening'] + total['external_in'] - total['external_out']
                   + total['internal_in'] - total['internal_out'])
        rows.append({
            **{key: total[key] for key in ('account_id', 'code', 'name', 'currency_id', 'deleted_account')},
            'currency_code': CURRENCY_DEFINITIONS.get(total['currency_id'], {}).get('code'),
            'opening_balance': money(total['opening']),
            'external_inflow': money(total['external_in']),
            'external_outflow': money(total['external_out']),
            'internal_inflow': money(total['internal_in']),
            'internal_outflow': money(total['internal_out']),
            'closing_balance': money(closing),
        })
    rows.sort(key=lambda row: (row['code'], row['account_id'], row['currency_id']))
    categories = [
        {'currency_id': currency, 'activity_kind': kind, 'inflow': money(value['in']),
         'outflow': money(value['out']), 'line_count': value['count']}
        for (currency, kind), value in sorted(kinds.items())
    ]
    review_count = sum(value['count'] for (_, kind), value in kinds.items() if kind == 'manual_or_unlinked')
    return {
        'meta': {**scope.metadata(), 'report': 'cash_activity', 'source': 'cash_journal_lines',
                 'balance_convention': 'debit_minus_credit'},
        'status': 'recorded_cash_activity_unverified',
        'rows': rows,
        'categories': categories,
        'review_count': review_count,
        'movements': movements,
        'limitations': [
            'Native currencies are separate and are never summed.',
            'Currency exchanges are shown as internal movements, not external cash flow.',
            'Manual or unlinked journals remain visible for review; source-document completeness is not certified.',
        ],
    }
