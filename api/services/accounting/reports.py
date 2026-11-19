"""Financial statement aggregations from journal lines.

Native mode: filter JournalLine.currency, sum debit/credit.
AFN consolidated (mode='base'): sum base_debit/base_credit across currencies,
grouped by account code (not fake Base GL accounts).

P&L uses historical transaction conversion stored on the line.
Balance sheet monetary items use current ledger carrying value (historical
base amounts). Period-end closing-rate revaluation is Phase 4.
"""
import re
from decimal import Decimal

from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce

from api.models.data.currency import BASE_CURRENCY_ID, currency_details
from api.services.accounting.amounts import d

ZERO = Decimal('0')
MONEY = DecimalField(max_digits=15, decimal_places=2)
_CURRENCY_SUFFIX = re.compile(r'\s*\((AFN|USD|KDR)\)\s*$', re.IGNORECASE)

REPORT_MODE_NATIVE = 'native'
REPORT_MODE_BASE = 'base'


def normalize_report_mode(mode):
    value = (mode or REPORT_MODE_NATIVE).strip().lower()
    if value in ('base', 'afn', 'consolidated', 'reporting'):
        return REPORT_MODE_BASE
    return REPORT_MODE_NATIVE


def canonical_account_name(name):
    return _CURRENCY_SUFFIX.sub('', name or '').strip() or (name or '')


def canonical_account_code(code):
    raw = (code or '').strip()
    if not raw:
        return raw
    return raw.split('-')[0]


def _money_sum(field):
    return Coalesce(Sum(field), Value(ZERO, output_field=MONEY), output_field=MONEY)


def _filtered_lines(*, start_date=None, end_date=None, exclude_closing=False):
    from api.models.data.journal import JournalLine

    lines = JournalLine.objects.select_related('gl_account', 'journal_entry')
    if exclude_closing:
        lines = lines.filter(journal_entry__is_closing_entry=False)
    from api.utils.date_filters import apply_date_range
    return apply_date_range(lines, 'journal_entry__entry_date', start_date, end_date)


def _native_currency_q(currency_id):
    posting = int(currency_id)
    q = Q(currency=posting) | Q(
        currency__isnull=True, gl_account__currency=posting)
    if posting == BASE_CURRENCY_ID:
        q = q | Q(currency__isnull=True, gl_account__currency__isnull=True)
    return q


