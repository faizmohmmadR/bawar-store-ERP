from decimal import Decimal

from django.db import models
from django.utils import timezone

from api.models.data.base import BaseModel

SUPPORTED_CURRENCY_CODES = ('AFN', 'USD', 'KDR')
DEFAULT_USD_TO_AFN_RATE = Decimal('87.20')

# Static currency definitions — IDs match DB seed order and frontend STATIC_CURRENCIES
CURRENCY_DEFINITIONS = {
    1: {'code': 'AFN', 'name': 'Afghan Afghani', 'symbol': '؋', 'is_base': True},
    2: {'code': 'USD', 'name': 'US Dollar', 'symbol': '$', 'is_base': False},
    3: {'code': 'KDR', 'name': 'Kandahari', 'symbol': 'ک', 'is_base': False},
}

# Also keyed by code for reverse lookups
CURRENCY_BY_CODE = {v['code']: {'id': k, **v}
                    for k, v in CURRENCY_DEFINITIONS.items()}

CURRENCY_CHOICES = [(k, v['code']) for k, v in CURRENCY_DEFINITIONS.items()]

BASE_CURRENCY_ID = 1  # AFN


def get_currency(currency_id):
    """Return static currency dict for a given integer id, or None."""
    if currency_id is None:
        return None
    try:
        return CURRENCY_DEFINITIONS.get(int(currency_id))
    except (TypeError, ValueError):
        return None


def get_currency_by_code(code):
    """Return static currency dict (with 'id') for a given code, or None."""
    if not code:
        return None
    return CURRENCY_BY_CODE.get(str(code).upper())


def currency_details(currency_id):
    """Return serializable dict for a currency id, or None."""
    c = get_currency(currency_id)
    if not c:
        return None
    return {
        'id': int(currency_id),
        'code': c['code'],
        'name': c['name'],
        'symbol': c['symbol'],
    }


class ExchangeRate(BaseModel):
    """
    Historical exchange rate: 1 unit of from_currency = rate units of to_currency (base AFN).
    from_currency / to_currency store the static integer currency id (1-4).
    """

    from_currency = models.IntegerField(choices=CURRENCY_CHOICES)
    to_currency = models.IntegerField(
        choices=CURRENCY_CHOICES, default=BASE_CURRENCY_ID)
    rate = models.DecimalField(
        max_digits=18, decimal_places=6,
        help_text='1 unit of from_currency equals this many units of to_currency (base).',
    )
    date = models.DateTimeField(default=timezone.now)
    effective_date = models.DateTimeField(default=timezone.now)
    notes = models.CharField(max_length=255, blank=True, default='')
    source = models.CharField(max_length=100, blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('from_currency', 'to_currency', 'date')
        indexes = [
            models.Index(fields=['from_currency', 'to_currency', 'date']),
        ]
        ordering = ['-date']

    def __str__(self):
        fc = get_currency(self.from_currency)
        tc = get_currency(self.to_currency)
        fc_code = fc['code'] if fc else str(self.from_currency)
        tc_code = tc['code'] if tc else str(self.to_currency)
        return f"{fc_code} → {tc_code} ({self.date}): {self.rate}"

    def save(self, *args, **kwargs):
        if self.date and not self.effective_date:
            self.effective_date = self.date
        elif self.effective_date and not self.date:
            self.date = self.effective_date
        elif self.date and self.effective_date and self.date != self.effective_date:
            self.effective_date = self.date
        super().save(*args, **kwargs)

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.to_currency != BASE_CURRENCY_ID:
            base = CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]
            raise ValidationError(
                {'to_currency': f"Exchange rates must be to base currency ({base['code']})."})
        if self.from_currency and self.from_currency == self.to_currency:
            raise ValidationError(
                {'from_currency': 'From and to currency must differ.'})
