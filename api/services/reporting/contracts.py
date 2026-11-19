"""Validated filters and exact JSON amounts shared by v2 reports."""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from rest_framework import serializers

from api.models.data.currency import CURRENCY_DEFINITIONS
from api.services.report_period import (
    format_report_period_response, parse_report_datetime, validate_report_range,
    get_report_timezone,
)


class ReportFiltersSerializer(serializers.Serializer):
    start_date = serializers.CharField(required=False)
    end_date = serializers.CharField(required=False)
    currency = serializers.ChoiceField(choices=list(CURRENCY_DEFINITIONS), required=False)
    account_id = serializers.IntegerField(min_value=1, required=False)

    def validate(self, attrs):
        unknown = set(self.initial_data) - {'start_date', 'end_date', 'currency', 'account_id', 'page', 'page_size'}
        if unknown:
            raise serializers.ValidationError({key: 'Unsupported report filter.' for key in sorted(unknown)})
        attrs['start_date'], attrs['end_date'] = validate_report_range(
            parse_report_datetime(attrs.get('start_date')),
            parse_report_datetime(attrs.get('end_date'), end=True),
        )
        return attrs


@dataclass(frozen=True)
class ReportScope:
    start_date: datetime | None = None
    end_date: datetime | None = None
    currency: int | None = None
    account_id: int | None = None

    @classmethod
    def from_params(cls, params):
        serializer = ReportFiltersSerializer(data=params)
        serializer.is_valid(raise_exception=True)
        return cls(**serializer.validated_data)

    def metadata(self):
        return {
            'version': 2,
            'period': format_report_period_response(self.start_date, self.end_date),
            'timezone': str(get_report_timezone()),
            'currency_id': self.currency,
            'account_id': self.account_id,
            'amount_encoding': 'decimal_string',
            'source': 'journal_lines',
            # Ledger consistency alone cannot certify the underlying business documents.
            'source_reconciliation': 'not_verified',
        }


def money(value):
    """Serialize exact decimals; unknown amounts must remain null."""
    return None if value is None else format(Decimal(value), '.2f')


METRICS = (
    {'id': 'opening_balance', 'definition': 'Native debit minus credit strictly before the period start.'},
    {'id': 'debits', 'definition': 'Native debits within the inclusive business-date period.'},
    {'id': 'credits', 'definition': 'Native credits within the inclusive business-date period.'},
    {'id': 'closing_balance', 'definition': 'Opening balance plus debits minus credits at the cutoff.'},
)