def get_trial_balance(
    *,
    start_date=None,
    end_date=None,
    currency_id=None,
    mode=REPORT_MODE_NATIVE,
    exclude_closing=False,
):
    from api.services.accounting.coa import posting_currency_id

    mode = normalize_report_mode(mode)
    lines = _filtered_lines(
        start_date=start_date, end_date=end_date, exclude_closing=exclude_closing,
    )
    unmapped = 0

    if mode == REPORT_MODE_BASE:
        unmapped = lines.filter(needs_rate_review=True).count()
        lines = lines.exclude(needs_rate_review=True).filter(
            Q(base_debit__isnull=False) | Q(base_credit__isnull=False)
        )
        grouped = lines.values(
            'gl_account__code',
            'gl_account__category',
        ).annotate(
            total_debit=_money_sum('base_debit'),
            total_credit=_money_sum('base_credit'),
        ).order_by('gl_account__code')

        names = {}
        for item in lines.values('gl_account__code', 'gl_account__name', 'gl_account__currency'):
            code = canonical_account_code(item['gl_account__code'])
            if code not in names or item['gl_account__currency'] in (None, BASE_CURRENCY_ID):
                names[code] = canonical_account_name(item['gl_account__name'])

        merged = {}
        for row in grouped:
            code = canonical_account_code(row['gl_account__code'])
            bucket = merged.setdefault(code, {
                'code': code,
                'category': row['gl_account__category'],
                'total_debit': ZERO,
                'total_credit': ZERO,
            })
            bucket['total_debit'] += d(row['total_debit'])
            bucket['total_credit'] += d(row['total_credit'])

        result = []
        total_debit = ZERO
        total_credit = ZERO
        for code, bucket in merged.items():
            debit = bucket['total_debit']
            credit = bucket['total_credit']
            total_debit += debit
            total_credit += credit
            result.append({
                'gl_account_id': None,
                'code': code,
                'name': names.get(code) or code,
                'category': bucket['category'],
                'total_debit': debit,
                'total_credit': credit,
                'balance': debit - credit,
            })
        result.sort(key=lambda row: row['code'])

        reporting = currency_details(BASE_CURRENCY_ID)
        return {
            'rows': result,
            'totals': {
                'total_debit': total_debit,
                'total_credit': total_credit,
                'difference': total_debit - total_credit,
                'is_balanced': total_debit == total_credit,
            },
            'mode': REPORT_MODE_BASE,
            'currency': BASE_CURRENCY_ID,
            'currency_details': reporting,
            'base_currency': reporting,
            'amount_kind': 'afn_equivalent',
            'amount_kind_label': 'AFN Equivalent / Reporting',
            'expects_balance': True,
            'balance_note': None,
            'unmapped_line_count': unmapped,
        }

    posting = int(
        currency_id) if currency_id is not None else posting_currency_id()
    lines = lines.filter(_native_currency_q(posting))
    grouped = lines.values(
        'gl_account_id',
        'gl_account__code',
        'gl_account__name',
        'gl_account__category',
    ).annotate(
        total_debit=_money_sum('debit'),
        total_credit=_money_sum('credit'),
    ).order_by('gl_account__code')

    result = []
    total_debit = ZERO
    total_credit = ZERO
    for row in grouped:
        debit = d(row['total_debit'])
        credit = d(row['total_credit'])
        total_debit += debit
        total_credit += credit
        result.append({
            'gl_account_id': row['gl_account_id'],
            'code': canonical_account_code(row['gl_account__code']),
            'name': canonical_account_name(row['gl_account__name']),
            'category': row['gl_account__category'],
            'total_debit': debit,
            'total_credit': credit,
            'balance': debit - credit,
        })

    details = currency_details(posting)
    code = (details or {}).get('code') or str(posting)
    is_balanced = total_debit == total_credit
    # Native books only include lines in this currency. Multi-currency journals
    # (exchange / FX) intentionally leave one side in another currency, so a
    # native TB/BS is not required to balance. Use AFN consolidated for that.
    balance_note = None
    if not is_balanced:
        balance_note = (
            f'Native {code} includes only journal lines denominated in {code}. '
            'Currency exchange and FX journals post other currencies on the opposite '
            'side, so this view may not balance. Switch to AFN Consolidated for the '
            'company reporting statement that must balance.'
        )

    return {
        'rows': result,
        'totals': {
            'total_debit': total_debit,
            'total_credit': total_credit,
            'difference': total_debit - total_credit,
            'is_balanced': is_balanced,
        },
        'mode': REPORT_MODE_NATIVE,
        'currency': posting,
        'currency_details': details,
        'base_currency': currency_details(BASE_CURRENCY_ID),
        'amount_kind': 'native',
        'amount_kind_label': f'Native Amount ({code} lines only)',
        'expects_balance': False,
        'balance_note': balance_note,
        'unmapped_line_count': 0,
    }


def get_account_code_balance(
    code,
    *,
    start_date=None,
    end_date=None,
    currency_id=None,
    mode=REPORT_MODE_NATIVE,
    category=None,
):
    """Net balance for a stable account code (1000 Cash, 1200 AR, …)."""
    trial = get_trial_balance(
        start_date=start_date,
        end_date=end_date,
        currency_id=currency_id,
        mode=mode,
    )
    code = canonical_account_code(code)
    for row in trial['rows']:
        if canonical_account_code(row['code']) != code:
            continue
        if category and row['category'] != category:
            continue
        if row['category'] in ('liability', 'equity', 'revenue'):
            return d(row['total_credit']) - d(row['total_debit'])
        return d(row['total_debit']) - d(row['total_credit'])
    return ZERO


def _credit_normal_amount(row):
    return d(row['total_credit']) - d(row['total_debit'])


def _debit_normal_amount(row):
    return d(row['total_debit']) - d(row['total_credit'])


