"""Shared date-range resolution for operational and GL reports."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

UTC = ZoneInfo('UTC')


def get_report_timezone():
    """Calendar-day boundaries use the business timezone, not raw UTC."""
    tz_name = getattr(settings, 'REPORT_TIME_ZONE', None) or settings.TIME_ZONE
    return ZoneInfo(tz_name)


def _to_utc(dt_local: datetime) -> datetime:
    return dt_local.astimezone(UTC)


def _day_bounds(day, *, tz):
    """Inclusive calendar-day range in business TZ, returned as UTC-aware datetimes."""
    start_local = datetime.combine(day, time.min, tzinfo=tz)
    end_local = datetime.combine(day, time(23, 59, 59, 999999), tzinfo=tz)
    return _to_utc(start_local), _to_utc(end_local)


def parse_report_datetime(value, *, end=False):
    """Parse YYYY-MM-DD or ISO datetime into a UTC-aware datetime for ORM filters."""
    if value is None or value == '':
        return None
    from rest_framework.exceptions import ValidationError

    try:
        if isinstance(value, datetime):
            parsed = value
        elif isinstance(value, date):
            return _day_bounds(value, tz=get_report_timezone())[1 if end else 0]
        else:
            text = str(value).strip()
            # Test dates before datetimes: parse_datetime accepts YYYY-MM-DD
            # as midnight, which otherwise truncates an inclusive end date.
            if len(text) == 10:
                day = parse_date(text)
                if day:
                    return _day_bounds(day, tz=get_report_timezone())[1 if end else 0]
            parsed = parse_datetime(text)
            if parsed is None:
                raise ValueError('Invalid date')
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed, get_report_timezone())
        return parsed.astimezone(UTC)
    except (ValueError, TypeError, OverflowError) as exc:
        raise ValidationError({'end_date' if end else 'start_date': 'Use a valid YYYY-MM-DD date or ISO datetime.'}) from exc


def validate_report_range(start, end):
    if start is not None and end is not None and start > end:
        from rest_framework.exceptions import ValidationError
        raise ValidationError({'end_date': 'End date must be on or after start date.'})
    return start, end


def resolve_report_period(
    *,
    period='daily',
    start_date=None,
    end_date=None,
    fiscal_year_id=None,
):
    """
    Return (start, end) inclusive UTC-aware datetimes for report filters.

    Calendar presets (daily, weekly, …) use the business timezone so "today"
    matches the user's local business day. Explicit start_date/end_date strings
  are interpreted as calendar dates in that same timezone.
    """
    if fiscal_year_id is not None and fiscal_year_id != '':
        from rest_framework.exceptions import ValidationError
        from api.services.fiscal_year import resolve_fiscal_year_period
        try:
            fiscal_year_id = int(fiscal_year_id)
            if fiscal_year_id <= 0:
                raise ValueError('Invalid fiscal year')
        except (TypeError, ValueError) as exc:
            raise ValidationError({'fiscal_year_id': 'Select a valid fiscal year.'}) from exc
        bounds = resolve_fiscal_year_period(fiscal_year_id=fiscal_year_id)
        if bounds == (None, None):
            raise ValidationError({'fiscal_year_id': 'Fiscal year was not found.'})
        return bounds

    if period == 'fiscal_year':
        from api.services.fiscal_year import ensure_current_fiscal_year, resolve_fiscal_year_period

        ensure_current_fiscal_year()
        return resolve_fiscal_year_period(use_current=True)

    if period not in {'daily', 'weekly', 'monthly', 'yearly', 'custom', 'all'}:
        from rest_framework.exceptions import ValidationError
        raise ValidationError({'period': 'Select a valid reporting period.'})

    tz = get_report_timezone()
    now_local = timezone.now().astimezone(tz)
    today = now_local.date()

    parsed_start = parse_report_datetime(start_date) if start_date else None
    parsed_end = parse_report_datetime(end_date, end=True) if end_date else None
    if parsed_start is not None or parsed_end is not None:
        return validate_report_range(parsed_start, parsed_end)

    if period == 'all':
        return None, None

    if period == 'daily':
        start_day = end_day = today
    elif period == 'weekly':
        start_day = today - timedelta(days=today.weekday())
        end_day = today
    elif period == 'monthly':
        start_day = today.replace(day=1)
        end_day = today
    elif period == 'yearly':
        from api.services.fiscal_year import current_fiscal_year_bounds_to_date

        return current_fiscal_year_bounds_to_date()
    elif period == 'custom':
        start = _day_bounds(today, tz=tz)[0]
        end = _day_bounds(today, tz=tz)[1]
        return start, end
    else:
        return None, None

    start, _ = _day_bounds(start_day, tz=tz)
    _, end = _day_bounds(end_day, tz=tz)
    return start, end


def format_report_period_response(start, end):
    """Serialize period boundaries as YYYY-MM-DD in the business timezone."""
    tz = get_report_timezone()
    return {
        'start_date': start.astimezone(tz).date().isoformat() if start else None,
        'end_date': end.astimezone(tz).date().isoformat() if end else None,
    }
