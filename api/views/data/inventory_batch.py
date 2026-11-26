from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db.models import Sum, F, Q, Count
from django.utils import timezone

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.sale_batch_allocation import SaleBatchAllocation
from api.models.data.stock_adjustment import StockAdjustment
from api.serializers.data.inventory_batch import (
    InventoryBatchSerializer,
    InventoryBatchListSerializer,
    SaleBatchAllocationSerializer,
    StockAdjustmentSerializer,
    StockAdjustmentCreateSerializer,
)
from api.views.data.base import DataRootViewSet


class InventoryBatchViewSet(DataRootViewSet):
    permission_module = 'stock'
    """ViewSet for InventoryBatch management."""
    queryset = InventoryBatch.objects.select_related(
        'product', 'supplier'
    ).all()
    serializer_class = InventoryBatchSerializer
    filterset_fields = [
        'product', 'supplier', 'condition', 'status', 'currency'
    ]
    search_fields = [
        'batch_number', 'product__name', 'product__barcode',
        'supplier__name', 'notes'
    ]
    ordering_fields = ['expire_date', 'created_at',
                       'remaining_pieces', 'batch_number']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return InventoryBatchListSerializer
        return InventoryBatchSerializer

    def get_queryset(self):
        qs = super().get_queryset()

        # Filter by status
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)

        # Filter by expiration
        expiry_filter = self.request.query_params.get('expiry')
        if expiry_filter == 'expired':
            from api.services.batch_queries import expired_on_hand_q
            qs = qs.filter(expired_on_hand_q())
        elif expiry_filter == 'near_expiry':
            from api.services.batch_queries import near_expiry_q
            qs = qs.filter(near_expiry_q(30))
        elif expiry_filter == 'not_expired':
            qs = qs.filter(
                Q(expire_date__gte=timezone.localdate()) | Q(
                    expire_date__isnull=True)
            )

        # Filter by low stock
        low_stock_threshold = self.request.query_params.get(
            'low_stock_threshold')
        if low_stock_threshold:
            try:
                threshold = float(low_stock_threshold)
                qs = qs.filter(remaining_pieces__lte=threshold)
            except ValueError:
                pass

        return qs

    @action(detail=False, methods=['get'])
    def expired(self, request):
        """Get all expired on-hand batches (does not hide after status flip)."""
        from api.services.batch_queries import expired_on_hand_q

        expired_batches = self.get_queryset().filter(expired_on_hand_q())

        # Mark lingering active+past-date rows without removing them from the response
        InventoryBatch.objects.filter(
            pk__in=expired_batches.filter(
                status=InventoryBatch.STATUS_ACTIVE
            ).values('pk')
        ).update(status=InventoryBatch.STATUS_EXPIRED)

        page = self.paginate_queryset(expired_batches)
        serializer = self.get_serializer(
            page if page is not None else expired_batches, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def near_expiry(self, request):
        """Get batches expiring soon (within configurable days)."""
        from api.services.batch_queries import near_expiry_q

        days = int(request.query_params.get('days', 30))
        near_expiry_batches = self.get_queryset().filter(near_expiry_q(days))

        page = self.paginate_queryset(near_expiry_batches)
        serializer = self.get_serializer(
            page if page is not None else near_expiry_batches, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Get batches with low stock."""
        threshold = float(request.query_params.get('threshold', 100))

        low_stock_batches = self.get_queryset().filter(
            remaining_pieces__lte=threshold,
            remaining_pieces__gt=0,
            status=InventoryBatch.STATUS_ACTIVE
        )

        page = self.paginate_queryset(low_stock_batches)
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Get inventory summary grouped by product."""
        from django.db.models import Sum

        summary = self.get_queryset().filter(
            status=InventoryBatch.STATUS_ACTIVE
        ).values(
            'product__id', 'product__name', 'product__barcode'
        ).annotate(
            total_pieces=Sum('remaining_pieces'),
            total_batches=Count('id'),
            total_value=Sum(F('remaining_pieces') * F('unit_cost'))
        ).order_by('-total_pieces')

        return Response(summary)

    @action(detail=True, methods=['post'])
    def return_to_main(self, request, pk=None):
        """

        Body:
          - piece_amount: optional (defaults to full remaining qty)
          - reason: expired | damaged | other (optional)
          - notes: optional
        """
        from api.serializers.data.stock_transfer import StockTransferSerializer
        from api.serializers.data.stock import StockSerializer
        from api.services.stock_return_to_main import return_stock_to_main

        batch = self.get_object()
        transfer, target = return_stock_to_main(
            batch=batch,
            piece_amount=request.data.get(
                'piece_amount', request.data.get('dana_amount')
            ),
            notes=(request.data.get('notes') or '').strip(),
            reason=(request.data.get('reason') or '').strip() or None,
            user=request.user,
        )
        return Response(
            {
                'transfer': StockTransferSerializer(transfer).data,
                'target_stock': StockSerializer(target).data,
            }
        )

    @action(detail=True, methods=['post'])
    def write_off(self, request, pk=None):
        """
        Write off / dispose this batch (or part of it).

        Typical for main-warehouse expired or damaged lots.
        Body: piece_amount (optional), adjustment_type (optional), notes (optional)
        """
        from api.serializers.data.inventory_batch import StockAdjustmentSerializer
        from api.serializers.data.stock import StockSerializer
        from api.services.stock_write_off import write_off_stock

        batch = self.get_object()
        result = write_off_stock(
            batch=batch,
            piece_amount=request.data.get(
                'piece_amount', request.data.get('dana_amount')
            ),
            adjustment_type=(request.data.get(
                'adjustment_type') or '').strip() or None,
            notes=(request.data.get('notes') or '').strip(),
            user=request.user,
        )
        stock_data = None
        if result.get('stock') is not None:
            result['stock'].refresh_from_db()
            stock_data = StockSerializer(result['stock']).data
        return Response(
            {
                'adjustment_type': result['adjustment_type'],
                'piece_amount': str(result['piece_amount']),
                'adjustments': StockAdjustmentSerializer(
                    result['adjustments'], many=True
                ).data,
                'stock': stock_data,
            }
        )

    @action(detail=True, methods=['get'])
    def allocations(self, request):
        """Get all sales allocations for this batch."""
        batch = self.get_object()
        allocations = SaleBatchAllocation.objects.filter(
            inventory_batch=batch
        ).select_related('sale', 'sale_item')

        serializer = SaleBatchAllocationSerializer(allocations, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def adjustments(self, request):
        """Get all adjustments for this batch."""
        batch = self.get_object()
        adjustments = StockAdjustment.objects.filter(
            inventory_batch=batch
        ).select_related('adjusted_by')

        serializer = StockAdjustmentSerializer(adjustments, many=True)
        return Response(serializer.data)


class SaleBatchAllocationViewSet(DataRootViewSet):
    permission_module = 'stock'
    """ViewSet for SaleBatchAllocation management."""
    queryset = SaleBatchAllocation.objects.select_related(
        'sale', 'sale_item', 'inventory_batch'
    ).all()
    serializer_class = SaleBatchAllocationSerializer
    filterset_fields = ['sale', 'sale_item', 'inventory_batch']
    search_fields = ['sale__invoice_number', 'inventory_batch__batch_number']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        return qs


class StockAdjustmentViewSet(DataRootViewSet):
    """ViewSet for StockAdjustment management (damage / expiry write-offs)."""

    permission_module = 'stock'
    permission_action_map = {
        'list': 'view_stock',
        'retrieve': 'view_stock',
        'create': 'edit_stock',
        'update': 'edit_stock',
        'partial_update': 'edit_stock',
        'destroy': 'delete_stock',
        # Prefer dedicated write-off perms; edit_stock kept as OR for existing roles.
        'record_damage': ['record_damaged_stock', 'edit_stock'],
        'record_expiry': ['record_expired_stock', 'edit_stock'],
    }
    queryset = StockAdjustment.objects.select_related(
        'inventory_batch',
        'inventory_batch__product',
        'product',
        'warehouse',
        'adjusted_by',
    ).all()
    serializer_class = StockAdjustmentSerializer
    filterset_fields = [
        'inventory_batch',
        'adjustment_type',
        'product',
        'warehouse',
    ]
    search_fields = [
        'inventory_batch__batch_number',
        'product__name',
        'product__sku',
        'product__barcode',
        'reason',
        'reference_number',
        'warehouse__name',
    ]
    ordering = ['-adjustment_date']

    def get_queryset(self):
        qs = super().get_queryset()
        return qs

    def get_serializer_class(self):
        if self.action == 'create':
            return StockAdjustmentCreateSerializer
        if self.action == 'record_damage':
            from api.serializers.data.inventory_batch import RecordDamagedStockSerializer
            return RecordDamagedStockSerializer
        if self.action == 'record_expiry':
            from api.serializers.data.inventory_batch import RecordExpiredStockSerializer
            return RecordExpiredStockSerializer
        return StockAdjustmentSerializer

    def perform_create(self, serializer):
        """Set the adjusted_by field to current user."""
        serializer.save(adjusted_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='record-damage')
    def record_damage(self, request):
        """
        Record damaged finished goods from sellable stock.

        Body: product, warehouse (optional), packaging (optional),
        quantity and/or base_quantity, reason, notes, adjustment_date.
        """
        from api.models.data.products import Product
        from api.models.data.product_packaging import ProductPackaging
        from api.models.data.warehouse import Warehouse
        from api.serializers.data.inventory_batch import RecordDamagedStockSerializer
        from api.services.inventory.damage import record_damaged_stock
        from api.services.inventory.engine import get_default_warehouse

        serializer = RecordDamagedStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        product = Product.objects.filter(pk=data['product']).first()
        if not product:
            return Response({'product': 'Product not found.'}, status=400)

        warehouse = None
        if data.get('warehouse'):
            warehouse = Warehouse.objects.filter(pk=data['warehouse']).first()
            if not warehouse:
                return Response({'warehouse': 'Warehouse not found.'}, status=400)
        else:
            warehouse = get_default_warehouse()

        packaging = None
        if data.get('packaging'):
            packaging = ProductPackaging.objects.filter(
                pk=data['packaging'], product=product,
            ).first()
            if not packaging:
                return Response({'packaging': 'Packaging not found for product.'}, status=400)

        result = record_damaged_stock(
            product=product,
            warehouse=warehouse,
            quantity=data.get('quantity'),
            packaging=packaging,
            base_quantity=data.get('base_quantity'),
            reason=(data.get('reason') or '').strip(),
            notes=(data.get('notes') or '').strip(),
            user=request.user,
            occurred_at=data.get('adjustment_date'),
        )
        return Response(
            StockAdjustmentSerializer(
                result['adjustment'], context={'request': request},
            ).data,
            status=201,
        )

    @action(detail=False, methods=['post'], url_path='record-expiry')
    def record_expiry(self, request):
        """
        Write off expired finished goods from expired lots (FEFO-safe).

        Body: product, warehouse (optional), packaging (optional), lot (optional),
        quantity and/or base_quantity, reason, notes, adjustment_date, as_of.
        """
        from api.models.data.products import Product
        from api.models.data.product_packaging import ProductPackaging
        from api.models.data.warehouse import Warehouse
        from api.models.data.inventory_ledger import InventoryLot
        from api.serializers.data.inventory_batch import RecordExpiredStockSerializer
        from api.services.inventory.expiry import record_expired_stock
        from api.services.inventory.engine import get_default_warehouse

        serializer = RecordExpiredStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        product = Product.objects.filter(pk=data['product']).first()
        if not product:
            return Response({'product': 'Product not found.'}, status=400)

        warehouse = None
        if data.get('warehouse'):
            warehouse = Warehouse.objects.filter(pk=data['warehouse']).first()
            if not warehouse:
                return Response({'warehouse': 'Warehouse not found.'}, status=400)
        else:
            warehouse = get_default_warehouse()

        packaging = None
        if data.get('packaging'):
            packaging = ProductPackaging.objects.filter(
                pk=data['packaging'], product=product,
            ).first()
            if not packaging:
                return Response({'packaging': 'Packaging not found for product.'}, status=400)

        lot = None
        if data.get('lot'):
            lot = InventoryLot.objects.filter(pk=data['lot'], product=product).first()
            if not lot:
                return Response({'lot': 'Lot not found for product.'}, status=400)

        result = record_expired_stock(
            product=product,
            warehouse=warehouse,
            quantity=data.get('quantity'),
            packaging=packaging,
            base_quantity=data.get('base_quantity'),
            lot=lot,
            reason=(data.get('reason') or '').strip(),
            notes=(data.get('notes') or '').strip(),
            user=request.user,
            occurred_at=data.get('adjustment_date'),
            as_of=data.get('as_of'),
        )
        return Response(
            StockAdjustmentSerializer(
                result['adjustment'], context={'request': request},
            ).data,
            status=201,
        )
