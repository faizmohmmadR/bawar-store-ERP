"""Fiscal year lifecycle: bounds, assignment, year-end close, carry-forward."""

import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from api.services.accounting import (
    _credit_normal_amount,
    _debit_normal_amount,
    _d,
    ensure_accounting_ready,
    ensure_default_gl_accounts,
    get_gl_account,
    get_profit_and_loss,
    get_trial_balance,
)
from api.services.report_period import _day_bounds, get_report_timezone


def _settings():
    from api.models.data.journal import AccountingSettings

    return AccountingSettings.get_solo()


def compute_fy_bounds(reference_date: date, *, start_month: int, start_day: int):
    """Return (start_date, end_date) for the fiscal year containing reference_date."""
    start_month = max(1, min(12, int(start_month)))
    max_day = calendar.monthrange(reference_date.year, start_month)[1]
    start_day = max(1, min(max_day, int(start_day)))

    fy_start_this_year = date(reference_date.year, start_month, start_day)
    if reference_date >= fy_start_this_year:
        start = fy_start_this_year
        next_year = reference_date.year + 1
    else:
        start = date(
            reference_date.year - 1,
            start_month,
            min(start_day, calendar.monthrange(reference_date.year - 1, start_month)[1]),
        )
        next_year = reference_date.year

    next_max_day = calendar.monthrange(next_year, start_month)[1]
    next_start = date(next_year, start_month, min(start_day, next_max_day))
    end = next_start - timedelta(days=1)
    return start, end


def fiscal_year_name(start_date: date, end_date: date) -> str:
    return f'FY {start_date.year}/{end_date.year}'


def _to_business_date(value) -> date:
    tz = get_report_timezone()
    if isinstance(value, date) and not hasattr(value, 'hour'):
        return value
    dt = value
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, tz)
    return dt.astimezone(tz).date()


def fy_end_datetime(end_date: date):
    _, end = _day_bounds(end_date, tz=get_report_timezone())
    return end


def get_fiscal_year_for_date(value):
    """Get or create the fiscal year record for a journal entry date."""
    if value is None:
        return None

    from api.models.data.fiscal_year import FiscalYear

    settings = _settings()
    ref = _to_business_date(value)
    start, end = compute_fy_bounds(
        ref,
        start_month=settings.fiscal_year_start_month,
        start_day=settings.fiscal_year_start_day,
    )
    fy, _ = FiscalYear.objects.get_or_create(
        start_date=start,
        end_date=end,
        defaults={
            'name': fiscal_year_name(start, end),
            'status': FiscalYear.STATUS_OPEN,
        },
    )
    return fy


def assign_fiscal_year_to_entry(entry):
    fy = get_fiscal_year_for_date(entry.entry_date)
    if fy and entry.fiscal_year_id != fy.id:
        entry.fiscal_year = fy
        entry.save(update_fields=['fiscal_year'])
    return fy


def assert_fiscal_year_open_for_date(value):
    """Raise ValidationError if posting to a closed fiscal year."""
    from api.models.data.fiscal_year import FiscalYear

    fy = get_fiscal_year_for_date(value)
    if fy and fy.status == FiscalYear.STATUS_CLOSED:
        raise ValidationError(
            f'Fiscal year {fy.name} is closed. Cannot post transactions for this period.'
        )
    return fy


def ensure_retained_earnings_account():
    return get_gl_account('3200')


def ensure_current_fiscal_year():
    """Ensure the open fiscal year for today exists and is marked current."""
    from api.models.data.fiscal_year import FiscalYear

    ensure_accounting_ready()
    settings = _settings()
    today = timezone.now().astimezone(get_report_timezone()).date()
    start, end = compute_fy_bounds(
        today,
        start_month=settings.fiscal_year_start_month,
        start_day=settings.fiscal_year_start_day,
    )

    fy, _ = FiscalYear.objects.get_or_create(
        start_date=start,
        end_date=end,
        defaults={
            'name': fiscal_year_name(start, end),
            'status': FiscalYear.STATUS_OPEN,
            'is_current': True,
        },
    )

    if fy.status == FiscalYear.STATUS_CLOSED:
        raise ValidationError(
            f'Current calendar period falls in closed fiscal year {fy.name}. '
            'Close workflow may be incomplete — contact support.'
        )

    if not fy.is_current or settings.current_fiscal_year_id != fy.id:
        FiscalYear.objects.filter(is_current=True).exclude(pk=fy.pk).update(is_current=False)
        fy.is_current = True
        fy.save(update_fields=['is_current'])
        settings.current_fiscal_year = fy
        settings.save(update_fields=['current_fiscal_year'])

    backfill_journal_fiscal_years()
    return fy


