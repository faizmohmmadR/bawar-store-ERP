"""Ledger balances derived directly from stored lines, independently of old reports.

Native balances are grouped by account AND line currency. No total across
different native currencies is exposed. Base-only revaluations never become
physical receipts/disbursements. All rows, including inactive accounts, remain
visible when they have history.
"""
from decimal import Decimal

from django.db.models import Count, Q, Sum

from api.models.data.currency import CURRENCY_DEFINITIONS
from api.models.data.journal import JournalEntry, JournalLine
from .contracts import money

ZERO = Decimal('0')
CASH_CODES = ('1000', '1050', '1060')


def ledger_lines(scope, *, cash_only=False):
    qs = JournalLine.objects.filter(
        journal_entry__deleted_at__isnull=True,
    )
    if scope.end_date is not None:
        qs = qs.filter(journal_entry__entry_date__lte=scope.end_date)
    if scope.currency is not None:
        qs = qs.filter(currency=scope.currency)
    if scope.account_id is not None:
        qs = qs.filter(gl_account_id=scope.account_id)
    if cash_only:
        qs = qs.filter(gl_account__code__in=CASH_CODES)
    return qs


def _period_q(scope):
    return Q(journal_entry__entry_date__gte=scope.start_date) if scope.start_date else Q()


def build_balances(scope, *, cash_only=False):
    qs = ledger_lines(scope, cash_only=cash_only)
    period = _period_q(scope)
    opening = Q(journal_entry__entry_date__lt=scope.start_date) if scope.start_date else Q(pk__in=[])
    groups = qs.values(
        'gl_account_id', 'gl_account__code', 'gl_account__name',
        'gl_account__category', 'gl_account__deleted_at', 'currency',
    ).annotate(
        opening_debit=Sum('debit', filter=opening),
        opening_credit=Sum('credit', filter=opening),
        period_debit=Sum('debit', filter=period),
        period_credit=Sum('credit', filter=period),
        line_count=Count('id'),
        unknown_base_count=Count('id', filter=Q(base_debit__isnull=True) | Q(base_credit__isnull=True) | Q(needs_rate_review=True)),
    ).order_by('gl_account__code', 'gl_account_id', 'currency')
    rows = []
    totals = {}
    for group in groups:
        initial = (group['opening_debit'] or ZERO) - (group['opening_credit'] or ZERO)
        debit, credit = group['period_debit'] or ZERO, group['period_credit'] or ZERO
        closing = initial + debit - credit
        cid = group['currency']
        row = {
            'account_id': group['gl_account_id'], 'code': group['gl_account__code'],
            'name': group['gl_account__name'], 'category': group['gl_account__category'],
            'deleted_account': group['gl_account__deleted_at'] is not None,
            'currency_id': cid, 'currency_code': CURRENCY_DEFINITIONS.get(cid, {}).get('code'),
            'opening_balance': money(initial), 'debits': money(debit),
            'credits': money(credit), 'closing_balance': money(closing),
            'line_count': group['line_count'], 'unknown_base_count': group['unknown_base_count'],
        }
        rows.append(row)
        total = totals.setdefault(cid, dict(opening_balance=ZERO, debits=ZERO, credits=ZERO, closing_balance=ZERO))
        for key, amount in (
            ('opening_balance', initial), ('debits', debit),
            ('credits', credit), ('closing_balance', closing),
        ):
            total[key] += amount
    return {
        'meta': {**scope.metadata(), 'report': 'cash_balances' if cash_only else 'ledger_balances',
                 'balance_convention': 'debit_minus_credit',
                 'coverage': 'recorded_accounts_with_history',
                 'cash_note': 'Account movements include internal transfers; not external cash-flow totals.' if cash_only else None},
        'rows': rows,
        'totals_by_currency': [
            {'currency_id': cid, **{key: money(value) for key, value in values.items()}}
            for cid, values in sorted(totals.items())
        ],
    }


