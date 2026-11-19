"""Point-in-time AFN balance-sheet review from the V2 trial balance."""
from decimal import Decimal

from rest_framework.exceptions import ValidationError

from .contracts import ReportScope, money
from .trial_balance import trial_balance_review


SECTIONS = {
    'asset': 'assets',
    'liability': 'liabilities',
    'equity': 'equity',
    'revenue': 'unclosed_earnings',
    'expense': 'unclosed_earnings',
}


def balance_sheet_review(scope):
    if scope.start_date is not None or scope.currency is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'A balance sheet is cumulative through the cutoff and requires every account and currency; only end_date is supported.'})

    trial = trial_balance_review(ReportScope(end_date=scope.end_date))
    sums = {section: Decimal('0') for section in ('assets', 'liabilities', 'equity', 'unclosed_earnings')}
    unknown_sections = set()
    unknown_category_count = 0
    rows = []
    for account in trial['rows']:
        category = account['category']
        section = SECTIONS.get(category)
        balance = account['closing_balance']
        amount = None
        if section is None:
            unknown_category_count += 1
        elif balance is None:
            unknown_sections.add(section)
        else:
            value = Decimal(balance)
            amount = value if category == 'asset' else -value
            if amount == 0:
                amount = Decimal('0')
            sums[section] += amount
        rows.append({
            'account_id': account['account_id'], 'code': account['code'],
            'name': account['name'], 'category': category, 'section': section,
            'amount_afn': money(amount),
            'deleted_account': account['deleted_account'],
            'unknown_base_count': account['unknown_base_count'],
            'line_count': account['line_count'],
        })

    totals = {section: money(value) if section not in unknown_sections else None
              for section, value in sums.items()}
    equity_total = (sums['equity'] + sums['unclosed_earnings']
                    if not unknown_sections.intersection({'equity', 'unclosed_earnings'}) else None)
    difference = (sums['assets'] - sums['liabilities'] - equity_total
                  if equity_total is not None and not unknown_sections
                  and not unknown_category_count else None)
    totals['equity_including_unclosed_earnings'] = money(equity_total)
    totals['difference'] = money(difference)
    balanced = (trial['status'] == 'recorded_trial_balance_balanced'
                and not unknown_category_count and difference == 0)
    return {
        'meta': {**scope.metadata(), 'report': 'balance_sheet_review',
                 'source': 'journal_lines_base_afn', 'currency_id': 1},
        'status': 'recorded_balance_sheet_balanced' if balanced else 'review_required',
        'rows': rows, 'totals': totals,
        'trial_balance_status': trial['status'],
        'unknown_base_count': trial['unknown_base_count'],
        'unknown_category_count': unknown_category_count,
        'deleted_account_count': trial['deleted_account_count'],
        'journal_health_issue_count': trial['journal_health_issue_count'],
        'limitations': [
            'Balances are cumulative saved historical AFN amounts through the cutoff across all currencies.',
            'Revenue and expense account balances after closing entries are unclosed earnings; retained earnings stays in equity, so closed profit is not counted twice.',
            'Contra assets and owner draws reduce their sections through the signed account balance.',
            'Missing historical base amounts make the affected section and dependent totals null; unknown account categories make the equation difference null.',
            'A balanced recorded ledger does not certify source documents, historical openings, inventory valuation or payroll liabilities.',
        ],
    }
