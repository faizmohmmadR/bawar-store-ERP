"""Money helpers for journal posting (native per-currency books + AFN helpers)."""
from decimal import Decimal


def d(value):
    return Decimal(str(value or 0))


def _transaction_datetime(obj):
    return (
        getattr(obj, 'sale_date', None)
        or getattr(obj, 'purchase_date', None)
        or getattr(obj, 'payment_date', None)
        or getattr(obj, 'expense_date', None)
        or getattr(obj, 'return_date', None)
        or getattr(obj, 'loan_date', None)
        or getattr(obj, 'acquired_date', None)
        or getattr(obj, 'date', None)
    )


def amount_base(obj, field, *, raise_if_missing=True):
    """
    Return the base-currency (AFN) value for a monetary field.

    Priority:
      1. Stored {field}_base when populated (non-zero, or amount is zero)
      2. For base currency (or missing currency): raw field value
      3. field * exchange_rate when rate is a real FX rate (> 0) AND
         either rate != 1 or stored base was explicitly populated
      4. Live conversion via ExchangeRate for non-base currencies

    Never silently treat a foreign-currency amount as AFN when the rate
    is missing (model default exchange_rate=1 is not trusted alone).
    """
    from api.models.data.currency import BASE_CURRENCY_ID

    raw = d(getattr(obj, field, 0))
    currency = transaction_currency(obj)
    currency_id = int(currency) if currency is not None else None
    is_base = currency_id is None or currency_id == BASE_CURRENCY_ID

    base_field = f'{field}_base'
    if hasattr(obj, base_field):
        val = getattr(obj, base_field, None)
        if val is not None:
            base_val = d(val)
            # Default 0 with non-zero amount means "not populated yet"
            if base_val != 0 or raw == 0:
                return base_val

    if raw == 0:
        return Decimal('0')

    if is_base:
        return raw

    rate = d(getattr(obj, 'exchange_rate', 0) or 0)
    # Trust explicit rates only when they look like real FX (not the default 1)
    # or when *_base was already handled above.
    if rate > 0 and rate != Decimal('1'):
        return raw * rate

    from api.services.currency_conversion import convert_to_base

    base, used_rate = convert_to_base(
        raw,
        currency_id,
        _transaction_datetime(obj),
        raise_if_missing=raise_if_missing,
    )
    # Missing-rate soft path returns rate=1 — never treat foreign as AFN for posting
    if (
        not raise_if_missing
        and used_rate == Decimal('1')
        and currency_id != BASE_CURRENCY_ID
        and d(getattr(obj, 'exchange_rate', 0) or 0) in (0, Decimal('1'))
    ):
        return Decimal('0')

    return base


def amount_native(obj, field):
    """Transaction-currency amount (no FX conversion)."""
    return d(getattr(obj, field, 0))


def source_currency_id(obj):
    """Currency id for the transaction's own books (defaults to AFN)."""
    from api.models.data.currency import BASE_CURRENCY_ID

    currency = transaction_currency(obj)
    if currency is None:
        return BASE_CURRENCY_ID
    return int(currency)


def convert_base_to_txn(amount_afn, obj, *, raise_if_missing=True):
    """
    Convert an AFN amount into the transaction currency.
    Used for inventory/COGS (stored in AFN) when posting into non-AFN books.
    """
    from api.models.data.currency import BASE_CURRENCY_ID
    from api.services.currency_conversion import _quantize_money, get_rate_to_base

    amount_afn = d(amount_afn)
    if amount_afn == 0:
        return Decimal('0')

    currency_id = source_currency_id(obj)
    if currency_id == BASE_CURRENCY_ID:
        return amount_afn

    rate = d(getattr(obj, 'exchange_rate', 0) or 0)
    if rate <= 0:
        rate = d(
            get_rate_to_base(
                currency_id,
                _transaction_datetime(obj),
                raise_if_missing=raise_if_missing,
            )
        )
    if rate <= 0:
        return Decimal('0')
    return _quantize_money(amount_afn / rate)


def cogs_in_txn_currency(obj, cogs_afn):
    """COGS unit costs are AFN; express them in the transaction currency for that book."""
    return convert_base_to_txn(cogs_afn, obj)


def cogs_base(cogs_txn):
    """unit_cost is stored in AFN (base currency) — no conversion needed."""
    return d(cogs_txn)


def transaction_currency(obj):
    """Resolve currency integer id (supports legacy payroll `curency`)."""
    return getattr(obj, 'currency', None) or getattr(obj, 'curency', None)


    return None
