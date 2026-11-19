from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import Count, Q, Sum
from django.utils import timezone

from api.models.data.journal import JournalLine
from api.services.accounting import SOURCE_MODEL_ALIASES


def _d(value):
    if value is None:
        return Decimal('0')
    return Decimal(str(value))


def _parse_filter_datetime(value, *, end=False):
    from api.services.report_period import parse_report_datetime
    return parse_report_datetime(value, end=end)


def _normalize_source_model(source_model):
    if not source_model:
        return None
    return SOURCE_MODEL_ALIASES.get(source_model.strip().lower(), source_model.strip().lower())


def _resolve_source_path(source_model, object_id):
    if not source_model or not object_id:
        return None

    normalized = _normalize_source_model(source_model)
    static_paths = {
        'sales': f'/sales/{object_id}',
        'return': f'/returns/{object_id}',
        'expense': f'/expenses/{object_id}',
        'payroll': f'/payroll/{object_id}',
        'loan': f'/loans/{object_id}',
    }
    if normalized in static_paths:
        return static_paths[normalized]

    if normalized == 'payment':
        return f'/sale-payments/{object_id}'

    if normalized == 'loanpayment':
        from api.models.data.loan import LoanPayment

        loan_payment = LoanPayment.objects.filter(pk=object_id).only('loan_id').first()
        if loan_payment and loan_payment.loan_id:
            return f'/loans/{loan_payment.loan_id}'

    return None


def get_gl_account_lines(gl_account, *, start_date=None, end_date=None, source_model=None, search=None):
    """Journal lines for a GL account, newest first."""
    lines = (
        JournalLine.objects.filter(gl_account=gl_account)
        .select_related(
            'gl_account',
            'journal_entry',
            'journal_entry__content_type',
        )
        .order_by('-journal_entry__entry_date', '-journal_entry__id', '-id')
    )

    from api.utils.date_filters import apply_date_range
    lines = apply_date_range(lines, 'journal_entry__entry_date', start_date, end_date)

    normalized = _normalize_source_model(source_model)
    if normalized:
        try:
            ct = ContentType.objects.get(app_label='api', model=normalized)
            lines = lines.filter(journal_entry__content_type=ct)
        except ContentType.DoesNotExist:
            lines = lines.none()

    if search:
        term = search.strip()
        if term:
            lines = lines.filter(
                Q(journal_entry__reference_number__icontains=term)
                | Q(journal_entry__description__icontains=term)
                | Q(description__icontains=term)
            )

    return lines


def _balance_for_category(category, total_debit, total_credit):
    if category in ('liability', 'equity', 'revenue'):
        return total_credit - total_debit
    return total_debit - total_credit


def _empty_totals():
    return {
        'total_debit': 0.0,
        'total_credit': 0.0,
        'balance': 0.0,
        'total_base_debit': 0.0,
        'total_base_credit': 0.0,
        'base_balance': 0.0,
        'line_count': 0,
        'currencies': [],
        'is_mixed_currency': False,
        'amount_kind': 'native',
    }


def _totals_payload(
    *,
    category,
    total_debit,
    total_credit,
    total_base_debit,
    total_base_credit,
    line_count,
    currencies,
    gl_account_code=None,
    gl_account_currency_id=None,
):
    from api.constants.gl_roles import is_currency_specific_gl_code
    from api.models.data.currency import BASE_CURRENCY_ID, get_currency

    codes = set()
    for raw in currencies:
        if raw is None or raw == '':
            continue
        text = str(raw).strip()
        if not text:
            continue
        # Accept either currency codes ("USD") or ids (1 / "1").
        if text.isdigit():
            cur = get_currency(int(text))
            codes.add((cur or {}).get('code') or text)
        else:
            codes.add(text.upper())
    code_list = sorted(codes)
    is_mixed = len(code_list) > 1

    use_afn_equivalent = is_mixed
    if not use_afn_equivalent and gl_account_code and gl_account_currency_id is not None:
        # Shared chart accounts (inventory, AP, revenue, …) store native USD on
        # the line but summaries should show AFN equivalents for reporting.
        if not is_currency_specific_gl_code(gl_account_code):
            if int(gl_account_currency_id) == BASE_CURRENCY_ID and code_list:
                if any(code != 'AFN' for code in code_list):
                    use_afn_equivalent = True

    return {
        'total_debit': float(total_debit),
        'total_credit': float(total_credit),
        'balance': float(_balance_for_category(category, total_debit, total_credit)),
        'total_base_debit': float(total_base_debit),
        'total_base_credit': float(total_base_credit),
        'base_balance': float(_balance_for_category(category, total_base_debit, total_base_credit)),
        'line_count': line_count,
        'currencies': code_list,
        'is_mixed_currency': is_mixed,
        'amount_kind': 'afn_equivalent' if use_afn_equivalent else 'native',
    }


