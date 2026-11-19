"""Period-end FX revaluation / unrealized FX (Phase 4).

Revalues open monetary foreign-currency balances at a closing rate.
Native amounts are unchanged. AFN carrying (base_debit/base_credit) is
adjusted via base-only journal lines. Inventory is never revalued.

Runs are idempotent: one FxRevaluation per (as_of_date); re-posting
deletes and rebuilds that document's journal.
"""
from datetime import datetime, time
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS, get_currency
from api.services.accounting.amounts import d
from api.services.accounting.coa import ensure_accounting_ready, get_gl_for_role
from api.services.accounting.journal_fx import (
    historical_table_rate,
    is_base_currency,
    quantize_money,
    quantize_rate,
)
from api.services.accounting.posting import delete_journal_for_source, replace_journal_for_source

ZERO = Decimal('0')
ONE = Decimal('1')

# Monetary GL codes only — inventory (1100) intentionally excluded.
MONETARY_ASSET_CODES = ('1000', '1050', '1060', '1200', '1300', '1310')
MONETARY_LIABILITY_CODES = ('2000', '2100')


def _as_of_datetime(as_of_date):
    """Inclusive end of as_of_date in the current timezone."""
    if isinstance(as_of_date, datetime):
        return as_of_date
    dt = datetime.combine(as_of_date, time(23, 59, 59, 999999))
    if timezone.is_naive(dt):
        return timezone.make_aware(dt)
    return dt


def _currency_code(currency_id):
    return (get_currency(currency_id) or {}).get('code', str(currency_id))


def closing_rate_for(currency_id, as_of_date):
    if is_base_currency(currency_id):
        return ONE
    rate = historical_table_rate(currency_id, _as_of_datetime(as_of_date))
    if rate is None:
        raise ValidationError(
            f'No closing exchange rate for {_currency_code(currency_id)} → AFN '
            f'on or before {as_of_date}. Add an ExchangeRate before revaluing.'
        )
    return quantize_rate(rate)


def _account_balances_as_of(gl, as_of_dt, *, exclude_source=None, line_currency_id=None):
    from api.models.data.journal import JournalLine

    qs = JournalLine.objects.filter(
        gl_account=gl,
        journal_entry__entry_date__lte=as_of_dt,
    )
    if line_currency_id is not None:
        qs = qs.filter(currency=int(line_currency_id))
    if exclude_source is not None and getattr(exclude_source, 'pk', None):
        from django.contrib.contenttypes.models import ContentType

        ct = ContentType.objects.get_for_model(exclude_source)
        qs = qs.exclude(
            journal_entry__content_type=ct,
            journal_entry__object_id=exclude_source.pk,
            journal_entry__is_auto=True,
        )
    agg = qs.aggregate(
        native_debit=Sum('debit'),
        native_credit=Sum('credit'),
        base_debit=Sum('base_debit'),
        base_credit=Sum('base_credit'),
    )
    return (
        d(agg['native_debit']),
        d(agg['native_credit']),
        d(agg['base_debit']),
        d(agg['base_credit']),
    )