def backfill_journal_fiscal_years():
    from api.models.data.journal import JournalEntry

    for entry in JournalEntry.objects.filter(fiscal_year__isnull=True).iterator():
        assign_fiscal_year_to_entry(entry)


def get_fiscal_year_by_id(fy_id):
    from api.models.data.fiscal_year import FiscalYear

    if not fy_id:
        return None
    return FiscalYear.objects.filter(pk=fy_id).first()


def resolve_fiscal_year_period(*, fiscal_year_id=None, use_current=False):
    """Return inclusive UTC datetimes for a fiscal year date range."""
    settings = _settings()
    fy = None
    if fiscal_year_id:
        fy = get_fiscal_year_by_id(fiscal_year_id)
    elif use_current:
        fy = settings.current_fiscal_year or ensure_current_fiscal_year()
    if not fy:
        return None, None

    tz = get_report_timezone()
    start, _ = _day_bounds(fy.start_date, tz=tz)
    _, end = _day_bounds(fy.end_date, tz=tz)
    return start, end


def current_fiscal_year_bounds_to_date():
    """Fiscal year start through today (for 'yearly' preset)."""
    settings = _settings()
    today = timezone.now().astimezone(get_report_timezone()).date()
    fy_start, _ = compute_fy_bounds(
        today,
        start_month=settings.fiscal_year_start_month,
        start_day=settings.fiscal_year_start_day,
    )
    tz = get_report_timezone()
    start, _ = _day_bounds(fy_start, tz=tz)
    _, end = _day_bounds(today, tz=tz)
    return start, end


def build_carry_forward_snapshot(fy):
    """Balance sheet positions that continue into the next fiscal year."""
    end_dt = fy_end_datetime(fy.end_date)
    trial = get_trial_balance(start_date=None, end_date=end_dt)

    assets = []
    liabilities = []
    equity = []
    for row in trial['rows']:
        category = row['category']
        if category == 'asset':
            amount = _debit_normal_amount(row)
            if amount:
                assets.append({'code': row['code'], 'name': row['name'], 'amount': amount})
        elif category == 'liability':
            amount = _credit_normal_amount(row)
            if amount:
                liabilities.append({'code': row['code'], 'name': row['name'], 'amount': amount})
        elif category == 'equity':
            amount = _credit_normal_amount(row)
            if amount:
                equity.append({'code': row['code'], 'name': row['name'], 'amount': amount})

    from api.models.data.stock import Stock

    stock_lots = Stock.objects.filter(liter_amount__gt=0).count()

    total_assets = sum((row['amount'] for row in assets), Decimal('0'))
    total_liabilities = sum((row['amount'] for row in liabilities), Decimal('0'))
    total_equity = sum((row['amount'] for row in equity), Decimal('0'))

    return {
        'fiscal_year_id': fy.id,
        'fiscal_year': fy.name,
        'end_date': fy.end_date.isoformat(),
        'total_assets': total_assets,
        'total_liabilities': total_liabilities,
        'total_equity': total_equity,
        'assets': assets,
        'liabilities': liabilities,
        'equity': equity,
        'open_stock_lots': stock_lots,
    }


def serialize_fiscal_year(fy, *, include_carry_forward=False):
    from api.models.data.fiscal_year import FiscalYear

    data = {
        'id': fy.id,
        'name': fy.name,
        'start_date': fy.start_date.isoformat(),
        'end_date': fy.end_date.isoformat(),
        'status': fy.status,
        'status_display': fy.get_status_display(),
        'is_current': fy.is_current,
        'net_income': fy.net_income,
        'closed_at': fy.closed_at.isoformat() if fy.closed_at else None,
        'closing_journal_id': fy.closing_journal_id,
        'notes': fy.notes,
    }
    if include_carry_forward and fy.status == FiscalYear.STATUS_CLOSED:
        data['carry_forward'] = build_carry_forward_snapshot(fy)
    return data