def get_gl_accounts_totals_bulk(gl_accounts):
    """All-time debit/credit/balance for many GL accounts (efficient list enrichment)."""
    account_list = list(gl_accounts)
    if not account_list:
        return {}

    account_ids = [account.id for account in account_list]
    from api.models.data.currency import BASE_CURRENCY_ID

    categories = {account.id: account.category for account in account_list}
    codes = {account.id: account.code for account in account_list}
    currency_ids = {
        account.id: (
            account.currency if account.currency is not None else BASE_CURRENCY_ID
        )
        for account in account_list
    }

    agg_rows = (
        JournalLine.objects.filter(gl_account_id__in=account_ids)
        .values('gl_account_id')
        .annotate(
            total_debit=Sum('debit'),
            total_credit=Sum('credit'),
            total_base_debit=Sum('base_debit'),
            total_base_credit=Sum('base_credit'),
            line_count=Count('id'),
        )
    )
    currency_rows = (
        JournalLine.objects.filter(gl_account_id__in=account_ids)
        .values('gl_account_id', 'currency')
        .distinct()
    )
    currencies_by_account = {}
    for row in currency_rows:
        currencies_by_account.setdefault(row['gl_account_id'], []).append(row['currency'])

    result = {}
    for row in agg_rows:
        account_id = row['gl_account_id']
        result[account_id] = _totals_payload(
            category=categories.get(account_id, 'asset'),
            total_debit=_d(row['total_debit']),
            total_credit=_d(row['total_credit']),
            total_base_debit=_d(row['total_base_debit']),
            total_base_credit=_d(row['total_base_credit']),
            line_count=row['line_count'],
            currencies=currencies_by_account.get(account_id, []),
            gl_account_code=codes.get(account_id),
            gl_account_currency_id=currency_ids.get(account_id),
        )

    empty = _empty_totals()
    for account_id in account_ids:
        result.setdefault(account_id, empty.copy())

    return result


def get_gl_account_totals(gl_account, *, start_date=None, end_date=None):
    """Debit/credit/balance for a GL account (optionally within a period)."""
    from api.models.data.currency import BASE_CURRENCY_ID

    lines = get_gl_account_lines(gl_account, start_date=start_date, end_date=end_date)
    agg = lines.aggregate(
        total_debit=Sum('debit'),
        total_credit=Sum('credit'),
        total_base_debit=Sum('base_debit'),
        total_base_credit=Sum('base_credit'),
    )
    currencies = list(lines.values_list('currency', flat=True).distinct())
    return _totals_payload(
        category=gl_account.category,
        total_debit=_d(agg['total_debit']),
        total_credit=_d(agg['total_credit']),
        total_base_debit=_d(agg['total_base_debit']),
        total_base_credit=_d(agg['total_base_credit']),
        line_count=lines.count(),
        currencies=currencies,
        gl_account_code=gl_account.code,
        gl_account_currency_id=(
            gl_account.currency if gl_account.currency is not None else BASE_CURRENCY_ID
        ),
    )