def _build_adjustment_lines(
    *,
    gl,
    code,
    category_side,
    closing_rate,
    as_of_dt,
    exclude_source,
    line_currency_id,
):
    """Return journal lines adjusting AFN carrying for one monetary GL, or []."""
    native_debit, native_credit, base_debit, base_credit = _account_balances_as_of(
        gl,
        as_of_dt,
        exclude_source=exclude_source,
        line_currency_id=line_currency_id,
    )
    currency_id = int(line_currency_id)
    if is_base_currency(currency_id):
        return []

    if category_side == 'asset':
        native_net = native_debit - native_credit
        carrying_base = base_debit - base_credit
    else:
        native_net = native_credit - native_debit
        carrying_base = base_credit - base_debit

    if native_net == ZERO:
        return []

    target_base = quantize_money(native_net * closing_rate)
    adjustment = quantize_money(target_base - carrying_base)
    if adjustment == ZERO:
        return []

    ensure_accounting_ready( currency_id=BASE_CURRENCY_ID)
    ccode = _currency_code(currency_id)
    lines = []

    if category_side == 'asset':
        if adjustment > ZERO:
            # Increase asset carrying → unrealized gain
            lines.append({
                'gl_account': gl,
                'debit': ZERO,
                'credit': ZERO,
                'currency': currency_id,
                'exchange_rate': closing_rate,
                'base_debit': adjustment,
                'base_credit': ZERO,
                'description': f'FX revaluation {code} {ccode}',
            })
            gain_gl = get_gl_for_role(
                'unrealized_fx_gain',
                
                currency_id=BASE_CURRENCY_ID,
            )
            lines.append({
                'gl_account': gain_gl,
                'debit': ZERO,
                'credit': adjustment,
                'currency': BASE_CURRENCY_ID,
                'exchange_rate': ONE,
                'base_debit': ZERO,
                'base_credit': adjustment,
                'description': f'Unrealized FX gain {code} {ccode}',
            })
        else:
            loss = -adjustment
            lines.append({
                'gl_account': gl,
                'debit': ZERO,
                'credit': ZERO,
                'currency': currency_id,
                'exchange_rate': closing_rate,
                'base_debit': ZERO,
                'base_credit': loss,
                'description': f'FX revaluation {code} {ccode}',
            })
            loss_gl = get_gl_for_role(
                'unrealized_fx_loss',
                
                currency_id=BASE_CURRENCY_ID,
            )
            lines.append({
                'gl_account': loss_gl,
                'debit': loss,
                'credit': ZERO,
                'currency': BASE_CURRENCY_ID,
                'exchange_rate': ONE,
                'base_debit': loss,
                'base_credit': ZERO,
                'description': f'Unrealized FX loss {code} {ccode}',
            })
    else:
        # Liability: higher AFN carrying → unrealized loss
        if adjustment > ZERO:
            lines.append({
                'gl_account': gl,
                'debit': ZERO,
                'credit': ZERO,
                'currency': currency_id,
                'exchange_rate': closing_rate,
                'base_debit': ZERO,
                'base_credit': adjustment,
                'description': f'FX revaluation {code} {ccode}',
            })
            loss_gl = get_gl_for_role(
                'unrealized_fx_loss',
                
                currency_id=BASE_CURRENCY_ID,
            )
            lines.append({
                'gl_account': loss_gl,
                'debit': adjustment,
                'credit': ZERO,
                'currency': BASE_CURRENCY_ID,
                'exchange_rate': ONE,
                'base_debit': adjustment,
                'base_credit': ZERO,
                'description': f'Unrealized FX loss {code} {ccode}',
            })
        else:
            gain = -adjustment
            lines.append({
                'gl_account': gl,
                'debit': ZERO,
                'credit': ZERO,
                'currency': currency_id,
                'exchange_rate': closing_rate,
                'base_debit': gain,
                'base_credit': ZERO,
                'description': f'FX revaluation {code} {ccode}',
            })
            gain_gl = get_gl_for_role(
                'unrealized_fx_gain',
                
                currency_id=BASE_CURRENCY_ID,
            )
            lines.append({
                'gl_account': gain_gl,
                'debit': ZERO,
                'credit': gain,
                'currency': BASE_CURRENCY_ID,
                'exchange_rate': ONE,
                'base_debit': ZERO,
                'base_credit': gain,
                'description': f'Unrealized FX gain {code} {ccode}',
            })

    return lines


