"""Map a datetime to a payroll period (month key + year + calendar)."""
from __future__ import annotations

from datetime import date, datetime

from django.utils import timezone

PAYROLL_MONTH_KEYS = (
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
)


def _as_local_date(value) -> date:
    if isinstance(value, datetime):
        if timezone.is_aware(value):
            return timezone.localtime(value).date()
        return value.date()
    if isinstance(value, date):
        return value
    raise TypeError('Expected date or datetime')


def gregorian_to_jalali(gy: int, gm: int, gd: int) -> tuple[int, int, int]:
    """Convert Gregorian Y/M/D to Jalali (Solar Hijri) Y/M/D."""
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = (
        355666
        + (365 * gy)
        + ((gy2 + 3) // 4)
        - ((gy2 + 99) // 100)
        + ((gy2 + 399) // 400)
        + gd
        + g_d_m[gm - 1]
    )
    jy = -1595 + (33 * (days // 12053))
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        jm = 1 + days // 31
        jd = 1 + (days % 31)
    else:
        jm = 7 + (days - 186) // 30
        jd = 1 + ((days - 186) % 30)
    return jy, jm, jd


def payroll_period_from_datetime(value, period_calendar: str = 'jalali') -> dict:
    """
    Build payroll period fields from a sale/payment datetime.

    Month keys stay canonical (`january` … `december`) for ordinal month 1–12
    in the chosen calendar.
    """
    calendar = (period_calendar or 'jalali').lower()
    if calendar not in ('gregorian', 'jalali', 'hijri'):
        calendar = 'jalali'
    local = _as_local_date(value)
    if calendar == 'gregorian':
        year, month_num = local.year, local.month
    else:
        # Jalali (and lunar hijri fallback via jalali until a dedicated converter exists)
        year, month_num, _ = gregorian_to_jalali(local.year, local.month, local.day)
        if calendar == 'hijri':
            calendar = 'jalali'
    return {
        'month': PAYROLL_MONTH_KEYS[month_num - 1],
        'year': year,
        'period_calendar': calendar,
    }
