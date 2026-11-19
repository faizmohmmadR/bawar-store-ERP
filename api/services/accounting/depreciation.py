"""Monthly straight-line depreciation for equipment assets."""
from calendar import monthrange
from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from api.models.data.currency import BASE_CURRENCY_ID
from api.services.accounting.amounts import d
from api.services.accounting.coa import ensure_accounting_ready, gl_for_source
from api.services.accounting.posting import replace_journal_for_source

ZERO = Decimal('0')
CENT = Decimal('0.01')


def _money(value):
    return d(value).quantize(CENT, rounding=ROUND_HALF_UP)


def _as_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return timezone.localdate(value) if timezone.is_aware(value) else value.date()
    return value


def _period_end(as_of_date):
    as_of = _as_date(as_of_date) or timezone.localdate()
    last_day = monthrange(as_of.year, as_of.month)[1]
    return date(as_of.year, as_of.month, last_day)


def _entry_datetime(period_end):
    return timezone.make_aware(
        datetime.combine(period_end, time.max.replace(microsecond=0)),
        timezone.get_current_timezone(),
    )


def monthly_depreciation_amount(equipment):
    """Straight-line monthly amount from cost, residual, and useful life."""
    life = int(getattr(equipment, 'useful_life_months', 0) or 0)
    if life <= 0:
        return ZERO
    cost = d(equipment.quantity) * d(equipment.unit_cost)
    residual = d(getattr(equipment, 'residual_value', 0))
    depreciable = cost - residual
    if depreciable <= 0:
        return ZERO
    return _money(depreciable / Decimal(life))


def remaining_depreciable(equipment):
    cost = d(equipment.quantity) * d(equipment.unit_cost)
    residual = d(getattr(equipment, 'residual_value', 0))
    accumulated = d(getattr(equipment, 'accumulated_depreciation', 0))
    return max(ZERO, cost - residual - accumulated)


def sync_equipment_depreciation_journal(equipment, *, period_end):
    """
    Post one month of depreciation for an asset:
      Dr Depreciation Expense 5150 · Cr Accumulated Depreciation 1410
    Uses replace_all=False so the acquisition journal is kept.
    """
    if not ensure_accounting_ready(currency_id=BASE_CURRENCY_ID):
        return None

    acq = getattr(equipment, 'acquisition_type', None) or 'new_purchase'
    if acq == 'expense' or getattr(equipment, 'record_as_expense', False):
        return None
    if not getattr(equipment, 'is_active', True):
        return None

    period_end = _period_end(period_end)
    start = _as_date(getattr(equipment, 'depreciation_start_date', None)) or _as_date(
        getattr(equipment, 'acquired_date', None)
    )
    if start and period_end < start:
        return None

    amount = monthly_depreciation_amount(equipment)
    remaining = remaining_depreciable(equipment)
    if amount <= 0 or remaining <= 0:
        return None
    amount = min(amount, remaining)

    class _Ctx:
        pass

    ctx = _Ctx()
    ctx.currency = getattr(equipment, 'currency', None) or BASE_CURRENCY_ID

    expense_gl = gl_for_source('depreciation_expense', ctx)
    accum_gl = gl_for_source('accumulated_depreciation', ctx)
    if not expense_gl or not accum_gl:
        raise ValueError('Depreciation GL accounts are missing.')

    period_key = period_end.strftime('%Y%m')
    reference = f'DEP-EQ-{equipment.pk}-{period_key}'
    from django.contrib.contenttypes.models import ContentType
    from api.models.data.journal import JournalEntry

    existing = JournalEntry.objects.filter(
        content_type=ContentType.objects.get_for_model(equipment),
        object_id=equipment.pk,
        is_auto=True,
        reference_number=reference,
    ).first()
    if existing:
        return existing

    entry_date = _entry_datetime(period_end)
    one = Decimal('1')
    lines = [
        {
            'gl_account': expense_gl,
            'debit': amount,
            'credit': ZERO,
            'currency': BASE_CURRENCY_ID,
            'exchange_rate': one,
            'base_debit': amount,
            'base_credit': ZERO,
            'description': f'Depreciation — {equipment.name}',
        },
        {
            'gl_account': accum_gl,
            'debit': ZERO,
            'credit': amount,
            'currency': BASE_CURRENCY_ID,
            'exchange_rate': one,
            'base_debit': ZERO,
            'base_credit': amount,
            'description': f'Accumulated depreciation — {equipment.name}',
        },
    ]
    journal = replace_journal_for_source(
        equipment,
        entry_date=entry_date,
        reference_number=reference,
        description=f'Depreciation {period_end.strftime("%Y-%m")} — {equipment.name}',
        replace_all=False,
        lines=lines,
    )
    Equipment = equipment.__class__
    Equipment.objects.filter(pk=equipment.pk).update(
        accumulated_depreciation=_money(d(equipment.accumulated_depreciation) + amount),
    )
    equipment.accumulated_depreciation = _money(
        d(equipment.accumulated_depreciation) + amount
    )
    return journal


@transaction.atomic
def run_monthly_depreciation(*, as_of_date=None):
    """Run straight-line depreciation for all depreciable active equipment."""
    from api.models.data.equipment import Equipment

    period_end = _period_end(as_of_date)
    posted = 0
    skipped = 0
    for equipment in Equipment.objects.select_for_update().filter(is_active=True).order_by('id'):
        before = d(equipment.accumulated_depreciation)
        journal = sync_equipment_depreciation_journal(equipment, period_end=period_end)
        equipment.refresh_from_db(fields=['accumulated_depreciation'])
        if journal is not None and d(equipment.accumulated_depreciation) > before:
            posted += 1
        else:
            skipped += 1
    return {
        'period_end': period_end.isoformat(),
        'posted': posted,
        'skipped': skipped,
    }
