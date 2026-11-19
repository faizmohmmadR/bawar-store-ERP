"""
Currency conversion to system base currency (AFN).

Exchange rates are stored as: 1 unit of from_currency = rate units of base currency.
Lookup uses the closest rate on or before the transaction datetime.
currency arguments are integer IDs (1=AFN, 2=USD, 3=KDR).
"""
from datetime import datetime, time as dt_time
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone

from api.models.data.currency import BASE_CURRENCY_ID, get_currency

TWOPLACES = Decimal('0.01')
SIXPLACES = Decimal('0.000001')


def _d(value):
    return Decimal(str(value or 0))


def _quantize_money(value):
    return _d(value).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def _quantize_rate(value):
    return _d(value).quantize(SIXPLACES, rounding=ROUND_HALF_UP)


def _rate_lookup_cutoff(at_datetime):
    """End of the transaction's business calendar day, as UTC.

    UI datetime-local values are naive and stored as UTC, while new documents
    use timezone.now(). Comparing calendar days in REPORT_TIME_ZONE keeps a
    rate entered today valid for today's transactions.
    """
    tz_name = getattr(settings, 'REPORT_TIME_ZONE',
                      None) or settings.TIME_ZONE or 'UTC'
    tz = ZoneInfo(tz_name)
    if timezone.is_naive(at_datetime):
        at_datetime = timezone.make_aware(at_datetime, tz)
    day = at_datetime.astimezone(tz).date()
    end_local = datetime.combine(day, dt_time(23, 59, 59, 999999), tzinfo=tz)
    return end_local.astimezone(ZoneInfo('UTC'))


def get_base_currency_id():
    return BASE_CURRENCY_ID


def get_transaction_currency_id(instance):
    """Return integer currency id from a model instance (handles legacy 'curency')."""
    val = getattr(instance, 'currency', None) or getattr(
        instance, 'curency', None)
    if val is None:
        return None
    # Already an int (new style)
    if isinstance(val, int):
        return val
    # Legacy: ORM object with .id
    return getattr(val, 'id', None)


def lookup_rate_to_base(currency_id, at_datetime=None, *, raise_if_missing=True):
    """Find the exchange rate nearest to at_datetime.

    Prefers the latest rate on or before the business-day cutoff; if none
    exists, falls back to the earliest rate after that date.
    Returns (rate, rate_date) where rate_date may be None for AFN/base.
    """
    from api.models.data.currency import ExchangeRate

    if currency_id is None:
        if raise_if_missing:
            raise ValidationError(
                {'currency': 'Base currency is not configured.'})
        return Decimal('1'), None

    currency_id = int(currency_id)
    if currency_id == BASE_CURRENCY_ID:
        return Decimal('1'), None

    at_datetime = at_datetime or timezone.now()
    cutoff = _rate_lookup_cutoff(at_datetime)

    base_qs = ExchangeRate.objects.filter(
        from_currency=currency_id,
        to_currency=BASE_CURRENCY_ID,
        is_active=True,
    )
    rate_obj = base_qs.filter(date__lte=cutoff).order_by('-date').first()
    if rate_obj is None:
        rate_obj = base_qs.filter(date__gt=cutoff).order_by('date').first()

    if rate_obj:
        return _quantize_rate(rate_obj.rate), rate_obj.date

    if raise_if_missing:
        fc = get_currency(currency_id)
        bc = get_currency(BASE_CURRENCY_ID)
        fc_code = fc['code'] if fc else str(currency_id)
        bc_code = bc['code'] if bc else str(BASE_CURRENCY_ID)
        raise ValidationError({
            'exchange_rate': (
                f'No exchange rate found for {fc_code} → {bc_code} '
                f'near {at_datetime.strftime("%Y-%m-%d %H:%M")}. '
                f'Add a rate in Settings → Exchange Rates.'
            )
        })
    return Decimal('1'), None


