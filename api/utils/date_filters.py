"""Shared inclusive date filters in the configured business timezone."""
from datetime import datetime
from django.db.models import DateField, DateTimeField
from api.services.report_period import get_report_timezone, parse_report_datetime, validate_report_range


def normalize_date_from(value):
    return parse_report_datetime(value)


def normalize_date_to(value):
    return parse_report_datetime(value, end=True)


def date_range_params(request):
    qp = getattr(request, 'query_params', None) or {}
    return validate_report_range(
        normalize_date_from(qp.get('date_from') or qp.get('start_date')),
        normalize_date_to(qp.get('date_to') or qp.get('end_date')),
    )


def apply_date_range(queryset, field_name, start=None, end=None):
    start, end = validate_report_range(normalize_date_from(start), normalize_date_to(end))
    model = queryset.model
    field = None
    for part in field_name.split('__'):
        field = model._meta.get_field(part)
        if field.is_relation:
            model = field.related_model
    if isinstance(field, DateField) and not isinstance(field, DateTimeField):
        start = start.astimezone(get_report_timezone()).date() if isinstance(start, datetime) else start
        end = end.astimezone(get_report_timezone()).date() if isinstance(end, datetime) else end
    if start is not None:
        queryset = queryset.filter(**{f'{field_name}__gte': start})
    if end is not None:
        queryset = queryset.filter(**{f'{field_name}__lte': end})
    return queryset