def build_revaluation_lines(revaluation):
    """Compute all journal lines for a revaluation document (without posting)."""
    from api.services.accounting.coa import get_gl_account

    as_of_dt = _as_of_datetime(revaluation.as_of_date)
    closing_rates = {}
    rate_cache = {}
    lines = []

    def rate_for(currency_id):
        if currency_id not in rate_cache:
            rate_cache[currency_id] = closing_rate_for(currency_id, revaluation.as_of_date)
            closing_rates[str(currency_id)] = str(rate_cache[currency_id])
        return rate_cache[currency_id]

    for currency_id in CURRENCY_DEFINITIONS:
        if is_base_currency(currency_id):
            continue
        ensure_accounting_ready( currency_id=currency_id)

        for code in MONETARY_ASSET_CODES:
            gl = get_gl_account(code,  currency_id=currency_id)
            if not gl:
                continue
            native_debit, native_credit, _, _ = _account_balances_as_of(
                gl, as_of_dt, exclude_source=revaluation, line_currency_id=currency_id
            )
            if native_debit - native_credit == ZERO:
                continue
            lines.extend(
                _build_adjustment_lines(
                    
                    gl=gl,
                    code=code,
                    category_side='asset',
                    closing_rate=rate_for(currency_id),
                    as_of_dt=as_of_dt,
                    exclude_source=revaluation,
                    line_currency_id=currency_id,
                )
            )

        for code in MONETARY_LIABILITY_CODES:
            gl = get_gl_account(code,  currency_id=currency_id)
            if not gl:
                continue
            native_debit, native_credit, _, _ = _account_balances_as_of(
                gl, as_of_dt, exclude_source=revaluation, line_currency_id=currency_id
            )
            if native_credit - native_debit == ZERO:
                continue
            lines.extend(
                _build_adjustment_lines(
                    
                    gl=gl,
                    code=code,
                    category_side='liability',
                    closing_rate=rate_for(currency_id),
                    as_of_dt=as_of_dt,
                    exclude_source=revaluation,
                    line_currency_id=currency_id,
                )
            )

    return lines, closing_rates


def _totals_from_lines(lines):
    gain = ZERO
    loss = ZERO
    for line in lines:
        desc = (line.get('description') or '')
        if 'Unrealized FX gain' in desc:
            gain += d(line.get('credit', 0))
        elif 'Unrealized FX loss' in desc:
            loss += d(line.get('debit', 0))
    return quantize_money(gain), quantize_money(loss)


@transaction.atomic
def sync_fx_revaluation_journal(revaluation):
    if revaluation.status != revaluation.STATUS_POSTED:
        delete_journal_for_source(revaluation)
        if revaluation.total_gain or revaluation.total_loss or revaluation.closing_rates:
            type(revaluation).objects.filter(pk=revaluation.pk).update(
                total_gain=ZERO,
                total_loss=ZERO,
                closing_rates={},
            )
        return None

    ensure_accounting_ready( currency_id=BASE_CURRENCY_ID)
    # Drop prior journal first so carrying excludes this run (idempotent rebuild).
    delete_journal_for_source(revaluation)

    lines, closing_rates = build_revaluation_lines(revaluation)
    total_gain, total_loss = _totals_from_lines(lines)

    type(revaluation).objects.filter(pk=revaluation.pk).update(
        closing_rates=closing_rates,
        total_gain=total_gain,
        total_loss=total_loss,
    )
    revaluation.closing_rates = closing_rates
    revaluation.total_gain = total_gain
    revaluation.total_loss = total_loss

    if not lines:
        return None

    entry_dt = _as_of_datetime(revaluation.as_of_date)
    return replace_journal_for_source(
        revaluation,
        entry_date=entry_dt,
        reference_number=f'FXREV-{revaluation.as_of_date.isoformat()}',
        description=(
            revaluation.notes
            or f'Period-end FX revaluation as of {revaluation.as_of_date.isoformat()}'
        ),
        lines=lines,
    )


@transaction.atomic
def run_fx_revaluation(*, as_of_date, created_by=None, notes=None, status='posted'):
    from api.models.data.fx_revaluation import FxRevaluation

    reval, _created = FxRevaluation.objects.get_or_create(
        
        as_of_date=as_of_date,
        defaults={
            'status': status,
            'notes': notes or '',
            'created_by': created_by,
        },
    )
    update_fields = []
    if notes is not None and reval.notes != notes:
        reval.notes = notes
        update_fields.append('notes')
    if status and reval.status != status:
        reval.status = status
        update_fields.append('status')
        if status == FxRevaluation.STATUS_POSTED and reval.posted_at is None:
            reval.posted_at = timezone.now()
            update_fields.append('posted_at')
    if created_by and not reval.created_by_id:
        reval.created_by = created_by
        update_fields.append('created_by')
    if update_fields:
        reval.save(update_fields=update_fields)
    else:
        # Touch updated_at and force journal rebuild even when fields unchanged.
        reval.save()

    return reval