def serialize_gl_journal_line(line):
    from api.constants.accounting_constants import entry_type_for_journal
    from api.models.data.currency import BASE_CURRENCY_ID, currency_details, get_currency

    je = line.journal_entry
    source_model = je.content_type.model if je.content_type else None
    source_object_id = je.object_id if je else None
    line_currency_id = (
        int(line.currency)
        if line.currency is not None
        else (
            int(line.gl_account.currency)
            if line.gl_account and line.gl_account.currency is not None
            else BASE_CURRENCY_ID
        )
    )
    line_currency = currency_details(line_currency_id) or {}
    gl_currency_id = (
        int(line.gl_account.currency)
        if line.gl_account and line.gl_account.currency is not None
        else BASE_CURRENCY_ID
    )
    return {
        'id': line.id,
        'journal_entry_id': je.id,
        'entry_date': je.entry_date,
        'entry_type_name': entry_type_for_journal(je),
        'source_model': source_model,
        'source_object_id': source_object_id,
        'source_path': _resolve_source_path(source_model, source_object_id),
        'reference_number': je.reference_number or '',
        'journal_description': je.description or '',
        'gl_account_code': line.gl_account.code if line.gl_account else '',
        'gl_account_name': line.gl_account.name if line.gl_account else '',
        'gl_account_category': line.gl_account.category if line.gl_account else '',
        'gl_account_details': {
            'id': line.gl_account_id,
            'code': line.gl_account.code,
            'name': line.gl_account.name,
            'category': line.gl_account.category,
            'currency': gl_currency_id,
            'currency_details': currency_details(gl_currency_id),
        } if line.gl_account else None,
        'currency': line_currency_id,
        'currency_code': line_currency.get('code') or (get_currency(line_currency_id) or {}).get('code') or 'AFN',
        'currency_details': line_currency,
        'exchange_rate': float(line.exchange_rate or 1),
        'debit_amount': float(line.debit or 0),
        'credit_amount': float(line.credit or 0),
        'base_debit': float(line.base_debit or 0),
        'base_credit': float(line.base_credit or 0),
        'line_description': line.description or '',
        'notes': line.description or '',
        'is_auto': je.is_auto,
    }


def prepare_gl_account_history(
    rows,
    category,
    *,
    gl_account_code=None,
    gl_account_currency_id=None,
):
    """
    Sort chronologically, compute running balances, then return newest-first.

    Native running balance is only meaningful when all lines share one currency.
    AFN running balance is always computed from base_debit/base_credit.
    """
    sorted_rows = sorted(
        rows,
        key=lambda r: (r['entry_date'], r.get('journal_entry_id') or 0, r['id']),
    )
    credit_normal = category in ('liability', 'equity', 'revenue')
    running_native = Decimal('0')
    running_base = Decimal('0')
    total_debit = Decimal('0')
    total_credit = Decimal('0')
    total_base_debit = Decimal('0')
    total_base_credit = Decimal('0')
    currencies = []

    for row in sorted_rows:
        debit = _d(row.get('debit_amount'))
        credit = _d(row.get('credit_amount'))
        base_debit = _d(row.get('base_debit'))
        base_credit = _d(row.get('base_credit'))
        total_debit += debit
        total_credit += credit
        total_base_debit += base_debit
        total_base_credit += base_credit
        if row.get('currency_code'):
            currencies.append(row['currency_code'])
        elif row.get('currency') is not None:
            currencies.append(row['currency'])

        if credit_normal:
            running_native += credit - debit
            running_base += base_credit - base_debit
        else:
            running_native += debit - credit
            running_base += base_debit - base_credit
        row['running_balance'] = float(running_native)
        row['running_balance_base'] = float(running_base)

    totals = _totals_payload(
        category=category,
        total_debit=total_debit,
        total_credit=total_credit,
        total_base_debit=total_base_debit,
        total_base_credit=total_base_credit,
        line_count=len(sorted_rows),
        currencies=currencies,
        gl_account_code=gl_account_code,
        gl_account_currency_id=gl_account_currency_id,
    )
    return list(reversed(sorted_rows)), totals


def build_gl_account_ledger_history(gl_account, *, start_date=None, end_date=None, source_model=None, search=None):
    from api.models.data.currency import BASE_CURRENCY_ID

    lines = get_gl_account_lines(
        gl_account,
        start_date=start_date,
        end_date=end_date,
        source_model=source_model,
        search=search,
    )
    serialized = [serialize_gl_journal_line(line) for line in lines]
    rows, period_totals = prepare_gl_account_history(
        serialized,
        gl_account.category,
        gl_account_code=gl_account.code,
        gl_account_currency_id=(
            gl_account.currency if gl_account.currency is not None else BASE_CURRENCY_ID
        ),
    )
    return rows, period_totals
