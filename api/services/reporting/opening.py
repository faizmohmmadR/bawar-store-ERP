"""Expose recorded opening evidence without manufacturing opening balances."""
from dataclasses import replace
from datetime import timedelta

from rest_framework.exceptions import ValidationError

from api.models.data.journal import JournalEntry, JournalLine
from .ledger import build_balances, ledger_lines


def opening_review(scope):
    if scope.start_date is None:
        raise ValidationError({'start_date': 'An explicit period start is required for opening review.'})
    cutoff = scope.start_date - timedelta(microseconds=1)
    historical = replace(scope, start_date=None, end_date=cutoff)
    balances = build_balances(historical)
    selected = ledger_lines(historical)
    journals = JournalEntry.objects.filter(pk__in=selected.values('journal_entry_id'))
    # An equity line is evidence to review, not proof that opening is correct.
    equity = JournalLine.objects.filter(
        journal_entry_id__in=journals.values('pk'), gl_account__code='3000',
    ).values('journal_entry_id').distinct()
    return {
        'meta': {**scope.metadata(), 'report': 'opening_review'},
        'status': 'requires_opening_reconciliation',
        'opening_as_of': cutoff.isoformat(),
        'rows': [
            {key: value for key, value in row.items() if key not in ('opening_balance', 'debits', 'credits', 'closing_balance')}
            | {'recorded_opening_balance': row['closing_balance']}
            for row in balances['rows']
        ],
        'historical_journal_count': journals.count(),
        'equity_evidence_journal_count': equity.count(),
        'detail_filters': {'end_date': cutoff.isoformat(),
                           'currency': scope.currency, 'account_id': scope.account_id},
        'limitations': [
            'Recorded pre-period history is not a certified opening balance.',
            'No opening document is created and no missing value is assumed to be zero.',
            'Equity evidence can include owner contributions and adjustments; inspect source documents.',
        ],
    }
