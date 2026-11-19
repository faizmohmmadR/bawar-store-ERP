"""Daily transaction book — unified operational ledger for a calendar day or range.

Aggregates existing business records at read time (no separate storage model).
Cash in/out totals use the same section rules as financial_reports (payments only,
not accrual sales/purchases).
"""

from decimal import Decimal

from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS
from api.services.report_history import (
    CASH_IN_SECTIONS,
    CASH_OUT_SECTIONS,
    SECTION_LABELS,
    SECTION_QUERIES,
    _d,
    _matches_search,
)

# Business documents with money amounts (excludes AR/AP/loan balance snapshots).
DAILY_LEDGER_SECTIONS = [
    'sales',
    'returns',
    'return_refunds',
    'sales_payments',
    'purchases',
    'purchase_payments',
    'expenses',
    'withdrawals',
    'payroll',
    'advances',
    'commission_payments',
    'loans_given',
    'loans_received',
    'loan_collections',
    'loan_repayments',
    'equipment',
    'currency_exchanges',
    'production',
]


def _serialize_entry_date(value):
    if value is None:
        return None
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return str(value)


def _float(value):
    return float(_d(value))


def _is_cash_in(row_or_section):
    if isinstance(row_or_section, dict):
        if row_or_section.get('is_cash_in') is not None:
            return bool(row_or_section.get('is_cash_in'))
        section = row_or_section.get('section') or ''
        return section in CASH_IN_SECTIONS or row_or_section.get('direction') == 'in' and section in {
            'sales_payments', 'loans_received', 'loan_collections',
        }
    return row_or_section in CASH_IN_SECTIONS


def _is_cash_out(row_or_section):
    if isinstance(row_or_section, dict):
        if row_or_section.get('is_cash_out') is not None:
            return bool(row_or_section.get('is_cash_out'))
        section = row_or_section.get('section') or ''
        if section == 'equipment':
            return row_or_section.get('direction') == 'out'
        return section in CASH_OUT_SECTIONS
    return row_or_section in CASH_OUT_SECTIONS


def build_daily_ledger(
    *,
    start_date,
    end_date,
    currency=None,
    search=None,
    section=None,
):
    """Return chronological daily ledger rows with base + native currency totals."""
    sections = DAILY_LEDGER_SECTIONS
    if section:
        key = section.strip().lower()
        if key not in SECTION_LABELS or key not in DAILY_LEDGER_SECTIONS:
            return None, f'Unknown section: {section}'
        sections = [key]

    rows = []
    seen_ids = set()
    for sec in sections:
        query_fn = SECTION_QUERIES.get(sec)
        if not query_fn:
            continue
        for row in query_fn(start_date, end_date, currency):
            if row['id'] in seen_ids:
                continue
            seen_ids.add(row['id'])
            if not _matches_search(row, search):
                continue
            row = dict(row)
            row['section_label'] = SECTION_LABELS.get(sec, sec)
            row['entry_date'] = _serialize_entry_date(row.get('entry_date'))
            # Equipment cash flag depends on acquisition type (direction).
            if sec == 'equipment':
                row['is_cash_in'] = False
                row['is_cash_out'] = row.get('direction') == 'out'
            else:
                row['is_cash_in'] = sec in CASH_IN_SECTIONS
                row['is_cash_out'] = sec in CASH_OUT_SECTIONS
            rows.append(row)

    rows.sort(key=lambda r: (r.get('entry_date') or '', r.get('id') or ''))

    base = CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]
    base_code = base['code']

    cash_in_base = Decimal('0')
    cash_out_base = Decimal('0')
    section_summary = {}
    by_currency = {}

    for row in rows:
        amount = _d(row.get('amount'))
        amount_base = _d(row.get('amount_base'))
        sec = row.get('section') or ''
        code = (row.get('currency') or '').upper() or '—'
        cash_in = bool(row.get('is_cash_in'))
        cash_out = bool(row.get('is_cash_out'))

        if cash_in:
            cash_in_base += amount_base
        elif cash_out:
            cash_out_base += abs(amount_base)

        if sec:
            bucket = section_summary.setdefault(sec, {
                'section': sec,
                'label': SECTION_LABELS.get(sec, sec),
                'count': 0,
                'amount_base': Decimal('0'),
                'is_cash_movement': cash_in or cash_out,
            })
            bucket['count'] += 1
            bucket['amount_base'] += amount_base

        curr = by_currency.setdefault(code, {
            'currency': code,
            'count': 0,
            'cash_in': Decimal('0'),
            'cash_out': Decimal('0'),
        })
        curr['count'] += 1
        if cash_in:
            curr['cash_in'] += amount
        elif cash_out:
            curr['cash_out'] += abs(amount)

    section_list = [
        {
            **item,
            'amount_base': _float(item['amount_base']),
        }
        for item in sorted(section_summary.values(), key=lambda item: item['label'])
    ]
    by_currency_list = [
        {
            'currency': item['currency'],
            'count': item['count'],
            'cash_in': _float(item['cash_in']),
            'cash_out': _float(item['cash_out']),
        }
        for item in sorted(by_currency.values(), key=lambda c: c['currency'])
    ]

    totals = {
        'record_count': len(rows),
        'cash_in_base': _float(cash_in_base),
        'cash_out_base': _float(cash_out_base),
        'net_cash_base': _float(cash_in_base - cash_out_base),
        'base_currency_code': base_code,
    }

    return {
        'rows': rows,
        'totals': totals,
        'sections': section_list,
        'by_currency': by_currency_list,
        'base_currency': {
            'id': BASE_CURRENCY_ID,
            'code': base['code'],
            'symbol': base['symbol'],
            'name': base['name'],
        },
    }, None


