"""AFN trial-balance review from live journal lines, never legacy report sums."""
from decimal import Decimal

from django.db.models import Count, Q, Sum
from rest_framework.exceptions import ValidationError

from api.models.data.journal import JournalLine
from .contracts import ReportScope, money
from .ledger import ledger_health

ZERO = Decimal('0')


def trial_balance_review(scope):
    if scope.currency is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'A consolidated trial balance requires every account and currency; use ledger-balances for filtered positions.'})

    lines = JournalLine.objects.filter(journal_entry__deleted_at__isnull=True)
    if scope.end_date is not None:
        lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
    opening = Q(journal_entry__entry_date__lt=scope.start_date) if scope.start_date else Q(pk__in=[])
    period = Q(journal_entry__entry_date__gte=scope.start_date) if scope.start_date else Q()
    bad_base = (Q(base_debit__isnull=True) | Q(base_credit__isnull=True)
                | Q(needs_rate_review=True) | Q(exchange_rate__isnull=True)
                | Q(exchange_rate__lte=0) | (Q(currency=1) & ~Q(exchange_rate=1)))
    groups = lines.values('gl_account_id', 'gl_account__code', 'gl_account__name',
                          'gl_account__category', 'gl_account__deleted_at').annotate(
        opening_debit=Sum('base_debit', filter=opening),
        opening_credit=Sum('base_credit', filter=opening),
        period_debit=Sum('base_debit', filter=period),
        period_credit=Sum('base_credit', filter=period),
        opening_unknown=Count('pk', filter=opening & bad_base),
        period_unknown=Count('pk', filter=period & bad_base),
        line_count=Count('pk'),
    ).order_by('gl_account__code', 'gl_account_id')

    rows = []
    opening_debits = opening_credits = period_debits = period_credits = closing_debits = closing_credits = ZERO
    unknown_count = deleted_account_count = 0
    for group in groups:
        opening_net = (group['opening_debit'] or ZERO) - (group['opening_credit'] or ZERO)
        period_dr, period_cr = group['period_debit'] or ZERO, group['period_credit'] or ZERO
        closing_net = opening_net + period_dr - period_cr
        open_known, period_known = not group['opening_unknown'], not group['period_unknown']
        closing_known = open_known and period_known
        unknown_count += group['opening_unknown'] + group['period_unknown']
        deleted_account = group['gl_account__deleted_at'] is not None
        deleted_account_count += deleted_account
        if open_known:
            opening_debits += max(opening_net, ZERO)
            opening_credits += max(-opening_net, ZERO)
        if period_known:
            period_debits += period_dr
            period_credits += period_cr
        if closing_known:
            closing_debits += max(closing_net, ZERO)
            closing_credits += max(-closing_net, ZERO)
        rows.append(dict(account_id=group['gl_account_id'], code=group['gl_account__code'],
                         name=group['gl_account__name'], category=group['gl_account__category'],
                         deleted_account=deleted_account,
                         opening_balance=money(opening_net) if open_known else None,
                         period_debits=money(period_dr) if period_known else None,
                         period_credits=money(period_cr) if period_known else None,
                         closing_balance=money(closing_net) if closing_known else None,
                         closing_debit=money(max(closing_net, ZERO)) if closing_known else None,
                         closing_credit=money(max(-closing_net, ZERO)) if closing_known else None,
                         unknown_base_count=group['opening_unknown'] + group['period_unknown'],
                         line_count=group['line_count']))

    opening_complete = all(row['opening_balance'] is not None for row in rows)
    period_complete = all(row['period_debits'] is not None for row in rows)
    closing_complete = opening_complete and period_complete
    totals = dict(opening_debits=money(opening_debits) if opening_complete else None,
                  opening_credits=money(opening_credits) if opening_complete else None,
                  period_debits=money(period_debits) if period_complete else None,
                  period_credits=money(period_credits) if period_complete else None,
                  closing_debits=money(closing_debits) if closing_complete else None,
                  closing_credits=money(closing_credits) if closing_complete else None,
                  opening_difference=money(opening_debits - opening_credits) if opening_complete else None,
                  period_difference=money(period_debits - period_credits) if period_complete else None,
                  closing_difference=money(closing_debits - closing_credits) if closing_complete else None)
    journal_issue_count = ledger_health(ReportScope(end_date=scope.end_date))['issue_count']
    balanced = (bool(rows) and closing_complete and totals['opening_difference'] == '0.00'
                and totals['period_difference'] == '0.00'
                and totals['closing_difference'] == '0.00' and not deleted_account_count
                and not journal_issue_count)
    return dict(meta={**scope.metadata(), 'report': 'trial_balance_review',
                      'source': 'journal_lines_base_afn', 'currency_id': 1},
                status='recorded_trial_balance_balanced' if balanced else 'review_required',
                rows=rows, totals=totals, unknown_base_count=unknown_count,
                deleted_account_count=deleted_account_count, journal_health_issue_count=journal_issue_count,
                limitations=[
                    'AFN totals use saved historical base amounts across all native currencies; no current exchange rate is applied.',
                    'Any missing or invalid historical base value makes the affected account and consolidated totals null.',
                    'Journal health is checked through the cutoff, but balanced recorded lines do not certify source documents, historical openings or inventory/payroll subledgers.',
                    'Deleted accounts with live historical lines remain visible and require review.',
                ])
