from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.sales import Sales, SalesItems
from api.serializers.data.sales import SalesItemsSerializer, SalesSerializer
from api.views.data.base import DataRootViewSet


class SalesViewSet(DataRootViewSet):
    permission_module = 'sales'
    queryset = (
        Sales.objects.select_related('customer', 'vendor', 'employee', 'warehouse')
        .prefetch_related('sales_items__product', 'sales_items__packaging')
        .all()
        .order_by('-sale_date', '-id')
    )
    serializer_class = SalesSerializer
    search_fields = ['invoice_number', 'bill_no', 'customer__name', 'vendor__name', 'notes']
    filterset_fields = ['status', 'customer', 'vendor', 'employee', 'currency', 'transaction_type', 'warehouse']

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """Sales section report — billed, collected, returns, and free goods."""
        from api.services.report_period import format_report_period_response, resolve_report_period
        from api.services.sales_report import get_sales_report

        start_date, end_date = resolve_report_period(
            period=request.query_params.get('period', 'monthly'),
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            fiscal_year_id=request.query_params.get('fiscal_year_id'),
        )
        report = get_sales_report(start_date=start_date, end_date=end_date)
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })


class SalesItemsViewSet(DataRootViewSet):
    permission_module = 'sales'
    queryset = SalesItems.objects.select_related('product', 'packaging', 'sales').all()
    serializer_class = SalesItemsSerializer
    filterset_fields = ['sales', 'product', 'packaging']
