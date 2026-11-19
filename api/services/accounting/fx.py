"""Realized FX on monetary settlement (Phase 3B).

When a foreign-currency receivable, payable, or loan is settled at a rate
different from the original booking rate, recognize realized FX gain/loss
in AFN. The original invoice/loan rate is never rewritten.

This is settlement FX — not a CurrencyExchange document, and not period-end
revaluation (Phase 4).
"""
from decimal import Decimal

from django.core.exceptions import ValidationError

from api.models.data.currency import BASE_CURRENCY_ID
from api.services.accounting.amounts import d
from api.services.accounting.coa import ensure_accounting_ready, get_gl_for_role
from api.services.accounting.journal_fx import (
    historical_table_rate,
    is_base_currency,
    quantize_money,
    quantize_rate,
    trusted_source_rate,
)

ZERO = Decimal('0')
ONE = Decimal('1')

# Receivable-like: cash in settles the claim (AR, loan receivable).
# Payable-like: cash out settles the obligation (AP, loan payable).
MONETARY_RECEIVABLE = 'receivable'
MONETARY_PAYABLE = 'payable'


def _source_datetime(source):
    return (
        getattr(source, 'sale_date', None)
        or getattr(source, 'purchase_date', None)
        or getattr(source, 'loan_date', None)
        or getattr(source, 'payment_date', None)
        or getattr(source, 'expense_date', None)
        or getattr(source, 'date', None)
    )


def carrying_rate(source, currency_id):
    """Historical AFN rate locked on the invoice / loan. Never invents."""
    if is_base_currency(currency_id):
        return ONE
    rate = trusted_source_rate(source, currency_id)
    if rate is not None:
        return rate
    rate = historical_table_rate(currency_id, _source_datetime(source))
    if rate is not None:
        return rate
    raise ValidationError(
        'No historical carrying rate on the settled document. '
        'Cannot compute realized FX without rewriting history.'
    )


def settlement_rate(payment, currency_id, entry_date=None):
    """AFN rate locked on the settlement (payment) document."""
    if is_base_currency(currency_id):
        return ONE
    rate = trusted_source_rate(payment, currency_id)
    if rate is not None:
        return rate
    rate = historical_table_rate(currency_id, entry_date or _source_datetime(payment))
    if rate is not None:
        return rate
    raise ValidationError(
        'No settlement exchange rate on the payment. '
        'Record amount_base / exchange_rate or add an ExchangeRate on/before the payment date.'
    )


def settlement_fx_bases(native_amount, carrying_rate_value, settlement_rate_value):
    """
    Return (carrying_base, settlement_base, settlement_minus_carrying).

    settlement_minus_carrying > 0 means settlement AFN exceeds carrying AFN.
    """
    native = quantize_money(native_amount)
    carry_rate = quantize_rate(carrying_rate_value)
    settle_rate = quantize_rate(settlement_rate_value)
    carrying_base = quantize_money(native * carry_rate)
    settlement_base = quantize_money(native * settle_rate)
    return carrying_base, settlement_base, settlement_base - carrying_base


def realized_fx_line(*, settlement_minus_carrying, monetary_kind, description=None):
    """
    Build a single AFN journal line for realized FX, or None if zero.

    Receivable: higher settlement rate → gain.
    Payable: higher settlement rate → loss.
    """
    delta = d(settlement_minus_carrying)
    if delta == ZERO:
        return None

    if monetary_kind == MONETARY_RECEIVABLE:
        is_gain = delta > ZERO
    elif monetary_kind == MONETARY_PAYABLE:
        is_gain = delta < ZERO
    else:
        raise ValidationError(f'Unknown monetary kind: {monetary_kind}')

    amount = quantize_money(abs(delta))
    ensure_accounting_ready(currency_id=BASE_CURRENCY_ID)

    if is_gain:
        gl = get_gl_for_role(
            'realized_fx_gain',
            currency_id=BASE_CURRENCY_ID,
        )
        return {
            'gl_account': gl,
            'debit': ZERO,
            'credit': amount,
            'currency': BASE_CURRENCY_ID,
            'exchange_rate': ONE,
            'base_debit': ZERO,
            'base_credit': amount,
            'description': description or 'Realized FX gain on settlement',
        }

    gl = get_gl_for_role(
        'realized_fx_loss',
        currency_id=BASE_CURRENCY_ID,
    )
    return {
        'gl_account': gl,
        'debit': amount,
        'credit': ZERO,
        'currency': BASE_CURRENCY_ID,
        'exchange_rate': ONE,
        'base_debit': amount,
        'base_credit': ZERO,
        'description': description or 'Realized FX loss on settlement',
    }


def annotate_settlement_lines(
    *,
    currency_id,
    native_amount,
    cash_gl,
    monetary_gl,
    monetary_kind,
    carrying_rate_value,
    settlement_rate_value,
    cash_is_debit,
    cash_description,
    monetary_description,
):
    """
    Build cash + monetary (+ optional FX) lines with explicit historical rates.

    cash_is_debit=True for receivable collection; False for payable payment.
    """
    native = quantize_money(native_amount)
    carry_rate = quantize_rate(carrying_rate_value)
    settle_rate = quantize_rate(settlement_rate_value)
    carrying_base, settlement_base, delta = settlement_fx_bases(
        native, carry_rate, settle_rate
    )
    currency_id = int(currency_id)

    if cash_is_debit:
        cash_line = {
            'gl_account': cash_gl,
            'debit': native,
            'credit': ZERO,
            'currency': currency_id,
            'exchange_rate': settle_rate,
            'base_debit': settlement_base,
            'base_credit': ZERO,
            'description': cash_description,
        }
        monetary_line = {
            'gl_account': monetary_gl,
            'debit': ZERO,
            'credit': native,
            'currency': currency_id,
            'exchange_rate': carry_rate,
            'base_debit': ZERO,
            'base_credit': carrying_base,
            'description': monetary_description,
        }
    else:
        monetary_line = {
            'gl_account': monetary_gl,
            'debit': native,
            'credit': ZERO,
            'currency': currency_id,
            'exchange_rate': carry_rate,
            'base_debit': carrying_base,
            'base_credit': ZERO,
            'description': monetary_description,
        }
        cash_line = {
            'gl_account': cash_gl,
            'debit': ZERO,
            'credit': native,
            'currency': currency_id,
            'exchange_rate': settle_rate,
            'base_debit': ZERO,
            'base_credit': settlement_base,
            'description': cash_description,
        }

    lines = [cash_line, monetary_line]
    fx_line = realized_fx_line(
        settlement_minus_carrying=delta,
        monetary_kind=monetary_kind,
    )
    if fx_line is not None:
        lines.append(fx_line)
    return lines