@transaction.atomic
def close_fiscal_year(fy_id, *, user=None, notes=''):
    """
    Close a fiscal year:
    1. Post closing journal (revenue/expense → retained earnings)
    2. Mark year closed
    3. Open next fiscal year and set as current

    Balance sheet accounts (cash, AR, AP, inventory, loans) carry forward
    automatically — no duplicate entries required.
    """
    from api.models.data.fiscal_year import FiscalYear
    from api.models.data.journal import GLAccount, JournalEntry, JournalLine

    ensure_accounting_ready()
    re_account = ensure_retained_earnings_account()
    if not re_account:
        raise ValidationError('Retained Earnings account (3200) is not configured.')

    fy = FiscalYear.objects.select_for_update().filter(pk=fy_id).first()
    if not fy:
        raise ValidationError('Fiscal year not found.')
    if fy.status == FiscalYear.STATUS_CLOSED:
        raise ValidationError(f'{fy.name} is already closed.')

    settings = _settings()
    if settings.current_fiscal_year_id and settings.current_fiscal_year_id != fy.id:
        if fy.end_date >= (settings.current_fiscal_year.end_date if settings.current_fiscal_year else date.min):
            pass
    if fy.end_date > timezone.now().astimezone(get_report_timezone()).date():
        raise ValidationError('Cannot close a fiscal year that has not ended yet.')

    pl = get_profit_and_loss(start_date=fy.start_date, end_date=fy.end_date)
    net_income = pl['net_income']

    closing_lines = []
    for acc in pl['revenue_accounts']:
        gl = GLAccount.objects.get(pk=acc['gl_account_id'])
        closing_lines.append({
            'gl_account': gl,
            'debit': acc['amount'],
            'credit': Decimal('0'),
            'description': 'Year-end close — revenue',
        })
    for acc in pl['expense_accounts']:
        gl = GLAccount.objects.get(pk=acc['gl_account_id'])
        closing_lines.append({
            'gl_account': gl,
            'debit': Decimal('0'),
            'credit': acc['amount'],
            'description': 'Year-end close — expense',
        })

    if net_income > 0:
        closing_lines.append({
            'gl_account': re_account,
            'debit': Decimal('0'),
            'credit': net_income,
            'description': 'Net income transferred to retained earnings',
        })
    elif net_income < 0:
        closing_lines.append({
            'gl_account': re_account,
            'debit': abs(net_income),
            'credit': Decimal('0'),
            'description': 'Net loss transferred to retained earnings',
        })

    closing_journal = None
    if closing_lines:
        total_debit = sum(_d(line['debit']) for line in closing_lines)
        total_credit = sum(_d(line['credit']) for line in closing_lines)
        if total_debit != total_credit:
            raise ValidationError(
                f'Closing entry is unbalanced (debit {total_debit}, credit {total_credit}).'
            )

        closing_journal = JournalEntry.objects.create(
            entry_date=fy_end_datetime(fy.end_date),
            reference_number=f'FY-CLOSE-{fy.start_date.year}',
            description=f'Year-end closing entry for {fy.name}',
            is_auto=False,
            is_closing_entry=True,
            fiscal_year=fy,
        )
        from api.services.accounting.journal_fx import prepare_posted_line

        close_date = fy_end_datetime(fy.end_date)
        for line in closing_lines:
            prepared = prepare_posted_line(line, source=None, entry_date=close_date)
            JournalLine.objects.create(
                journal_entry=closing_journal,
                **prepared,
            )

    carry_forward = build_carry_forward_snapshot(fy)

    fy.status = FiscalYear.STATUS_CLOSED
    fy.closed_at = timezone.now()
    fy.closed_by = user
    fy.closing_journal = closing_journal
    fy.net_income = net_income
    if notes:
        fy.notes = notes
    fy.is_current = False
    fy.save()

    next_start = fy.end_date + timedelta(days=1)
    next_fy_start, next_fy_end = compute_fy_bounds(
        next_start,
        start_month=settings.fiscal_year_start_month,
        start_day=settings.fiscal_year_start_day,
    )

    next_fy, _ = FiscalYear.objects.get_or_create(
        start_date=next_fy_start,
        end_date=next_fy_end,
        defaults={
            'name': fiscal_year_name(next_fy_start, next_fy_end),
            'status': FiscalYear.STATUS_OPEN,
            'is_current': True,
        },
    )
    FiscalYear.objects.filter(is_current=True).exclude(pk=next_fy.pk).update(is_current=False)
    next_fy.is_current = True
    next_fy.save(update_fields=['is_current'])

    settings.current_fiscal_year = next_fy
    settings.save(update_fields=['current_fiscal_year'])

    return {
        'closed_fiscal_year': serialize_fiscal_year(fy),
        'next_fiscal_year': serialize_fiscal_year(next_fy),
        'net_income': net_income,
        'closing_journal_id': closing_journal.pk if closing_journal else None,
        'carry_forward': carry_forward,
        'profit_and_loss': {
            'revenue': pl['revenue'],
            'expenses': pl['expenses'],
            'net_income': net_income,
        },
    }
