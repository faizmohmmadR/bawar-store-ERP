"""USD reporting equivalents of AFN inventory costs; never change ledger values."""
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone


def usd_cost_rate(at_datetime=None):
    # Unlike general invoice lookup, cost reporting never invents a 1:1 rate
    # or uses a future rate for a historical transaction.
    from api.models.data.currency import ExchangeRate
    from api.services.currency_conversion import _rate_lookup_cutoff

    rate = ExchangeRate.objects.filter(
        from_currency=2, to_currency=1, is_active=True, rate__gt=0,
        date__lte=_rate_lookup_cutoff(at_datetime or timezone.now()),
    ).order_by('-date', '-id').values_list('rate', flat=True).first()
    return rate


def usd_amount(amount, rate):
    if amount is None or rate is None or Decimal(str(rate)) <= 0:
        return None
    return format((Decimal(str(amount)) / Decimal(str(rate))).quantize(
        Decimal('0.000001'), rounding=ROUND_HALF_UP), 'f')
