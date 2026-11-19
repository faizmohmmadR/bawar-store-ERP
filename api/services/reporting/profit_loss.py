"""Recorded AFN profit/loss review from live, non-closing GL lines."""
from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, Q, Sum
from rest_framework.exceptions import ValidationError

from api.models.data.journal import JournalLine
from .contracts import money
from .ledger import ledger_health

ZERO = Decimal('0')
REVENUE_CODES = frozenset({'4000', '4100', '4200', '4300', '4400'})
EXPENSE_CODES = frozenset({'5000', '5070', '5100', '5150', '5200', '5220', '5250', '5350', '5400'})


def profit_loss_review(scope):
    if scope.currency is not None or scope.account_id is not None:
        raise ValidationError({'filters': 'AFN profit/loss needs every source currency and income account.'})
    lines = JournalLine.objects.filter(
        journal_entry__deleted_at__isnull=True,
        journal_entry__is_closing_entry=False,
    )
    if scope.start_date:
        lines = lines.filter(journal_entry__entry_date__gte=scope.start_date)
    if scope.end_date:
        lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
    wrong_category = lines.filter(
        (Q(gl_account__code__in=REVENUE_CODES) & ~Q(gl_account__category='revenue'))
        | (Q(gl_account__code__in=EXPENSE_CODES) & ~Q(gl_account__category='expense'))
    ).count()
    bad_base = (Q(base_debit__isnull=True) | Q(base_credit__isnull=True)
                | Q(needs_rate_review=True) | Q(exchange_rate__isnull=True)
                | Q(exchange_rate__lte=0) | (Q(currency=1) & ~Q(exchange_rate=1)))
    groups = lines.filter(gl_account__category__in=('revenue', 'expense')).values(
        'gl_account_id', 'gl_account__code', 'gl_account__name',
        'gl_account__category', 'gl_account__deleted_at',
    ).annotate(debit=Sum('base_debit'), credit=Sum('base_credit'),
               unknown=Count('pk', filter=bad_base), line_count=Count('pk')).order_by(
                   'gl_account__code', 'gl_account_id')

    sections = defaultdict(lambda: {'amount': ZERO, 'unknown': 0})
    rows = []
    deleted_account_count = unknown_base_count = 0
    for group in groups:
        code, category = group['gl_account__code'], group['gl_account__category']
        section = ('sales_revenue' if code == '4000' else
                   'sales_returns' if code == '4100' else
                   'other_revenue' if category == 'revenue' else
                   'cost_of_goods_sold' if code == '5200' else 'other_expenses')
        debit, credit = group['debit'] or ZERO, group['credit'] or ZERO
        # Returns and expenses have debit-normal balances. Revenue is credit-normal.
        amount = debit - credit if section in ('sales_returns', 'cost_of_goods_sold', 'other_expenses') else credit - debit
        sections[section]['amount'] += amount
        sections[section]['unknown'] += group['unknown']
        unknown_base_count += group['unknown']
        deleted_account = group['gl_account__deleted_at'] is not None
        deleted_account_count += deleted_account
        rows.append(dict(account_id=group['gl_account_id'], code=code,
                         name=group['gl_account__name'], category=category,
                         section=section, deleted_account=deleted_account,
                         debit_afn=money(debit) if not group['unknown'] else None,
                         credit_afn=money(credit) if not group['unknown'] else None,
                         amount_afn=money(amount) if not group['unknown'] else None,
                         unknown_base_count=group['unknown'], line_count=group['line_count']))

    def amount(section):
        return None if sections[section]['unknown'] or wrong_category else sections[section]['amount']

    sales, returns, other_income = (amount(name) for name in ('sales_revenue', 'sales_returns', 'other_revenue'))
    cogs, other_expenses = (amount(name) for name in ('cost_of_goods_sold', 'other_expenses'))
    net_sales = sales - returns if sales is not None and returns is not None else None
    gross_profit = net_sales - cogs if net_sales is not None and cogs is not None else None
    net_result = gross_profit + other_income - other_expenses if gross_profit is not None and other_income is not None and other_expenses is not None else None
    totals = dict(sales_revenue=money(sales), sales_returns=money(returns),
                  net_sales=money(net_sales), cost_of_goods_sold=money(cogs),
                  gross_profit=money(gross_profit), other_revenue=money(other_income),
                  other_expenses=money(other_expenses), net_result=money(net_result))
    journal_issue_count = ledger_health(scope)['issue_count']
    review = bool(unknown_base_count or wrong_category or deleted_account_count or journal_issue_count)
    return dict(meta={**scope.metadata(), 'report': 'profit_loss_review',
                      'source': 'journal_lines_base_afn', 'currency_id': 1},
                status='review_required' if review else 'recorded_pnl_unverified',
                rows=rows, totals=totals, unknown_base_count=unknown_base_count,
                wrong_category_line_count=wrong_category,
                deleted_account_count=deleted_account_count,
                journal_health_issue_count=journal_issue_count,
                limitations=[
                    'Only live non-closing revenue and expense journal lines in the selected period are included.',
                    'The amount is based on saved AFN equivalents, not current exchange rates or native-currency sums.',
                    'Unknown historical base values make affected sections and dependent profit totals null.',
                    'Gross profit uses sales revenue, sales returns and COGS; other revenue and expenses enter net result separately.',
                    'Source-document completeness, historical opening, payroll accrual and inventory cost reconciliation remain unverified.',
                ])