def entry_queryset(scope, *, cash_only=False):
    qs = ledger_lines(scope, cash_only=cash_only)
    if scope.start_date:
        qs = qs.filter(journal_entry__entry_date__gte=scope.start_date)
    return qs.select_related('gl_account', 'journal_entry', 'journal_entry__content_type').order_by('journal_entry__entry_date', 'journal_entry_id', 'id')


def serialize_line(line):
    entry = line.journal_entry
    return {
        'id': line.pk, 'journal_id': entry.pk, 'entry_date': entry.entry_date.isoformat(),
        'reference_number': entry.reference_number, 'description': line.description,
        'account_id': line.gl_account_id, 'code': line.gl_account.code,
        'deleted_account': line.gl_account.deleted_at is not None,
        'currency_id': line.currency, 'debit': money(line.debit), 'credit': money(line.credit),
        'base_debit': money(line.base_debit), 'base_credit': money(line.base_credit),
        'exchange_rate': str(line.exchange_rate) if line.exchange_rate is not None else None,
        'needs_rate_review': line.needs_rate_review,
        'source_model': entry.content_type.model if entry.content_type_id else None,
        'source_id': entry.object_id,
        'is_closing_entry': entry.is_closing_entry,
    }


def ledger_health(scope):
    # Check whole journals even if a single currency/account is selected: mixed
    # currency journals cannot be checked using only one side of the entry.
    selected = ledger_lines(scope)
    if scope.start_date:
        selected = selected.filter(journal_entry__entry_date__gte=scope.start_date)
    entries = JournalEntry.objects.all()
    if scope.start_date:
        entries = entries.filter(entry_date__gte=scope.start_date)
    if scope.end_date:
        entries = entries.filter(entry_date__lte=scope.end_date)
    if scope.currency is not None or scope.account_id is not None:
        entries = entries.filter(pk__in=selected.values('journal_entry_id'))
    live = Q(lines__deleted_at__isnull=True)
    entries = entries.annotate(
        base_dr=Sum('lines__base_debit', filter=live),
        base_cr=Sum('lines__base_credit', filter=live),
        live_count=Count('lines', filter=live),
        native_currency_count=Count('lines__currency', distinct=True, filter=live),
        native_dr=Sum('lines__debit', filter=live),
        native_cr=Sum('lines__credit', filter=live),
        invalid_rate=Count('lines', filter=live & (
            Q(lines__exchange_rate__isnull=True) | Q(lines__exchange_rate__lte=0)
            | (Q(lines__currency=1) & ~Q(lines__exchange_rate=1))
        )),
        unknown=Count('lines', filter=live & (Q(lines__base_debit__isnull=True) | Q(lines__base_credit__isnull=True) | Q(lines__needs_rate_review=True))),
    ).order_by('id')
    issues = []
    for entry in entries:
        if not entry.live_count:
            issues.append({'journal_id': entry.pk, 'kind': 'empty_journal'})
            continue
        if entry.unknown:
            issues.append({'journal_id': entry.pk, 'kind': 'unknown_base_amount', 'line_count': entry.unknown})
        elif entry.base_dr != entry.base_cr:
            issues.append({'journal_id': entry.pk, 'kind': 'unbalanced_base', 'difference': money((entry.base_dr or ZERO) - (entry.base_cr or ZERO))})
        if entry.native_currency_count == 1 and entry.native_dr != entry.native_cr:
            issues.append({'journal_id': entry.pk, 'kind': 'unbalanced_native', 'difference': money((entry.native_dr or ZERO) - (entry.native_cr or ZERO))})
        if entry.invalid_rate:
            issues.append({'journal_id': entry.pk, 'kind': 'invalid_exchange_rate', 'line_count': entry.invalid_rate})
    return {
        'meta': {**scope.metadata(), 'report': 'ledger_health'},
        'journal_count': entries.count(), 'issue_count': len(issues), 'issues': issues,
        'status': 'issues_found' if issues else 'ledger_checks_passed',
        'limitations': ['Source-document completeness, deleted sources and inventory/payroll reconciliation are not yet certified.'],
    }
