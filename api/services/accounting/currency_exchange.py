"""Currency Exchange posting (Phase 3).

Moves real cash/bank/sarafi between currency-specific GL accounts.
Native Dr=Cr is not required. Functional (AFN) amounts must balance,
including realized FX when carrying value differs from the deal.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db.models import Sum

from api.models.data.currency import BASE_CURRENCY_ID, get_currency
from api.services.accounting.amounts import d
from api.services.accounting.coa import (
    ensure_accounting_ready,
    get_gl_for_role,
    get_payment_asset_account,
)
from api.services.accounting.journal_fx import (
    historical_table_rate,
    is_base_currency,
    quantize_money,
    quantize_rate,
)
from api.services.accounting.posting import delete_journal_for_source, replace_journal_for_source

ZERO = Decimal('0')
ONE = Decimal('1')
PAYMENT_METHODS = frozenset({'cash', 'bank', 'sarafi'})


def _currency_code(currency_id):
    return (get_currency(currency_id) or {}).get('code', str(currency_id))


def _deal_afn_rate(currency_id, amount, other_currency_id, other_amount, *, explicit, entry_date):
    """1 unit of currency_id = X AFN for this deal."""
    if is_base_currency(currency_id):
        return ONE
    amount = d(amount)
    other_amount = d(other_amount)
    if is_base_currency(other_currency_id) and amount > 0:
        return quantize_rate(other_amount / amount)
    if explicit is not None and d(explicit) > 0:
        return quantize_rate(explicit)
    rate = historical_table_rate(currency_id, entry_date)
    if rate is not None:
        return rate
    raise ValidationError(
        f'No AFN rate for {_currency_code(currency_id)} on this exchange. '
        f'Enter from/to amounts with AFN on one side, or record an ExchangeRate.'
    )


def fill_exchange_rates(exchange):
    """Fill cross rate and AFN deal rates from amounts. Does not invent rates."""
    from_amount = d(getattr(exchange, 'from_amount', 0))
    to_amount = d(getattr(exchange, 'to_amount', 0))
    if from_amount <= 0 or to_amount <= 0:
        raise ValidationError('Exchange amounts must be positive.')
    if int(exchange.from_currency) == int(exchange.to_currency):
        raise ValidationError('from_currency and to_currency must differ.')
    from_method = (exchange.from_method or 'cash')
    to_method = (exchange.to_method or 'cash')
    if from_method not in PAYMENT_METHODS or to_method not in PAYMENT_METHODS:
        raise ValidationError('from_method and to_method must be cash, bank, or sarafi.')
    exchange.from_method = from_method
    exchange.to_method = to_method

    exchange.from_amount = quantize_money(from_amount)
    exchange.to_amount = quantize_money(to_amount)
    stored_rate = getattr(exchange, 'rate', None)
    if stored_rate is None or d(stored_rate) <= 0:
        exchange.rate = quantize_rate(to_amount / from_amount)
    else:
        exchange.rate = quantize_rate(stored_rate)

    entry_date = exchange.exchange_date
    exchange.from_exchange_rate = _deal_afn_rate(
        exchange.from_currency,
        exchange.from_amount,
        exchange.to_currency,
        exchange.to_amount,
        explicit=getattr(exchange, 'from_exchange_rate', None),
        entry_date=entry_date,
    )
    exchange.to_exchange_rate = _deal_afn_rate(
        exchange.to_currency,
        exchange.to_amount,
        exchange.from_currency,
        exchange.from_amount,
        explicit=getattr(exchange, 'to_exchange_rate', None),
        entry_date=entry_date,
    )
    return exchange


def _asset_carrying(currency_id, method, exclude_source=None):
    """Native and AFN carrying of a cash/bank/sarafi account, excluding this document's journal."""
    gl = get_payment_asset_account(
        method or 'cash',
        currency_id=currency_id,
    )
    from api.models.data.journal import JournalLine

    qs = JournalLine.objects.filter(gl_account=gl)
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
    native = d(agg['native_debit']) - d(agg['native_credit'])
    base = d(agg['base_debit']) - d(agg['base_credit'])
    return native, base, gl


def _from_base_book(exchange, from_gl):
    """AFN carrying released by giving up from_amount of FROM-currency cash."""
    native, base, gl = _asset_carrying(
        exchange.from_currency,
        exchange.from_method,
        exclude_source=exchange,
    )
    from_amount = d(exchange.from_amount)
    deal_rate = quantize_rate(exchange.from_exchange_rate)
    if native > 0 and base != 0:
        carrying_rate = quantize_rate(base / native)
        return quantize_money(from_amount * carrying_rate), carrying_rate, gl
    return quantize_money(from_amount * deal_rate), deal_rate, gl or from_gl


def sync_currency_exchange_journal(exchange):
    if exchange.status != exchange.STATUS_POSTED:
        delete_journal_for_source(exchange)
        return None

    
    ensure_accounting_ready( currency_id=exchange.from_currency)
    ensure_accounting_ready( currency_id=exchange.to_currency)
    ensure_accounting_ready( currency_id=BASE_CURRENCY_ID)

    fill_exchange_rates(exchange)

    from_gl = get_payment_asset_account(
        exchange.from_method,
        currency_id=exchange.from_currency,
    )
    to_gl = get_payment_asset_account(
        exchange.to_method,
        currency_id=exchange.to_currency,
    )
    if from_gl is None or to_gl is None:
        raise ValidationError('Cash/bank/sarafi GL accounts are missing for this exchange.')

    from_amount = d(exchange.from_amount)
    to_amount = d(exchange.to_amount)
    to_rate = quantize_rate(exchange.to_exchange_rate)
    to_base = quantize_money(to_amount * to_rate)
    from_base_book, from_line_rate, from_gl = _from_base_book(exchange, from_gl)
    fx = to_base - from_base_book

    from_code = _currency_code(exchange.from_currency)
    to_code = _currency_code(exchange.to_currency)
    description = (
        exchange.notes
        or f'Currency exchange {from_amount} {from_code} → {to_amount} {to_code}'
    )

    lines = [
        {
            'gl_account': to_gl,
            'debit': to_amount,
            'credit': ZERO,
            'currency': int(exchange.to_currency),
            'exchange_rate': to_rate,
            'base_debit': to_base,
            'base_credit': ZERO,
            'description': f'Receive {to_amount} {to_code}',
        },
        {
            'gl_account': from_gl,
            'debit': ZERO,
            'credit': from_amount,
            'currency': int(exchange.from_currency),
            'exchange_rate': from_line_rate,
            'base_debit': ZERO,
            'base_credit': from_base_book,
            'description': f'Give {from_amount} {from_code}',
        },
    ]

    if fx > 0:
        gain_gl = get_gl_for_role(
            'realized_fx_gain',
            
            currency_id=BASE_CURRENCY_ID,
        )
        lines.append({
            'gl_account': gain_gl,
            'debit': ZERO,
            'credit': fx,
            'currency': BASE_CURRENCY_ID,
            'exchange_rate': ONE,
            'base_debit': ZERO,
            'base_credit': fx,
            'description': 'Realized FX gain on currency exchange',
        })
    elif fx < 0:
        loss = -fx
        loss_gl = get_gl_for_role(
            'realized_fx_loss',
            
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
            'description': 'Realized FX loss on currency exchange',
        })

    return replace_journal_for_source(
        exchange,
        entry_date=exchange.exchange_date,
        reference_number=exchange.reference_number or f'FX-{exchange.id}',
        description=description,
        lines=lines,
    )