def get_profit_and_loss(
    *,
    start_date=None,
    end_date=None,
    currency_id=None,
    mode=REPORT_MODE_NATIVE,
):
    # Closing entries zero revenue/expense into equity; exclude them from period P&L.
    trial = get_trial_balance(
        start_date=start_date,
        end_date=end_date,
        currency_id=currency_id,
        mode=mode,
        exclude_closing=True,
    )
    balances = trial['rows']

    revenue = ZERO
    expenses = ZERO
    cogs = ZERO
    revenue_accounts = []
    expense_accounts = []
    cogs_accounts = []

    for row in balances:
        category = row['category']
        code = canonical_account_code(row.get('code') or '')
        name_l = (row.get('name') or '').lower()
        if category == 'revenue':
            amount = _credit_normal_amount(row)
            if amount != 0:
                revenue += amount
                revenue_accounts.append({**row, 'amount': amount})
        elif category == 'expense':
            amount = _debit_normal_amount(row)
            if amount == 0:
                continue
            # Net credits on expense accounts (legacy stock capitalization to
            # 5070) are balance-sheet items, not P&L. Skip them here; repair
            # scripts move those credits to opening equity.
            if amount < 0 and code != "5220":
                continue
            if code == '5200' or 'cogs' in name_l:
                cogs += amount
                cogs_accounts.append({**row, 'amount': amount})
            else:
                expenses += amount
                expense_accounts.append({**row, 'amount': amount})

    gross_profit = revenue - cogs
    operating_expenses = expenses
    net_income = gross_profit - operating_expenses

    return {
        'revenue': revenue,
        'cogs': cogs,
        'gross_profit': gross_profit,
        'expenses': operating_expenses,
        'net_income': net_income,
        'revenue_accounts': revenue_accounts,
        'cogs_accounts': cogs_accounts,
        'expense_accounts': expense_accounts,
        'totals': trial['totals'],
        'mode': trial.get('mode'),
        'currency': trial.get('currency'),
        'currency_details': trial.get('currency_details'),
        'base_currency': trial.get('base_currency'),
        'amount_kind': trial.get('amount_kind'),
        'amount_kind_label': trial.get('amount_kind_label'),
        'expects_balance': trial.get('expects_balance'),
        'balance_note': trial.get('balance_note'),
        'unmapped_line_count': trial.get('unmapped_line_count', 0),
    }


def get_balance_sheet(
    *,
    start_date=None,
    end_date=None,
    currency_id=None,
    mode=REPORT_MODE_NATIVE,
):
    # Balance sheet is cumulative through end_date. A period start_date would
    # drop opening balances and understate assets/liabilities/equity.
    trial = get_trial_balance(
        start_date=None,
        end_date=end_date,
        currency_id=currency_id,
        mode=mode,
    )
    balances = trial['rows']

    assets = []
    liabilities = []
    equity_accounts = []

    for row in balances:
        category = row['category']
        if category == 'asset':
            amount = _debit_normal_amount(row)
            if amount != 0:
                assets.append({**row, 'amount': amount})
        elif category == 'liability':
            amount = _credit_normal_amount(row)
            if amount != 0:
                liabilities.append({**row, 'amount': amount})
        elif category == 'equity':
            amount = _credit_normal_amount(row)
            if amount != 0:
                equity_accounts.append({**row, 'amount': amount})

    # Unclosed earnings = all P&L through the cutoff (not only the UI period).
    pl = get_profit_and_loss(
        start_date=None,
        end_date=end_date,
        currency_id=currency_id,
        mode=mode,
    )
    net_income = pl['net_income']

    total_assets = sum((row['amount'] for row in assets), ZERO)
    total_liabilities = sum((row['amount'] for row in liabilities), ZERO)
    equity_from_accounts = sum((row['amount']
                               for row in equity_accounts), ZERO)
    total_equity = equity_from_accounts + net_income
    total_liabilities_and_equity = total_liabilities + total_equity

    is_balanced = total_assets == total_liabilities_and_equity
    balance_note = trial.get('balance_note')
    if not is_balanced and trial.get('mode') == REPORT_MODE_NATIVE and not balance_note:
        code = (trial.get('currency_details') or {}).get('code') or 'native'
        balance_note = (
            f'Native {code} balance sheet may not balance when currency exchange or FX '
            'journals exist. Use AFN Consolidated for the company reporting statement.'
        )

    return {
        'assets': assets,
        'liabilities': liabilities,
        'equity_accounts': equity_accounts,
        'net_income': net_income,
        'total_assets': total_assets,
        'total_liabilities': total_liabilities,
        'total_equity': total_equity,
        'total_liabilities_and_equity': total_liabilities_and_equity,
        'is_balanced': is_balanced,
        'difference': total_assets - total_liabilities_and_equity,
        'mode': trial.get('mode'),
        'currency': trial.get('currency'),
        'currency_details': trial.get('currency_details'),
        'base_currency': trial.get('base_currency'),
        'amount_kind': trial.get('amount_kind'),
        'amount_kind_label': trial.get('amount_kind_label'),
        'expects_balance': trial.get('expects_balance'),
        'balance_note': balance_note,
        'unmapped_line_count': trial.get('unmapped_line_count', 0),
    }
