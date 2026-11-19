from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.equipment import Equipment
from api.serializers.data.equipment import EquipmentSerializer
from api.views.data.base import DataRootViewSet


class EquipmentViewSet(DataRootViewSet):
    permission_module = 'equipment'
    queryset = Equipment.objects.all().order_by('name', '-id')
    serializer_class = EquipmentSerializer
    filterset_fields = [
        'is_active',
        'acquisition_type',
        'is_opening_balance',
        'record_as_expense',
        'payment_method',
        'currency',
        'status',
        'category',
        'assigned_to',
    ]
    search_fields = [
        'name',
        'category',
        'serial_number',
        'asset_tag',
        'description',
        'condition',
        'location',
        'notes',
        'assigned_to__full_name',
    ]

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """Equipment section report — assets, acquisitions, depreciation."""
        from api.services.equipment_report import get_equipment_report
        from api.services.report_period import format_report_period_response, resolve_report_period

        start_date, end_date = resolve_report_period(
            period=request.query_params.get('period', 'monthly'),
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            fiscal_year_id=request.query_params.get('fiscal_year_id'),
        )
        report = get_equipment_report(start_date=start_date, end_date=end_date)
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })
