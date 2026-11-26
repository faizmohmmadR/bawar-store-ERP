from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.purchases import Purchase, PurchaseItem
from api.serializers.data.purchases import PurchaseItemSerializer, PurchaseSerializer
from api.views.data.base import DataRootViewSet


class PurchaseViewSet(DataRootViewSet):
    permission_module = 'purchases'
    queryset = (
        Purchase.objects.select_related('vendor', 'warehouse')
        .prefetch_related('items__product', 'items__packaging')
        .all()
        .order_by('-purchase_date', '-id')
    )
    serializer_class = PurchaseSerializer
    search_fields = ['invoice_number', 'bill_number', 'vendor__name', 'notes']
    filterset_fields = ['status', 'vendor', 'warehouse', 'currency', 'transaction_type']

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """Purchases section report — received, paid, unpaid, by currency."""
        from api.services.purchase_report import get_purchase_report
        from api.services.report_period import format_report_period_response, resolve_report_period

        start_date, end_date = resolve_report_period(
            period=request.query_params.get('period', 'monthly'),
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            fiscal_year_id=request.query_params.get('fiscal_year_id'),
        )
        report = get_purchase_report(start_date=start_date, end_date=end_date)
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })


class PurchaseItemViewSet(DataRootViewSet):
    permission_module = 'purchases'
    queryset = PurchaseItem.objects.select_related('product', 'packaging', 'purchase').all()
    serializer_class = PurchaseItemSerializer
    filterset_fields = ['purchase', 'product', 'packaging']
