from django.db import models, transaction
from django.db.models import Prefetch, Q
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.stock import Stock
from api.models.data.inventory_batch import InventoryBatch
from api.serializers.data.stock import StockSerializer
from api.views.data.base import DataRootViewSet


def get_expiring_stock_queryset(days_ahead=30, include_expired=True):
    """Legacy Stock rows that have on-hand lots needing expiry attention."""
    from django.db.models import Exists, OuterRef

    from api.models.data.inventory_batch import InventoryBatch
    from api.services.batch_queries import expiring_attention_q

    matching_batches = InventoryBatch.objects.filter(
        product_id=OuterRef('product_id'),
        condition=OuterRef('condition'),
    ).filter(expiring_attention_q(days_ahead, include_expired=include_expired))

    return Stock.objects.filter(Exists(matching_batches))


def get_stock_queryset(qs, user, field='warehouse_id', query_params=None):
    return qs


def _search_batches(qs, search):
    if not search:
        return qs
    from django.db.models import Q

    return qs.filter(
        Q(batch_number__icontains=search)
        | Q(product__name__icontains=search)
        | Q(product__barcode__icontains=search)
        | Q(supplier__name__icontains=search)
    )


class StockViewSet(DataRootViewSet):
    permission_module = 'stock'
    permission_action_map = {
        'add_material': 'add_stock',
        'return_to_pack': 'edit_stock',
        'correct_return': 'edit_stock',
        'damage_bottles': 'edit_stock',
    }
    queryset = Stock.objects.select_related('product__raw_material').prefetch_related(
        Prefetch('product__inventory_batches', queryset=InventoryBatch.objects.select_related('product', 'supplier'), to_attr='stock_cost_batches'),
    ).all().order_by("-id")
    serializer_class = StockSerializer
    filterset_fields = ['product', 'condition']
    search_fields = ["product__name", "product__barcode", "notes"]

    @transaction.atomic
    def perform_destroy(self, instance):
        from rest_framework.exceptions import ValidationError

        stock = Stock.all_objects.select_for_update().get(pk=instance.pk)
        has_live_batches = InventoryBatch.objects.filter(
            product_id=stock.product_id, condition=stock.condition,
            status__in=(InventoryBatch.STATUS_ACTIVE, InventoryBatch.STATUS_EXPIRED),
            remaining_pieces__gt=0,
        ).exists()
        if stock.piece_amount > 0 or has_live_batches:
            raise ValidationError({'stock': 'Remove on-hand quantity with a documented stock adjustment before deleting the summary.'})
        super().perform_destroy(instance)
    
    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """Stock section report — position by condition and period damages."""
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

    @action(detail=False, methods=['get'], url_path='returned-for-packing')
    def returned_for_packing(self, request):
        from django.utils import timezone
        from api.models.data.packing import PackingReturn
        from api.serializers.data.packing import PackingReturnSerializer
        records = PackingReturn.objects.select_related('stock__product__raw_material').prefetch_related('packing_runs', 'return_events').order_by('-last_returned_at', '-id')
        if request.query_params.get('available_only') == 'true':
            records = records.filter(inventory_moved=True, remaining_bottle_count__gt=0).filter(
                Q(expire_date__isnull=True) | Q(expire_date__gte=timezone.localdate()))
        search = request.query_params.get('search', '').strip()
        if search:
            records = records.filter(stock__product__name__icontains=search)
        page = self.paginate_queryset(records)
        serializer = PackingReturnSerializer(page if page is not None else records, many=True)
        return self.get_paginated_response(serializer.data) if page is not None else Response({'results': serializer.data, 'count': records.count()})

    @action(detail=True, methods=['post'], url_path='correct-return')
    def correct_return(self, request, pk=None):
        from rest_framework import serializers
        from rest_framework.exceptions import ValidationError
        from api.models.data.packing import PackingReturn
        from api.serializers.data.packing import PackingReturnSerializer
        from api.services.repacking import correct_returned_quantity
        stock = self.get_object()

        class Payload(serializers.Serializer):
            packing_return = serializers.IntegerField(min_value=1)
            bottle_count = serializers.IntegerField(min_value=0, max_value=99999999)
            expected_bottle_count = serializers.IntegerField(min_value=0)
            notes = serializers.CharField(required=False, allow_blank=True, default='')

        payload = Payload(data=request.data)
        payload.is_valid(raise_exception=True)
        values = payload.validated_data
        if not PackingReturn.objects.filter(pk=values['packing_return'], stock=stock).exists():
            raise ValidationError({'packing_return': 'Select the returned record for this stock item.'})
        record = correct_returned_quantity(packing_return_id=values['packing_return'],
            bottle_count=values['bottle_count'], expected_bottle_count=values['expected_bottle_count'],
            notes=values['notes'], user=request.user)
        return Response(PackingReturnSerializer(record).data)

    @action(detail=True, methods=['get', 'post'], url_path='return-to-pack')
    def return_to_pack(self, request, pk=None):
        from rest_framework import serializers
        from api.services.repacking import return_to_pack
        stock = self.get_object()
        if request.method == 'GET':
            from api.serializers.data.packing import PackingReturnSerializer
            return Response(PackingReturnSerializer(stock.packing_returns.select_related('stock__product__raw_material').prefetch_related('packing_runs', 'return_events'), many=True).data)

        class Payload(serializers.Serializer):
            bottle_count = serializers.IntegerField(min_value=1)
            notes = serializers.CharField(required=False, allow_blank=True, default='')

        payload = Payload(data=request.data)
        payload.is_valid(raise_exception=True)
        record = return_to_pack(stock_id=stock.pk, user=request.user, **payload.validated_data)
        return Response({'id': record.pk, 'bottle_count': record.bottle_count}, status=201)

    @action(detail=True, methods=['get', 'post'], url_path='damage-bottles')
    def damage_bottles(self, request, pk=None):
        """
        Damage filled bottles from stock:
          - bottle_count × capacity = total liquid
          - remaining_liquid_kg returns to storage_tank
          - spilled liquid (total − remaining) is saved on Damaged materials with price
        """
        from decimal import Decimal
        from rest_framework import serializers, status
        from api.models.data.stock_bottle_damage import StockBottleDamage
        from api.services.stock_bottle_damage import (
            bottle_capacity_snapshot,
            damage_bottles_from_stock,
            liquid_unit_cost_per_kg,
        )

        stock = self.get_object()
        product = stock.product
        material = getattr(product, 'raw_material', None)

        if request.method == 'GET':
            try:
                capacity_kg, capacity_liters, density = bottle_capacity_snapshot(product, material)
            except Exception as exc:
                detail = getattr(exc, 'detail', None) or str(exc)
                return Response({'detail': detail}, status=400)
            history = list(
                StockBottleDamage.objects.filter(stock=stock)
                .select_related('storage_tank', 'damaged_record')
                .order_by('-recorded_at', '-id')[:20]
            )
            return Response({
                'stock': stock.pk,
                'product': product.pk,
                'product_name': product.name,
                'on_hand_bottles': int(stock.piece_amount or 0),
                'capacity_kg': str(capacity_kg),
                'capacity_liters': str(capacity_liters),
                'density_kg_per_liter': str(density),
                'liquid_unit_cost_afn': str(liquid_unit_cost_per_kg(product)),
                'history': [
                    {
                        'id': row.pk,
                        'bottle_count': row.bottle_count,
                        'total_liquid_kg': str(row.total_liquid_kg),
                        'remaining_liquid_kg': str(row.remaining_liquid_kg),
                        'damaged_liquid_kg': str(row.damaged_liquid_kg),
                        'damaged_liquid_cost_afn': str(row.damaged_liquid_cost_afn),
                        'storage_tank': row.storage_tank_id,
                        'storage_tank_name': row.storage_tank.name if row.storage_tank_id else None,
                        'damaged_number': (
                            row.damaged_record.damaged_number if row.damaged_record_id else None
                        ),
                        'recorded_at': row.recorded_at,
                        'notes': row.notes,
                    }
                    for row in history
                ],
            })

        class Payload(serializers.Serializer):
            bottle_count = serializers.IntegerField(min_value=1)
            remaining_liquid_kg = serializers.DecimalField(
                max_digits=14, decimal_places=4, min_value=Decimal('0'),
            )
            storage_tank = serializers.IntegerField(required=False, allow_null=True, min_value=1)
            notes = serializers.CharField(required=False, allow_blank=True, default='')

        payload = Payload(data=request.data)
        payload.is_valid(raise_exception=True)
        values = payload.validated_data
        record = damage_bottles_from_stock(
            stock_id=stock.pk,
            bottle_count=values['bottle_count'],
            remaining_liquid_kg=values['remaining_liquid_kg'],
            storage_tank_id=values.get('storage_tank'),
            notes=values.get('notes') or '',
            user=request.user,
        )
        return Response({
            'id': record.pk,
            'bottle_count': record.bottle_count,
            'total_liquid_kg': str(record.total_liquid_kg),
            'remaining_liquid_kg': str(record.remaining_liquid_kg),
            'damaged_liquid_kg': str(record.damaged_liquid_kg),
            'damaged_liquid_cost_afn': str(record.damaged_liquid_cost_afn),
            'liquid_unit_cost_afn': str(record.liquid_unit_cost_afn),
            'storage_tank': record.storage_tank_id,
            'damaged_record': record.damaged_record_id,
            'damaged_number': (
                record.damaged_record.damaged_number if record.damaged_record_id else None
            ),
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='output-products')
    def output_products(self, request):
        from api.models.data.products import Product
        from api.serializers.data.products import serialize_product
        kind = request.query_params.get('kind')
        qs = Product.objects.select_related('raw_material').order_by('name', 'id')
        if kind in {'bottle', 'carton', 'plastic'}:
            raw_types = ['bottle', 'bottle_with_cap'] if kind == 'bottle' else [kind]
            matching = Q(packaging_type=kind) | Q(packaging_type__isnull=True, raw_material__material_type__in=raw_types)
            if kind == 'bottle':
                matching |= Q(packaging_type__isnull=True, raw_material__isnull=True, bottles_per_carton=1) & (Q(bottle_capacity_kg__gt=0) | Q(bottle_capacity_liters__gt=0))
            qs = qs.filter(matching)
        else:
            qs = qs.filter(Q(packaging_type__isnull=False) | Q(raw_material__isnull=False))
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(name__icontains=search)
        page = self.paginate_queryset(qs)
        data = [serialize_product(p, request) for p in (page if page is not None else qs)]
        return self.get_paginated_response(data) if page is not None else Response({'results': data})

    @action(detail=False, methods=['post'], url_path='add-material')
    @transaction.atomic
    def add_material(self, request):
        from decimal import Decimal
        from rest_framework import serializers, status
        from api.models.data.raw_materials import RawMaterial
        from api.services.material_finished_stock import add_material_stock, resolve_output_product, PACKAGING_TYPES

        class MaterialInflow(serializers.Serializer):
            raw_material = serializers.PrimaryKeyRelatedField(queryset=RawMaterial.objects.filter(material_type__in=PACKAGING_TYPES), required=False, allow_null=True)
            product = serializers.IntegerField(min_value=1, required=False)
            product_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
            packaging_type = serializers.ChoiceField(choices=['bottle', 'carton', 'plastic'], required=False)
            bottle_capacity_kg = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=Decimal('0.0001'), required=False)
            quantity = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=Decimal('0.0001'))
            unit_cost_afn = serializers.DecimalField(max_digits=14, decimal_places=4, min_value=Decimal('0'), default=Decimal('0'))
            expire_date = serializers.DateField(required=False, allow_null=True)
            notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)

        serializer = MaterialInflow(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        material = data.get('raw_material')
        from api.models.data.products import Product
        selected = Product.objects.filter(pk=data.get('product')).first() if data.get('product') else None
        kind = data.get('packaging_type') or (material.material_type if material else selected.stock_kind if selected else None)
        kind = 'bottle' if kind == 'bottle_with_cap' else kind
        capacity_kg = data.get('bottle_capacity_kg') or (material.capacity_kg if material and kind == 'bottle' else None)
        density = selected.density_kg_per_liter if selected else Decimal('1')
        capacity_liters = capacity_kg / density if capacity_kg else (material.capacity_liters if material and kind == 'bottle' else None)
        product = resolve_output_product(kind=kind, product_id=data.get('product'), product_name=data.get('product_name'),
            material=material, bottle_capacity_kg=capacity_kg, bottle_capacity_liters=capacity_liters, density=density)
        if product is None and material is None:
            raise serializers.ValidationError({'product': 'Choose an existing product or enter a new product name.'})
        stock, _, _ = add_material_stock(material=material, product=product, quantity=data['quantity'],
            total_cost=data['quantity'] * data['unit_cost_afn'], notes=data.get('notes') or 'Manual material stock inflow',
            expire_date=data.get('expire_date'))
        return Response(self.get_serializer(stock).data, status=status.HTTP_201_CREATED)

    def get_queryset(self):
        queryset = super().get_queryset()
        
        stock_status = self.request.query_params.get('stock_status')
        if stock_status == 'out_of_stock':
            queryset = queryset.filter(piece_amount=0)
        elif stock_status == 'low_stock':
            queryset = queryset.filter(piece_amount__gt=0, piece_amount__lte=100)
        elif stock_status == 'in_stock':
            queryset = queryset.filter(piece_amount__gt=100)
        elif stock_status == 'expiring':
            days = int(self.request.query_params.get('days_ahead', 30))
            include_expired = str(
                self.request.query_params.get('include_expired', '1')
            ).lower() not in ('0', 'false', 'no')
            queryset = get_expiring_stock_queryset(
                days_ahead=days, include_expired=include_expired
            )
        
        material_type = self.request.query_params.get('material_type')
        if material_type:
            from rest_framework.exceptions import ValidationError
            if material_type not in {'bottle', 'carton', 'plastic'}:
                raise ValidationError({'material_type': 'Choose bottle, carton or plastic.'})
            raw_types = ['bottle', 'bottle_with_cap'] if material_type == 'bottle' else [material_type]
            matching = Q(product__packaging_type=material_type) | Q(
                product__packaging_type__isnull=True, product__raw_material__material_type__in=raw_types)
            if material_type == 'bottle':
                matching |= Q(product__packaging_type__isnull=True, product__raw_material__isnull=True,
                    product__bottles_per_carton=1) & (Q(product__bottle_capacity_kg__gt=0) | Q(product__bottle_capacity_liters__gt=0))
            queryset = queryset.filter(matching)

        category = self.request.query_params.get('category')
        if category:
            from django.db.models import Exists, OuterRef
            from rest_framework.exceptions import ValidationError
            from api.models.data.packing import PackingRunComponent, PackingRunOutput
            if not category.isdecimal() or int(category) < 1:
                raise ValidationError({'category': 'Choose a valid category.'})
            # Named stock products are independent of raw materials. Match only
            # the component that produced this output, not other materials in its run.
            components = PackingRunComponent.objects.filter(
                packing_run_id=OuterRef('packing_run_id'),
                component_type=OuterRef('component_type'),
                raw_material_stock__raw_material__category_id=int(category),
            )
            outputs = PackingRunOutput.objects.filter(stock_id=OuterRef('pk')).filter(Exists(components))
            queryset = queryset.filter(Q(product__raw_material__category_id=int(category)) | Q(Exists(outputs)))
        return queryset

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            return super().update(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def expiring(self, request):
        """Near-expiry (and optionally already-expired) on-hand lots."""
        from api.models.data.inventory_batch import InventoryBatch
        from api.serializers.data.inventory_batch import InventoryBatchListSerializer
        from api.services.batch_queries import expiring_attention_q, near_expiry_q

        days = int(request.query_params.get('days_ahead', 30))
        include_expired = str(
            request.query_params.get('include_expired', '1')
        ).lower() not in ('0', 'false', 'no')
        status_filter = (request.query_params.get('expiry_status') or '').strip().lower()

        if status_filter == 'expired':
            from api.services.batch_queries import expired_on_hand_q
            q = expired_on_hand_q()
        elif status_filter == 'expiring':
            q = near_expiry_q(days)
        else:
            q = expiring_attention_q(days, include_expired=include_expired)

        qs = (
            InventoryBatch.objects.filter(q)
            .select_related('product', 'supplier')
            .order_by('expire_date', 'created_at')
        )
        qs = _search_batches(qs, request.query_params.get('search'))

        page = self.paginate_queryset(qs)
        serializer = InventoryBatchListSerializer(
            page if page is not None else qs,
            many=True,
            context={'request': request},
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def expired(self, request):
        """Already-expired on-hand lots (active or expired status) with remaining qty."""
        from api.models.data.inventory_batch import InventoryBatch
        from api.serializers.data.inventory_batch import InventoryBatchListSerializer
        from api.services.batch_queries import expired_on_hand_q

        qs = (
            InventoryBatch.objects.filter(expired_on_hand_q())
            .select_related('product', 'supplier')
            .order_by('expire_date', 'created_at')
        )
        qs = _search_batches(qs, request.query_params.get('search'))

        # Flip lingering active+past-date rows to expired without hiding them
        InventoryBatch.objects.filter(
            pk__in=qs.filter(status=InventoryBatch.STATUS_ACTIVE).values('pk')
        ).update(status=InventoryBatch.STATUS_EXPIRED)

        page = self.paginate_queryset(qs)
        serializer = InventoryBatchListSerializer(
            page if page is not None else qs,
            many=True,
            context={'request': request},
        )
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def scan_expiry_notifications(self, request):
        """Scan for expiring / low stock and create notifications (delegates to service)."""
        from api.services.notifications import scan_stock_alerts

        days = int(request.data.get('days_ahead', 30) or 30)
        threshold = int(request.data.get('low_stock_threshold', 100) or 100)
        result = scan_stock_alerts(
            days_ahead=days,
            low_stock_threshold=threshold,
            include_low_stock=True,
            mark_expired=True,
        )
        return Response(
            {
                'created_or_updated': result['created'],
                'refreshed': result['refreshed'],
                'resolved': result['resolved'],
            }
        )

    @action(detail=True, methods=['post'])
    def move_condition(self, request, pk=None):
        """
        Move quantity from this stock lot into another condition lot
        (typically good → damaged).

        Body:
          - condition: target condition (required), e.g. "damaged"
          - dana_amount: pieces to move (required)
          - buy_price: optional per-piece price (defaults to source buy_price)
          - notes: optional
        """
        from api.services.stock_condition_move import move_stock_to_condition

        source = self.get_object()
        target_condition = (request.data.get('condition') or '').strip()
        dana_amount = request.data.get('dana_amount')
        buy_price = request.data.get('buy_price', None)
        notes = (request.data.get('notes') or '').strip()

        target = move_stock_to_condition(
            source=source,
            target_condition=target_condition,
            piece_amount=request.data.get('piece_amount', dana_amount),
            dana_amount=dana_amount,
            buy_price=buy_price,
            notes=notes,
            batch_id=request.data.get('batch_id') or None,
            user=request.user,
        )
        return Response(self.get_serializer(target).data)

    @action(detail=True, methods=['post'])
    def return_to_main(self, request, pk=None):
        """

        Body:
          - piece_amount / dana_amount: pieces to return
          - batch_id: optional specific batch
          - reason: expired | damaged | other (optional; inferred from lot)
          - notes: optional
        """
        from api.models.data.inventory_batch import InventoryBatch
        from api.serializers.data.stock_transfer import StockTransferSerializer
        from api.services.stock_return_to_main import return_stock_to_main

        source = self.get_object()
        batch_id = request.data.get('batch_id') or None
        batch = None
        if batch_id:
            batch = InventoryBatch.objects.filter(pk=batch_id).first()
            if not batch:
                return Response(
                    {'batch_id': f'Batch {batch_id} not found.'},
                    status=400,
                )

        transfer, target = return_stock_to_main(
            source=source,
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
                'target_stock': self.get_serializer(target).data,
            }
        )

    @action(detail=True, methods=['post'])
    def write_off(self, request, pk=None):
        """
        Write off / dispose expired or damaged stock (typical at main warehouse).

        Posts Dr Stock Adjustments · Cr Inventory. Reduces on-hand qty.

        Body:
          - piece_amount / dana_amount: pieces to write off
          - batch_id: optional specific batch
          - adjustment_type: expired | damaged | lost (optional; inferred)
          - notes: optional
        """
        from api.models.data.inventory_batch import InventoryBatch
        from api.serializers.data.inventory_batch import StockAdjustmentSerializer
        from api.services.stock_write_off import write_off_stock

        source = self.get_object()
        batch_id = request.data.get('batch_id') or None
        batch = None
        if batch_id:
            batch = InventoryBatch.objects.filter(pk=batch_id).first()
            if not batch:
                return Response(
                    {'batch_id': f'Batch {batch_id} not found.'},
                    status=400,
                )

        result = write_off_stock(
            source=source,
            batch=batch,
            piece_amount=request.data.get(
                'piece_amount', request.data.get('dana_amount')
            ),
            adjustment_type=(request.data.get('adjustment_type') or '').strip() or None,
            notes=(request.data.get('notes') or '').strip(),
            user=request.user,
        )
        source.refresh_from_db()
        return Response(
            {
                'adjustment_type': result['adjustment_type'],
                'piece_amount': str(result['piece_amount']),
                'adjustments': StockAdjustmentSerializer(
                    result['adjustments'], many=True
                ).data,
                'stock': self.get_serializer(source).data,
            }
        )
