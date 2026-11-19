from rest_framework import serializers

from api.models.data.fiscal_year import FiscalYear
from api.serializers.data.base import DataRootSerializer


class FiscalYearSerializer(DataRootSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    closed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = FiscalYear
        fields = [
            'id',
            'name',
            'start_date',
            'end_date',
            'status',
            'status_display',
            'is_current',
            'net_income',
            'closed_at',
            'closed_by',
            'closed_by_name',
            'closing_journal',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'status',
            'is_current',
            'net_income',
            'closed_at',
            'closed_by',
            'closing_journal',
        ]

    def get_closed_by_name(self, obj):
        if obj.closed_by:
            return obj.closed_by.get_full_name() or obj.closed_by.username
        return None


class CloseFiscalYearSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        fy = self.context.get('fiscal_year')
        if not fy:
            raise serializers.ValidationError('Fiscal year not found.')
        if fy.status == FiscalYear.STATUS_CLOSED:
            raise serializers.ValidationError(f'{fy.name} is already closed.')
        return attrs

    def save(self, **kwargs):
        from api.services.fiscal_year import close_fiscal_year

        fy = self.context['fiscal_year']
        user = self.context.get('request').user if self.context.get('request') else None
        return close_fiscal_year(
            fy.pk,
            user=user,
            notes=self.validated_data.get('notes', ''),
        )
