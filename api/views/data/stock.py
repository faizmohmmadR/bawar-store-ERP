from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.inventory_ledger import InventoryBalance
from api.models.data.stock import Stock
from api.serializers.data.inventory_ledger import InventoryBalanceSerializer
from api.serializers.data.stock import StockSerializer
from api.views.data.base import DataRootViewSet


class StockViewSet(DataRootViewSet):
    """Legacy stock list; prefer inventory-balances for new UIs."""

    permission_module = 'stock'
    queryset = Stock.objects.select_related('product', 'warehouse').all().order_by('-id')
    serializer_class = StockSerializer
    filterset_fields = ['product', 'condition', 'warehouse']
    search_fields = ['product__name', 'product__barcode', 'product__sku', 'notes']

    @action(detail=False, methods=['get'], url_path='balances')
    def balances(self, request):
        qs = InventoryBalance.objects.select_related('product', 'warehouse').all()
        product = request.query_params.get('product')
        warehouse = request.query_params.get('warehouse')
        if product:
            qs = qs.filter(product_id=product)
        if warehouse:
            qs = qs.filter(warehouse_id=warehouse)
        page = self.paginate_queryset(qs)
        ser = InventoryBalanceSerializer(page or qs, many=True, context={'request': request})
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response(ser.data)

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        from django.db.models import F
        qs = InventoryBalance.objects.select_related('product').filter(
            quantity_on_hand__lte=F('product__reorder_level'),
            product__track_inventory=True,
        )
        ser = InventoryBalanceSerializer(qs, many=True, context={'request': request})
        return Response(ser.data)

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        from api.services.report_period import format_report_period_response, resolve_report_period
        try:
            from api.services.stock_report import get_stock_report
            start_date, end_date = resolve_report_period(
                period=request.query_params.get('period', 'monthly'),
                start=request.query_params.get('start_date'),
                end=request.query_params.get('end_date'),
            )
            data = get_stock_report(start_date=start_date, end_date=end_date)
            return Response(format_report_period_response(data, start_date, end_date))
        except Exception as exc:
            balances = InventoryBalance.objects.select_related('product', 'warehouse').all()
            return Response({
                'balances': InventoryBalanceSerializer(balances, many=True).data,
                'error': str(exc),
            })