def build_journal_daily_ledger(
    *,
    start_date,
    end_date,
    currency_id=None,
    search=None,
):
    """Daily transaction book from JournalLine (accounting source of truth)."""
    from api.models.data.currency import get_currency
    from api.models.data.journal import JournalLine
    from api.services.accounting.reports import canonical_account_name, canonical_account_code

    lines = (
        JournalLine.objects.select_related(
            'gl_account',
            'journal_entry',
        )
        .order_by('journal_entry__entry_date', 'journal_entry_id', 'id')
    )
    from api.utils.date_filters import apply_date_range
    lines = apply_date_range(lines, 'journal_entry__entry_date', start_date, end_date)
    if currency_id not in (None, '', 'all'):
        try:
            lines = lines.filter(currency=int(currency_id))
        except (TypeError, ValueError):
            code = str(currency_id).upper()
            from api.models.data.currency import CURRENCY_BY_CODE
            cid = (CURRENCY_BY_CODE.get(code) or {}).get('id')
            if cid:
                lines = lines.filter(currency=cid)

    rows = []
    cash_in_base = Decimal('0')
    cash_out_base = Decimal('0')
    by_currency = {}
    section_summary = {}
    needle = (search or '').strip().lower()

    for line in lines.iterator(chunk_size=500):
        journal = line.journal_entry
        gl = line.gl_account
        code = canonical_account_code(gl.code if gl else '')
        name = canonical_account_name(gl.name if gl else '')
        currency = get_currency(line.currency) or {'code': 'AFN', 'id': BASE_CURRENCY_ID}
        native = _d(line.debit) if _d(line.debit) > 0 else _d(line.credit)
        afn = _d(line.base_debit) if _d(line.debit) > 0 else _d(line.base_credit)
        side = 'debit' if _d(line.debit) > 0 else 'credit'
        reference = journal.reference_number or ''
        description = line.description or journal.description or ''
        category = gl.category if gl else 'journal'
        if needle:
            hay = ' '.join([
                reference,
                description,
                code,
                name,
                currency.get('code') or '',
                category or '',
            ]).lower()
            if needle not in hay:
                continue
        row = {
            'id': f'jl-{line.id}',
            'section': category,
            'section_label': (gl.get_category_display() if gl else category),
            'record_type': 'journal_line',
            'record_type_label': 'Journal',
            'entry_date': _serialize_entry_date(journal.entry_date),
            'reference_number': reference,
            'description': description,
            'account_code': code,
            'account_name': name,
            'account': f'{code} {name}'.strip(),
            'amount': _float(native),
            'native_amount': _float(native),
            'amount_base': _float(afn),
            'afn_equivalent': _float(afn),
            'exchange_rate': str(line.exchange_rate) if line.exchange_rate is not None else None,
            'currency': currency.get('code'),
            'side': side,
            'debit': _float(line.debit),
            'credit': _float(line.credit),
            'direction': 'in' if side == 'debit' else 'out',
            'is_cash_in': code in ('1000', '1050', '1060') and side == 'debit',
            'is_cash_out': code in ('1000', '1050', '1060') and side == 'credit',
        }
        rows.append(row)

        if row['is_cash_in']:
            cash_in_base += afn
        elif row['is_cash_out']:
            cash_out_base += abs(afn)

        bucket = section_summary.setdefault(category, {
            'section': category,
            'label': row['section_label'],
            'count': 0,
            'amount_base': Decimal('0'),
            'is_cash_movement': code in ('1000', '1050', '1060'),
        })
        bucket['count'] += 1
        bucket['amount_base'] += afn

        curr = by_currency.setdefault(row['currency'] or '—', {
            'currency': row['currency'] or '—',
            'count': 0,
            'cash_in': Decimal('0'),
            'cash_out': Decimal('0'),
        })
        curr['count'] += 1
        if row['is_cash_in']:
            curr['cash_in'] += native
        elif row['is_cash_out']:
            curr['cash_out'] += abs(native)

    base = CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]
    section_list = [
        {
            **item,
            'amount_base': _float(item['amount_base']),
        }
        for item in sorted(section_summary.values(), key=lambda item: item['label'])
    ]
    by_currency_list = [
        {
            'currency': item['currency'],
            'count': item['count'],
            'cash_in': _float(item['cash_in']),
            'cash_out': _float(item['cash_out']),
        }
        for item in sorted(by_currency.values(), key=lambda c: c['currency'])
    ]
    return {
        'rows': rows,
        'totals': {
            'record_count': len(rows),
            'cash_in_base': _float(cash_in_base),
            'cash_out_base': _float(cash_out_base),
            'net_cash_base': _float(cash_in_base - cash_out_base),
            'base_currency_code': base['code'],
        },
        'sections': section_list,
        'by_currency': by_currency_list,
        'base_currency': {
            'id': BASE_CURRENCY_ID,
            'code': base['code'],
            'symbol': base['symbol'],
            'name': base['name'],
        },
        'source': 'journal',
    }, None