def get_rate_to_base(currency_id, at_datetime=None, *, raise_if_missing=True):
    """Return how many base-currency units equal 1 unit of currency_id."""
    rate, _rate_date = lookup_rate_to_base(
        currency_id, at_datetime, raise_if_missing=raise_if_missing,
    )
    return rate


def convert_to_base(amount, currency_id, at_datetime=None, *, raise_if_missing=True):
    """Convert amount to base currency. Returns (base_amount, exchange_rate)."""
    rate = get_rate_to_base(currency_id, at_datetime,
                            raise_if_missing=raise_if_missing)
    base_amount = _quantize_money(_d(amount) * rate)
    return base_amount, rate


def normalize_stock_buy_price(buy_price, currency_id, at_datetime=None, *, raise_if_missing=True):
    """Stock unit prices are always stored in base currency (AFN). Returns (price_in_base, base_currency_id)."""
    rate = Decimal('1')
    if currency_id and int(currency_id) != BASE_CURRENCY_ID:
        rate = get_rate_to_base(
            currency_id, at_datetime, raise_if_missing=raise_if_missing)
    price = (_d(buy_price) * rate).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
    return price, BASE_CURRENCY_ID


def populate_base_amounts(
    instance,
    *,
    amount_fields,
    currency=None,
    at_datetime=None,
    exchange_rate_field='exchange_rate',
    raise_if_missing=True,
):
    """
    Set exchange_rate and {field}_base for each monetary field on instance.
    currency can be an int id or legacy ORM object.
    """
    if currency is None:
        currency = get_transaction_currency_id(instance)
    elif not isinstance(currency, int):
        currency = getattr(currency, 'id', currency)

    if at_datetime is None:
        for attr in ('sale_date', 'purchase_date', 'payment_date', 'expense_date',
                     'return_date', 'loan_date', 'payroll_date'):
            if hasattr(instance, attr):
                at_datetime = getattr(instance, attr)
                break
        if at_datetime is None:
            at_datetime = timezone.now()

    rate = get_rate_to_base(currency, at_datetime,
                            raise_if_missing=raise_if_missing)
    if hasattr(instance, exchange_rate_field):
        setattr(instance, exchange_rate_field, rate)

    for field in amount_fields:
        if not hasattr(instance, field):
            continue
        base_field = f'{field}_base'
        if not hasattr(instance, base_field):
            continue
        amount = getattr(instance, field, None)
        if amount is None:
            continue
        setattr(instance, base_field, _quantize_money(_d(amount) * rate))

    return rate


def populate_loan_payment_base(instance, *, raise_if_missing=True):
    """LoanPayment uses the loan's currency and its own payment_date."""
    loan = instance.loan
    currency_id = get_transaction_currency_id(loan) if loan else None
    at_datetime = instance.payment_date or timezone.now()
    return populate_base_amounts(
        instance,
        amount_fields=['amount'],
        currency=currency_id,
        at_datetime=at_datetime,
        raise_if_missing=raise_if_missing,
    )


def refresh_order_paid_base(order):
    """Recompute paid_amount_base from payments after payment changes."""
    from django.db.models import Sum
    from django.contrib.contenttypes.models import ContentType
    from api.models.data.payment import Payment

    if not hasattr(order, 'paid_amount_base'):
        return

    ct = ContentType.objects.get_for_model(order)
    total_base = Payment.objects.filter(
        content_type=ct, object_id=order.pk
    ).aggregate(total=Sum('amount_base'))['total']
    order.paid_amount_base = _quantize_money(total_base or 0)


def refresh_loan_paid_base(loan):
    """Recompute amount_paid_base from loan payment base amounts."""
    from django.db.models import Sum

    if not hasattr(loan, 'amount_paid_base'):
        return

    total_base = loan.payments.aggregate(total=Sum('amount_base'))['total']
    loan.amount_paid_base = _quantize_money(total_base or 0)
