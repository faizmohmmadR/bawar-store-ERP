from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.inventory_ledger import InventoryBalance, StockMovement
from api.models.data.product_packaging import ProductBarcode, ProductPackaging
from api.models.data.products import Product
from api.serializers.data.inventory_ledger import (
    InventoryBalanceSerializer,
    StockMovementSerializer,
)
from api.serializers.data.products import serialize_product
from api.services.inventory.engine import adjust_stock, get_default_warehouse, open_package, transfer_stock
from api.services.inventory.positions import aggregate_balance_positions, serialize_position
from api.services.pricing import resolve_price
from api.views.data.base import DataRootViewSet


class InventoryBalanceViewSet(DataRootViewSet):
    permission_module = 'stock'
    queryset = (
        InventoryBalance.objects.select_related('product', 'warehouse', 'lot')
        .all()
        .order_by('product__name')
    )
    serializer_class = InventoryBalanceSerializer
    search_fields = [
        'product__name',
        'product__sku',
        'product__barcode',
        'product__packagings__barcode',
    ]
    filterset_fields = ['product', 'warehouse', 'lot']

    def list(self, request, *args, **kwargs):
        """
        Default: one row per product × warehouse (lots collapsed).
        Pass aggregate=false to see raw lot-level balances.
        """
        aggregate = str(request.query_params.get('aggregate', 'true')).lower() not in {
            '0', 'false', 'no',
        }
        if not aggregate:
            return super().list(request, *args, **kwargs)

        qs = self.filter_queryset(self.get_queryset())
        positions = aggregate_balance_positions(qs)
        page = self.paginate_queryset(positions)
        payload = [
            serialize_position(row, request)
            for row in (page if page is not None else positions)
        ]
        if page is not None:
            return self.get_paginated_response(payload)
        return Response(payload)

    @action(detail=True, methods=['get'], url_path='position')
    def position(self, request, pk=None):
        """Aggregated product×warehouse position for a balance id (includes lot rows)."""
        balance = self.get_object()
        qs = InventoryBalance.objects.filter(
            product_id=balance.product_id,
            warehouse_id=balance.warehouse_id,
        ).select_related('product', 'warehouse', 'lot')
        positions = aggregate_balance_positions(qs)
        if not positions:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        position = serialize_position(positions[0], request)
        position['lots'] = InventoryBalanceSerializer(
            qs.order_by('lot_id', 'id'), many=True, context={'request': request},
        ).data
        return Response(position)


class StockMovementViewSet(DataRootViewSet):
    permission_module = 'stock'
    queryset = (
        StockMovement.objects.select_related('product', 'warehouse', 'packaging')
        .all()
        .order_by('-occurred_at', '-id')
    )
    serializer_class = StockMovementSerializer
    http_method_names = ['get', 'head', 'options']
    search_fields = ['product__name', 'notes', 'movement_type']
    filterset_fields = ['product', 'warehouse', 'movement_type']

    @action(detail=False, methods=['post'], url_path='adjust')
    def adjust(self, request):
        product_id = request.data.get('product')
        warehouse_id = request.data.get('warehouse')
        delta = request.data.get('base_quantity_delta')
        reason = request.data.get('reason')
        product = Product.objects.filter(pk=product_id).first()
        from api.models.data.warehouse import Warehouse
        warehouse = Warehouse.objects.filter(pk=warehouse_id).first() if warehouse_id else get_default_warehouse()
        if not product:
            return Response({'detail': 'Product required'}, status=status.HTTP_400_BAD_REQUEST)
        movement = adjust_stock(
            product=product,
            warehouse=warehouse,
            base_quantity_delta=delta,
            user=request.user,
            reason=reason,
        )
        return Response(StockMovementSerializer(movement).data if movement else {'detail': 'No change'})

    @action(detail=False, methods=['post'], url_path='transfer')
    def transfer(self, request):
        product = Product.objects.filter(pk=request.data.get('product')).first()
        packaging = ProductPackaging.objects.filter(pk=request.data.get('packaging')).first()
        from api.models.data.warehouse import Warehouse
        src = Warehouse.objects.filter(pk=request.data.get('from_warehouse')).first()
        dst = Warehouse.objects.filter(pk=request.data.get('to_warehouse')).first()
        qty = request.data.get('quantity')
        if not all([product, packaging, src, dst, qty]):
            return Response({'detail': 'Missing fields'}, status=status.HTTP_400_BAD_REQUEST)
        movement = transfer_stock(
            product=product,
            from_warehouse=src,
            to_warehouse=dst,
            packaging=packaging,
            quantity=qty,
            user=request.user,
            notes=request.data.get('notes'),
        )
        return Response(StockMovementSerializer(movement).data)

    @action(detail=False, methods=['post'], url_path='open-package')
    def open_pkg(self, request):
        product = Product.objects.filter(pk=request.data.get('product')).first()
        packaging = ProductPackaging.objects.filter(pk=request.data.get('packaging')).first()
        from api.models.data.warehouse import Warehouse
        warehouse = Warehouse.objects.filter(pk=request.data.get('warehouse')).first() or get_default_warehouse()
        movement = open_package(
            product=product,
            warehouse=warehouse,
            packaging=packaging,
            quantity=request.data.get('quantity') or 1,
            user=request.user,
        )
        return Response(StockMovementSerializer(movement).data)

    @action(detail=False, methods=['get'], url_path='resolve-barcode')
    def resolve_barcode(self, request):
        code = (request.query_params.get('code') or '').strip()
        if not code:
            return Response({'detail': 'code required'}, status=status.HTTP_400_BAD_REQUEST)
        packaging = ProductPackaging.objects.filter(barcode=code, is_active=True).select_related('product').first()
        if not packaging:
            barcode = ProductBarcode.objects.filter(barcode=code).select_related('packaging', 'product').first()
            if barcode:
                packaging = barcode.packaging
                product = barcode.product
            else:
                product = Product.objects.filter(barcode=code, is_active=True).first()
                packaging = product.packagings.filter(is_base=True).first() if product else None
        else:
            product = packaging.product
        if not product or not packaging:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        from api.models.data.product_packaging import ProductPrice

        retail = resolve_price(product, packaging, price_type=ProductPrice.PRICE_RETAIL)
        wholesale = resolve_price(product, packaging, price_type=ProductPrice.PRICE_WHOLESALE)
        from django.db.models import Sum
        from api.models.data.inventory_ledger import InventoryBalance

        stock_on_hand = (
            InventoryBalance.objects.filter(product_id=product.id)
            .aggregate(total=Sum('quantity_on_hand'))['total']
            or 0
        )
        product_payload = serialize_product(product, request) or {}
        product_payload['stock_on_hand'] = stock_on_hand
        return Response({
            'code': code,
            'product': product_payload,
            'packaging': {
                'id': packaging.id,
                'name': packaging.name,
                'qty_in_base': str(packaging.qty_in_base),
                'barcode': packaging.barcode,
                'is_base': packaging.is_base,
                'for_sale': packaging.for_sale,
                'for_purchase': packaging.for_purchase,
                'is_default_sale': packaging.is_default_sale,
                'is_default_purchase': packaging.is_default_purchase,
                'is_variable_weight': packaging.is_variable_weight,
                'is_active': packaging.is_active,
            },
            'price': retail,
            'retail_price': retail,
            'wholesale_price': wholesale,
            'stock_on_hand': stock_on_hand,
        })
