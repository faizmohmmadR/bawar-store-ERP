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
        from django.db.models import Q

        from api.services.inventory.positions import aggregate_balance_positions, serialize_position
        from api.services.uom.conversion import d

        qs = InventoryBalance.objects.select_related('product', 'warehouse', 'product__base_uom').filter(
            product__track_inventory=True,
        ).filter(Q(product__reorder_level__gt=0) | Q(product__min_stock_level__gt=0))
        low = []
        for pos in aggregate_balance_positions(qs):
            product = pos['product_obj']
            on_hand = d(pos['quantity_on_hand'])
            reorder = d(product.reorder_level or 0)
            minimum = d(product.min_stock_level or 0)
            if on_hand <= 0 or (minimum > 0 and on_hand <= minimum) or (reorder > 0 and on_hand <= reorder):
                low.append(serialize_position(pos, request))
        return Response(low)

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """Stock section report — on-hand balances, value, and period movements."""
        from api.services.report_period import format_report_period_response, resolve_report_period
        from api.services.stock_report import get_stock_report

        start_date, end_date = resolve_report_period(
            period=request.query_params.get('period', 'monthly'),
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            fiscal_year_id=request.query_params.get('fiscal_year_id'),
        )
        report = get_stock_report(start_date=start_date, end_date=end_date)
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })
