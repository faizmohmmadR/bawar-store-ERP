from decimal import Decimal
from django.db import transaction
from rest_framework.viewsets import ModelViewSet
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from django.db.models import F, Prefetch
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter
from api.views.data.base import DataRootViewSet
from api.models.data.raw_materials import RawMaterialCategory, RawMaterial, RawMaterialPurchase, RawMaterialPurchaseItem, RawMaterialStock
from api.serializers.data.raw_materials import (
    RawMaterialSerializer,
    RawMaterialCategorySerializer,
    RawMaterialPurchaseSerializer,
    RawMaterialPurchaseItemSerializer,
    RawMaterialPurchaseListSerializer,
    RawMaterialStockSerializer,
    RawMaterialStockUpdateSerializer,
    RawMaterialStockDirectSerializer,
)
from api.utils.order_numeric import quantize_order_amount
from api.services.raw_material_stock import (
    reconcile_raw_material_stock,
)
from api.services.raw_material_process import purchase_has_active_production_usage


def _validate_unique_purchase_materials(items_data):
    material_ids = []
    for item in items_data:
        raw_material_id = item.get('raw_material')
        if raw_material_id in (None, '', 0, '0'):
            continue
        try:
            material_ids.append(int(raw_material_id))
        except (TypeError, ValueError):
            continue
    if len(material_ids) != len(set(material_ids)):
        raise ValidationError({
            'purchase_items': 'A raw material can only be added once per purchase.'
        })


def _purchase_items_total(items_data, *, is_free=False):
    fields = RawMaterialPurchaseItemSerializer().fields
    total = Decimal('0')
    for index, item in enumerate(items_data):
        values = {}
        for name in ('quantity', 'price_per_unit'):
            try:
                values[name] = fields[name].run_validation(0 if is_free and name == 'price_per_unit' else item.get(name))
                if name == 'price_per_unit' and not is_free and values[name] <= 0:
                    raise ValidationError('Enter a positive price for paid purchases.')
            except ValidationError as exc:
                raise ValidationError({
                    'purchase_items': {index: {name: exc.detail}}
                }) from exc
        total += values['quantity'] * values['price_per_unit']
    # Validate the accumulated amount as well as each individual line.
    amount = quantize_order_amount(total)
    return RawMaterialPurchaseSerializer().fields['total_amount'].run_validation(amount)


class RawMaterialCategoryViewSet(DataRootViewSet):
    permission_module = 'raw_materials'
    queryset = RawMaterialCategory.objects.all()
    serializer_class = RawMaterialCategorySerializer
    search_fields = ['name']

    def perform_destroy(self, instance):
        if RawMaterial.all_objects.filter(category=instance).exists():
            raise ValidationError({'detail': 'Reassign the materials in this category before deleting it.'})
        super().perform_destroy(instance)


class RawMaterialViewSet(DataRootViewSet):
    """Viewset for RawMaterial model."""
    permission_module = 'raw_materials'
    queryset = RawMaterial.objects.select_related('category').all().order_by('name')
    serializer_class = RawMaterialSerializer
    filterset_fields = ['material_type', 'unit', 'category']
    search_fields = ['name', 'description', 'category__name']

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get('component_role')
        if role == 'label':
            qs = qs.filter(material_type__in=RawMaterial.LABEL_TYPES)
        elif role == 'cap':
            qs = qs.filter(material_type=RawMaterial.TYPE_CAP)
        elif role == 'cap_label':
            qs = qs.filter(material_type=RawMaterial.TYPE_CAP_LABEL)
        elif role == 'plastic':
            qs = qs.filter(material_type=RawMaterial.TYPE_PLASTIC)
        elif role == 'carton':
            qs = qs.filter(material_type=RawMaterial.TYPE_CARTON)
        return qs

    def get_serializer_class(self):
        return RawMaterialSerializer

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """Standard raw-material inventory report (stock, purchases, consumption, sales)."""
        from api.services.raw_material_report import get_raw_material_report
        from api.services.report_period import format_report_period_response, resolve_report_period

        start_date, end_date = resolve_report_period(
            period=request.query_params.get('period', 'monthly'),
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            fiscal_year_id=request.query_params.get('fiscal_year_id'),
        )
        report = get_raw_material_report(start_date=start_date, end_date=end_date)
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })


class RawMaterialPurchaseViewSet(DataRootViewSet):
    """Viewset for RawMaterialPurchase model with stock handling."""
    permission_module = 'raw_material_purchases'
    queryset = RawMaterialPurchase.objects.select_related(
        'vendor').all().order_by("-purchase_date")
    serializer_class = RawMaterialPurchaseSerializer
    filterset_fields = ["vendor", "currency", "status", "transaction_type"]
    search_fields = ["vendor__name", "invoice_number", "bill_number", "notes"]

    def get_serializer_class(self):
        if self.action == 'list':
            return RawMaterialPurchaseListSerializer
        return RawMaterialPurchaseSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('period'):
            from api.services.report_period import resolve_report_period
            if params['period'] not in {'all', 'daily', 'weekly', 'yearly'}:
                raise ValidationError({'period': 'Select a valid purchase period.'})
            start, end = resolve_report_period(period=params['period'])
            if start is not None:
                qs = qs.filter(purchase_date__gte=start)
            if end is not None:
                qs = qs.filter(purchase_date__lte=end)
        from rest_framework import serializers
        dates = {}
        for key in ('date_from', 'date_to'):
            if params.get(key):
                try:
                    dates[key] = serializers.DateField().run_validation(params[key])
                except ValidationError:
                    raise ValidationError({key: 'Enter a valid date (YYYY-MM-DD).'})
        if dates.get('date_from') and dates.get('date_to') and dates['date_from'] > dates['date_to']:
            raise ValidationError({'date_to': 'End date must be on or after start date.'})
        if 'date_from' in dates:
            qs = qs.filter(purchase_date__date__gte=dates['date_from'])
        if 'date_to' in dates:
            qs = qs.filter(purchase_date__date__lte=dates['date_to'])
        if params.get('raw_material'):
            try:
                material_id = int(params['raw_material'])
            except (ValueError, TypeError):
                raise ValidationError({'raw_material': 'Select a valid material.'})
            qs = qs.filter(items__raw_material_id=material_id, items__deleted_at__isnull=True).distinct()
        outstanding = self.request.query_params.get('outstanding')
        if outstanding in ('1', 'true', 'True'):
            qs = qs.filter(
                status='received',
                total_amount__gt=F('paid_amount'),
            )

        if self.action == 'retrieve':
            qs = qs.prefetch_related('items')
        return qs

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Create a raw material purchase with items and update stock.
        """
        with transaction.atomic():
            try:
                items_data = request.data.get(
                    'items', []) or request.data.get('purchase_items', [])
                items_data = [
                    item for item in items_data
                    if item.get('raw_material') not in (None, '', 0, '0')
                ]
                _validate_unique_purchase_materials(items_data)

                data = request.data.copy() if hasattr(
                    request.data, 'copy') else dict(request.data)

                # Calculate total amount from items
                total_amount = _purchase_items_total(items_data, is_free=data.get('transaction_type', 'paid') == 'free')

                subtotal = total_amount

                data['total_amount'] = quantize_order_amount(subtotal)
                data['paid_amount'] = RawMaterialPurchaseSerializer().fields[
                    'paid_amount'
                ].run_validation(data.get('paid_amount', 0) or 0)

                if 'items' in data:
                    del data['items']
                if 'purchase_items' in data:
                    del data['purchase_items']

                serializer = self.get_serializer(data=data)
                serializer.is_valid(raise_exception=True)
                self.perform_create(serializer)
                purchase = serializer.instance

                # Create items and update stock
                created_items = []
                for item_data in items_data:
                    item_data = dict(item_data)
                    item_data['purchase'] = purchase.id
                    if purchase.is_free:
                        item_data['price_per_unit'] = 0

                    item_serializer = RawMaterialPurchaseItemSerializer(
                        data=item_data, context=self.get_serializer_context())
                    item_serializer.is_valid(raise_exception=True)
                    item = item_serializer.save()
                    created_items.append(item)

                reconcile_raw_material_stock(
                    purchase,
                    previous_status='draft',
                    previous_items=[],
                    save_stock=True,
                )

                purchase.refresh_from_db()
                from api.services.accounting import sync_raw_material_purchase_journal
                sync_raw_material_purchase_journal(purchase)

                response_data = RawMaterialPurchaseSerializer(
                    purchase, context=self.get_serializer_context()).data
                response_data['items'] = RawMaterialPurchaseItemSerializer(
                    created_items, many=True, context=self.get_serializer_context()).data

                return Response(response_data, status=status.HTTP_201_CREATED)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(
                    f"Raw material purchase creation failed: {str(e)}")
                raise

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        """
        Update a raw material purchase with items and stock.
        """
        with transaction.atomic():
            purchase = self.get_object()
            purchase = RawMaterialPurchase.objects.select_for_update().get(pk=purchase.pk)
            old_transaction_type = purchase.transaction_type
            old_status = purchase.status

            data = request.data.copy()
            items_provided = 'items' in data or 'purchase_items' in data
            if items_provided:
                items_data = data.get('items') or data.get(
                    'purchase_items') or []
                items_data = [
                    item for item in items_data
                    if item.get('raw_material') not in (None, '', 0, '0')
                ]
                _validate_unique_purchase_materials(items_data)
            else:
                items_data = None

            has_active_production_use = purchase_has_active_production_usage(
                purchase
            )
            requested_status = data.get('status', old_status)
            requested_currency = data.get('currency')
            currency_changed = (
                requested_currency not in (None, '')
                and str(requested_currency) != str(purchase.currency)
            )
            requested_purchase_date = data.get('purchase_date')
            purchase_date_changed = (
                requested_purchase_date not in (None, '')
                and str(requested_purchase_date)[:10]
                != purchase.purchase_date.date().isoformat()
            )
            if has_active_production_use and (
                items_data is not None
                or requested_status != 'received'
                or currency_changed
                or purchase_date_changed
            ):
                raise ValidationError(
                    'This received purchase has been consumed by production and its items or status cannot be changed.'
                )

            if 'items' in data:
                del data['items']
            if 'purchase_items' in data:
                del data['purchase_items']

            # Calculate total amount
            if items_data is not None:
                total_amount = _purchase_items_total(items_data, is_free=data.get('transaction_type', purchase.transaction_type) == 'free')

                data['total_amount'] = quantize_order_amount(total_amount)

            # Snapshot the purchase's current stock effect before changing it.
            existing_items = {item.id: item for item in purchase.items.all()}
            previous_stock_items = [
                (item.raw_material_id, item.quantity, item.piece_count, item.quantity * item.price_per_unit_base)
                for item in existing_items.values()
            ]
            old_exchange_rate = purchase.exchange_rate

            # Update purchase
            original_data = request.data
            request._full_data = data
            try:
                response = super().update(request, *args, **kwargs)
            finally:
                request._full_data = original_data
            purchase = self.get_object()
            if old_transaction_type != purchase.transaction_type and items_data is None:
                if not purchase.is_free:
                    raise ValidationError({'purchase_items': 'Enter prices when changing a free purchase to paid.'})
                for item in purchase.items.all():
                    item.price_per_unit = 0
                    item.save()

            if items_data is not None:
                processed_item_ids = set()
                for item_data in items_data:
                    item_data = dict(item_data)
                    raw_item_id = item_data.get('id')
                    try:
                        item_id = int(raw_item_id) if raw_item_id not in (
                            None, '') else None
                    except (TypeError, ValueError):
                        item_id = None

                    if item_id and item_id in existing_items:
                        item = existing_items[item_id]
                        item_serializer = RawMaterialPurchaseItemSerializer(
                            instance=item, data=item_data, partial=True, context=self.get_serializer_context()
                        )
                        item_serializer.is_valid(raise_exception=True)
                        updated_item = item_serializer.save()
                        processed_item_ids.add(updated_item.id)
                    else:
                        item_data['purchase'] = purchase.id
                        item_serializer = RawMaterialPurchaseItemSerializer(
                            data=item_data, context=self.get_serializer_context())
                        item_serializer.is_valid(raise_exception=True)
                        new_item = item_serializer.save()
                        processed_item_ids.add(new_item.id)

                # Delete items not in the new list
                for item_id, item in existing_items.items():
                    if item_id not in processed_item_ids:
                        item.delete()

            if old_exchange_rate != purchase.exchange_rate:
                for item in purchase.items.all():
                    item.save()

            if (
                items_data is not None
                or old_status != purchase.status
                or old_transaction_type != purchase.transaction_type
                or old_exchange_rate != purchase.exchange_rate
            ):
                reconcile_raw_material_stock(
                    purchase,
                    previous_status=old_status,
                    previous_items=previous_stock_items,
                    save_stock=True,
                )

            response.data['items'] = RawMaterialPurchaseItemSerializer(
                purchase.items.all(), many=True, context=self.get_serializer_context()
            ).data

            purchase.refresh_from_db()
            from api.services.accounting import sync_raw_material_purchase_journal
            sync_raw_material_purchase_journal(purchase)

            return response

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            purchase = self.get_object()
            if purchase_has_active_production_usage(purchase):
                raise ValidationError(
                    'This purchase has been consumed by production and cannot be deleted.'
                )
            # Soft-delete must reverse received stock; journal cleanup alone left
            # orphan quantities that inflated operational inventory vs GL 1100.
            if purchase.status == 'received':
                previous_items = [
                    (
                        item.raw_material_id,
                        item.quantity,
                        item.piece_count,
                        item.quantity * item.price_per_unit_base,
                    )
                    for item in purchase.items.all()
                ]
                original_status = purchase.status
                purchase.status = 'cancelled'
                reconcile_raw_material_stock(
                    purchase,
                    previous_status=original_status,
                    previous_items=previous_items,
                    save_stock=True,
                )
                purchase.status = original_status
            from api.services.accounting import delete_journal_for_source
            delete_journal_for_source(purchase)
            return super().destroy(request, *args, **kwargs)


class RawMaterialStockViewSet(DataRootViewSet):
    """Viewset for RawMaterialStock model."""
    permission_module = 'raw_material_stocks'
    queryset = RawMaterialStock.objects.select_related(
        'raw_material', 'raw_material__category').prefetch_related(
            Prefetch(
                'raw_material__purchase_items',
                queryset=RawMaterialPurchaseItem.objects.filter(
                    purchase__status='received',
                    purchase__deleted_at__isnull=True,
                    quantity__gt=0,
                ).select_related('purchase').order_by(
                    'purchase__purchase_date', 'id'
                ),
                to_attr='received_purchase_items',
            )
    ).all().order_by('raw_material__name')
    serializer_class = RawMaterialStockSerializer
    filterset_fields = ['raw_material', 'raw_material__material_type', 'raw_material__category']
    search_fields = ['raw_material__name', 'raw_material__category__name']

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get('component_role')
        if role == 'label':
            qs = qs.filter(raw_material__material_type__in=RawMaterial.LABEL_TYPES)
        elif role == 'cap':
            qs = qs.filter(raw_material__material_type=RawMaterial.TYPE_CAP)
        elif role == 'cap_label':
            qs = qs.filter(raw_material__material_type=RawMaterial.TYPE_CAP_LABEL)
        elif role == 'plastic':
            qs = qs.filter(raw_material__material_type=RawMaterial.TYPE_PLASTIC)
        elif role == 'carton':
            qs = qs.filter(raw_material__material_type=RawMaterial.TYPE_CARTON)
        return qs

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Directly create a stock entry (not purchase-linked)."""
        with transaction.atomic():
            serializer = RawMaterialStockDirectSerializer(
                data=request.data, context=self.get_serializer_context()
            )
            serializer.is_valid(raise_exception=True)
            instance = serializer.save()
            from api.services.accounting import sync_raw_material_stock_opening_journal
            sync_raw_material_stock_opening_journal(instance)
            return Response(
                RawMaterialStockSerializer(instance, context=self.get_serializer_context()).data,
                status=status.HTTP_201_CREATED,
            )

    def update(self, request, *args, **kwargs):
        """Directly edit a stock entry (quantity, price, date)."""
        with transaction.atomic():
            partial = kwargs.pop('partial', False)
            instance = self.get_object()
            serializer = RawMaterialStockDirectSerializer(
                instance, data=request.data, partial=partial,
                context=self.get_serializer_context()
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            instance.refresh_from_db()
            from api.services.accounting import sync_raw_material_stock_opening_journal
            sync_raw_material_stock_opening_journal(instance)
            return Response(
                RawMaterialStockSerializer(instance, context=self.get_serializer_context()).data
            )

    def destroy(self, request, *args, **kwargs):
        """Delete a stock entry directly."""
        with transaction.atomic():
            instance = self.get_object()
            from api.services.accounting import delete_journal_for_source
            delete_journal_for_source(instance)
            instance.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
