from decimal import Decimal

from api.models.data.currency import BASE_CURRENCY_ID, DEFAULT_USD_TO_AFN_RATE, get_currency_by_code
from api.services.currency_conversion import convert_to_base, get_rate_to_base


def get_usd_to_afn_rate():
    """Return USD→AFN rate from exchange rates or fallback default."""
    from api.models.data.journal import AccountingSettings

    usd = get_currency_by_code('USD')
    if usd:
        try:
            return get_rate_to_base(usd['id'], raise_if_missing=False)
        except Exception:
            pass
    settings = AccountingSettings.get_solo()
    rate = settings.usd_to_afn_rate or DEFAULT_USD_TO_AFN_RATE
    return Decimal(str(rate))


def convert_currency(amount, from_currency_id, to_currency_id, date=None):
    """Convert between currencies using dated exchange rates (via base currency AFN).
    Accepts integer currency ids or legacy ORM objects with .id / .code attributes.
    """
    from django.utils import timezone

    # Normalise to int ids
    if not isinstance(from_currency_id, int):
        from_currency_id = getattr(from_currency_id, 'id', None)
    if not isinstance(to_currency_id, int):
        to_currency_id = getattr(to_currency_id, 'id', None)

    amount = Decimal(str(amount or 0))
    if not from_currency_id or not to_currency_id or from_currency_id == to_currency_id:
        return amount

    at_dt = date or timezone.now()

    if to_currency_id == BASE_CURRENCY_ID:
        converted, _ = convert_to_base(amount, from_currency_id, at_dt, raise_if_missing=False)
        return converted

    if from_currency_id == BASE_CURRENCY_ID:
        rate = get_rate_to_base(to_currency_id, at_dt, raise_if_missing=False)
        if rate:
            return amount / rate
        return amount

    in_base, _ = convert_to_base(amount, from_currency_id, at_dt, raise_if_missing=False)
    rate = get_rate_to_base(to_currency_id, at_dt, raise_if_missing=False)
    if rate:
        return in_base / rate
    return in_base
