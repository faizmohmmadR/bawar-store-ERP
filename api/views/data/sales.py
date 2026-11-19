from contextlib import contextmanager
from decimal import Decimal

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from api.models.data.sales import Sales, SalesItems
from api.serializers.data.sales import SalesSerializer, SalesItemsSerializer, SalesListSerializer
from api.models.data.currency import BASE_CURRENCY_ID
from api.utils.currency import convert_currency
from api.views.data.base import DataRootViewSet
from api.views.mixins.order_stock import OrderStockViewMixin
from django.db.models import Count, Exists, F, OuterRef, Prefetch, Q
from api.services.fefo_allocation import (
    allocate_inventory_for_sale_item,
    revert_sale_item_allocations,
    update_sale_item_allocations,
    InsufficientInventoryError,
)
from api.services.raw_material_sales import (
    raw_stock_quantity, raw_stock_pieces,
    apply_raw_material_sale_item,
    revert_raw_material_sale_item,
)
from api.services.tank_inventory import validate_tank_fill_quantity


class SalesViewSet(OrderStockViewMixin, DataRootViewSet):
    permission_module = 'sales'
    queryset = Sales.objects.select_related(
        'customer', 'salesman', 'employee', 'vendor', 'salary_settlement',
    ).all().order_by("-sale_date")
    # raw_material_stock is select_related on sales_items prefetch below when needed
    serializer_class = SalesSerializer
    filterset_fields = [
        "customer", "salesman", "employee", "currency", "status",
        "transaction_type", "vendor", "vendor_transaction",
    ]
    search_fields = [
        "vendor__name",
        "customer__name",
        "customer__phone",
        "customer__email",
        "employee__full_name",
        "employee__phone",
        "salesman__name",
        "invoice_number",
        "bill_no",
        "notes",
    ]

    def get_serializer_class(self):
        if self.action == 'list':
            return SalesListSerializer
        return SalesSerializer

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """Sales section report — AFN totals and native by-currency breakdown."""
        from api.services.sales_report import get_sales_report
        from api.services.report_period import format_report_period_response, resolve_report_period

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

    def get_queryset(self):
        qs = super().get_queryset()

        outstanding = self.request.query_params.get('outstanding')
        if outstanding in ('1', 'true', 'True'):
            qs = qs.filter(
                total_amount__gt=F('paid_amount'),
                vendor__isnull=True,
                employee__isnull=True,
            ).exclude(status='cancelled')

        sale_kind = (self.request.query_params.get('sale_kind') or '').strip().lower()
        if sale_kind in ('raw_material', 'raw-materials', 'rm'):
            qs = filter_raw_material_only_sales(qs)
        elif sale_kind in ('finished', 'product', 'stock_tank'):
            qs = qs.exclude(
                pk__in=filter_raw_material_only_sales(Sales.objects.all()).values('pk'),
            )

        if self.action == 'retrieve':
            qs = qs.prefetch_related(
                'documents',
                Prefetch(
                    'sales_items',
                    queryset=SalesItems.objects.select_related(
                        'stock',
                        'stock__product',
                        'storage_tank',
                        'raw_material_stock',
                        'raw_material_stock__raw_material',
                    ),
                )
            )
        return qs

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()

    @contextmanager
    def _sale_item_validation(self, index):
        try:
            yield
        except ValidationError as exc:
            raise ValidationError({'sales_items': {index: exc.detail}}) from exc

    def _ensure_commission_has_salesman(self, sale, items_data=None):
        """Line commissions require a salesman on the sale header."""
        has_commission = False
        if items_data is not None:
            for item_data in items_data or []:
                try:
                    amount = Decimal(str(item_data.get('commission_amount') or 0))
                except Exception:
                    amount = Decimal('0')
                if amount > 0:
                    has_commission = True
                    break
        else:
            has_commission = sale.sales_items.filter(commission_amount__gt=0).exists()

        if has_commission and not sale.salesman_id:
            raise ValidationError({
                'salesman': 'Select a salesman when items have commission.',
            })

    def _save_stock(self, stock):
        """Save stock without triggering manual adjustment journal (sale/purchase handles GL)."""
        stock._skip_stock_journal = True
        stock.save()

    def _snapshot_unit_cost(self, item):
        """Store inventory cost in AFN (per piece for stock, per liter for tank, per unit for RM)."""
        item.cost_is_known = True
        item.save(update_fields=["cost_is_known"])
        if item.sale_source == SalesItems.SOURCE_TANK and item.storage_tank_id:
            from api.services.tank_inventory import get_tank_density
            _, unit_cost = validate_tank_fill_quantity(
                item.storage_tank,
                item.liter_amount,
                exclude_sale_item_id=item.pk,
            )
            item.unit_cost = (
                unit_cost / get_tank_density(
                    item.storage_tank,
                    exclude_sale_item_id=item.pk,
                )
                if item.unit == SalesItems.UNIT_KG
                else unit_cost
            )
            item.save(update_fields=['unit_cost'])
            return
        if item.sale_source == SalesItems.SOURCE_RAW_MATERIAL and item.raw_material_stock_id:
            # Raw material last_purchase_price is already AFN.
            item.unit_cost = getattr(item, '_prior_raw_unit_cost', item.raw_material_stock.last_purchase_price or 0)
            item.save(update_fields=['unit_cost'])
            return
        if Decimal(str(item.unit_cost or 0)) > 0:
            return
        if item.stock_id:
            stock = item.stock
            sale = item.sales
            item.unit_cost = convert_currency(
                stock.buy_price,
                stock.currency,
                BASE_CURRENCY_ID,
                sale.sale_date,
            )
            item.save(update_fields=['unit_cost'])

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
            sales_items_data = data.pop('sales_items', None)
            period_calendar = data.pop('period_calendar', None)
            if 'invoice_number' in data:
                data.pop('invoice_number')

            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            sale = serializer.instance
            affects_stock = self._order_affects_stock(sale)

            for index, item_data in enumerate(sales_items_data or []):
                with self._sale_item_validation(index):
                    item_data['sales'] = sale.id
                    item_serializer = SalesItemsSerializer(data=item_data, context=self.get_serializer_context())
                    item_serializer.is_valid(raise_exception=True)
                    item = item_serializer.save()
                    self._snapshot_unit_cost(item)
                    if affects_stock:
                        self._update_stock_for_sales_item(item, sale)

            if not sale.is_free and sale.sales_items.filter(sell_price__lte=0).exists():
                raise ValidationError({'sales_items': 'Enter positive prices when changing a free sale to paid.'})
            if sale.is_free:
                sale.sales_items.update(sell_price=0, commission_amount=0)
            self._ensure_commission_has_salesman(sale)

            from api.services.accounting import recalculate_sale_totals, sync_sales_journal
            from api.services.employee_sale_salary import sync_employee_sale_salary_settlement
            recalculate_sale_totals(sale)
            sync_sales_journal(sale)
            sync_employee_sale_salary_settlement(sale, period_calendar=period_calendar)
            sale.refresh_from_db()

            response_data = SalesSerializer(sale, context=self.get_serializer_context()).data
            response_data['sales_items'] = SalesItemsSerializer(
                SalesItems.objects.filter(sales=sale), many=True, context=self.get_serializer_context()
            ).data
            return Response(response_data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            sale = self.get_object()
            old_status = sale.status
            if sale.returns.exists() and (('transaction_type' in request.data and request.data['transaction_type'] != sale.transaction_type) or 'sales_items' in request.data or ('status' in request.data and request.data['status'] != old_status)):
                raise ValidationError({'detail': 'Remove existing returns before changing sale items or status.'})

            data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
            items_provided = 'sales_items' in data
            sales_items_data = data.pop('sales_items', []) if items_provided else None
            period_calendar = data.pop('period_calendar', None)

            existing_items = {item.id: item for item in sale.sales_items.all()}

            serializer = self.get_serializer(sale, data=data, partial=kwargs.get('partial', False))
            serializer.is_valid(raise_exception=True)
            serializer.save()
            sale.refresh_from_db()

            affects_stock = self._order_affects_stock(sale)

            if old_status != sale.status:
                self._apply_status_stock_transition(
                    sale,
                    old_status,
                    sale.sales_items.all(),
                    apply_item=self._update_stock_for_sales_item,
                    revert_item=self._increase_stock_for_sales_item,
                )

            if items_provided and affects_stock:
                processed_item_ids = set()
                for index, item_data in enumerate(sales_items_data):
                    with self._sale_item_validation(index):
                        item_id = item_data.get('id')

                        if item_id and item_id in existing_items:
                            item = existing_items[item_id]
                            from api.utils.packaging import sales_item_pieces
                            old_piece_amount = sales_item_pieces(item)
                            old_stock = item.stock
                            old_tank = item.storage_tank
                            old_rm_stock = item.raw_material_stock
                            item._prior_raw_unit_cost = item.unit_cost
                            old_rm_quantity = raw_stock_quantity(item) if item.raw_material_stock_id else item.quantity
                            old_rm_piece_count = raw_stock_pieces(item) if item.raw_material_stock_id else item.piece_count
                            old_source = item.sale_source

                            item_serializer = SalesItemsSerializer(
                                instance=item, data=item_data, partial=True, context=self.get_serializer_context()
                            )
                            item_serializer.is_valid(raise_exception=True)
                            updated_item = item_serializer.save()
                            self._snapshot_unit_cost(updated_item)
                            self._update_stock_for_sales_item_update(
                                updated_item,
                                sale,
                                old_piece_amount,
                                old_stock=old_stock,
                                old_tank=old_tank,
                                old_source=old_source,
                                old_raw_material_stock=old_rm_stock,
                                old_raw_material_quantity=old_rm_quantity,
                                old_raw_material_piece_count=old_rm_piece_count,
                            )
                            processed_item_ids.add(item_id)
                        else:
                            item_data['sales'] = sale.id
                            item_serializer = SalesItemsSerializer(data=item_data, context=self.get_serializer_context())
                            item_serializer.is_valid(raise_exception=True)
                            new_item = item_serializer.save()
                            self._snapshot_unit_cost(new_item)
                            if affects_stock:
                                self._update_stock_for_sales_item(new_item, sale)
                            processed_item_ids.add(new_item.id)

                for item_id, item in existing_items.items():
                    if item_id not in processed_item_ids:
                        self._increase_stock_for_sales_item(item, sale)
                        item.delete()
            elif items_provided:
                processed_item_ids = set()
                for index, item_data in enumerate(sales_items_data):
                    with self._sale_item_validation(index):
                        item_id = item_data.get('id')
                        if item_id and item_id in existing_items:
                            item = existing_items[item_id]
                            item_serializer = SalesItemsSerializer(
                                instance=item, data=item_data, partial=True, context=self.get_serializer_context()
                            )
                            item_serializer.is_valid(raise_exception=True)
                            updated_item = item_serializer.save()
                            self._snapshot_unit_cost(updated_item)
                            processed_item_ids.add(item_id)
                        else:
                            item_data['sales'] = sale.id
                            item_serializer = SalesItemsSerializer(data=item_data, context=self.get_serializer_context())
                            item_serializer.is_valid(raise_exception=True)
                            new_item = item_serializer.save()
                            self._snapshot_unit_cost(new_item)
                            processed_item_ids.add(new_item.id)

                for item_id, item in existing_items.items():
                    if item_id not in processed_item_ids:
                        item.delete()

            if not sale.is_free and sale.sales_items.filter(sell_price__lte=0).exists():
                raise ValidationError({'sales_items': 'Enter positive prices when changing a free sale to paid.'})
            if sale.is_free:
                sale.sales_items.update(sell_price=0, commission_amount=0)
            self._ensure_commission_has_salesman(sale)
            from api.services.accounting import recalculate_sale_totals, sync_sales_journal
            from api.services.employee_sale_salary import sync_employee_sale_salary_settlement
            recalculate_sale_totals(sale)
            sync_sales_journal(sale)
            sync_employee_sale_salary_settlement(sale, period_calendar=period_calendar)
            sale.refresh_from_db()

            response_data = SalesSerializer(sale, context=self.get_serializer_context()).data
            response_data['sales_items'] = SalesItemsSerializer(
                SalesItems.objects.filter(sales=sale), many=True, context=self.get_serializer_context()
            ).data
            return Response(response_data)

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            if self.get_object().returns.exists():
                raise ValidationError({'detail': 'Remove existing returns before deleting this sale.'})
            return super().destroy(request, *args, **kwargs)

    def perform_destroy(self, instance):
        if (instance.vendor_id or instance.employee_id) and not self._permanent_delete_requested():
            if self._order_affects_stock(instance):
                for item in instance.sales_items.all():
                    self._increase_stock_for_sales_item(item, instance)
            # Restoring from trash keeps this document cancelled until explicitly reactivated.
            instance.status = 'cancelled'
            instance.save(update_fields=['status', 'updated_at'])
            if instance.employee_id:
                from api.services.employee_sale_salary import sync_employee_sale_salary_settlement
                sync_employee_sale_salary_settlement(instance)
        return super().perform_destroy(instance)

    def perform_hard_destroy(self, instance):
        restore_stock = self._order_affects_stock(instance) and instance.deleted_at is None
        if instance.returns.exists():
            raise ValidationError({'detail': 'Remove existing returns before deleting this sale.'})
        if instance.vendor_id:
            from api.services.vendor_goods import sync_vendor_goods_credit
            instance.status = 'cancelled'
            Sales.all_objects.filter(pk=instance.pk).update(status='cancelled')
            sync_vendor_goods_credit(instance)
        if instance.employee_id:
            from api.services.employee_sale_salary import sync_employee_sale_salary_settlement
            instance.status = 'cancelled'
            Sales.all_objects.filter(pk=instance.pk).update(status='cancelled')
            sync_employee_sale_salary_settlement(instance)
        if restore_stock:
            for item in instance.sales_items.all():
                self._increase_stock_for_sales_item(item, instance)
        instance.delete()

    def _update_stock_for_sales_item(self, item, sale):
        """Apply inventory impact for a sale line (packed stock, tank, or raw material)."""
        if item.sale_source == SalesItems.SOURCE_TANK:
            validate_tank_fill_quantity(
                item.storage_tank,
                item.liter_amount,
                exclude_sale_item_id=item.pk,
            )
            return
        if item.sale_source == SalesItems.SOURCE_RAW_MATERIAL:
            apply_raw_material_sale_item(item)
            return

        from api.utils.packaging import sales_item_pieces

        quantity_needed = sales_item_pieces(item)
        try:
            allocate_inventory_for_sale_item(item, quantity_needed)
        except InsufficientInventoryError as e:
            raise ValidationError(str(e))

    def _update_stock_for_sales_item_update(
        self,
        item,
        sale,
        old_piece_amount,
        old_stock=None,
        old_tank=None,
        old_source=None,
        old_raw_material_stock=None,
        old_raw_material_quantity=None,
        old_raw_material_piece_count=None,
    ):
        from api.utils.packaging import sales_item_pieces

        old_source = old_source or SalesItems.SOURCE_STOCK
        new_source = item.sale_source
        old_pieces = Decimal(str(old_piece_amount or 0))
        new_pieces = sales_item_pieces(item)

        # Leaving packed-stock path → restore FEFO allocations.
        if old_source == SalesItems.SOURCE_STOCK and new_source != SalesItems.SOURCE_STOCK:
            revert_sale_item_allocations(item)

        # Leaving raw-material path → restore that stock.
        if old_source == SalesItems.SOURCE_RAW_MATERIAL and old_raw_material_stock is not None:
            if new_source != SalesItems.SOURCE_RAW_MATERIAL or (
                item.raw_material_stock_id != old_raw_material_stock.id
            ):
                revert_raw_material_sale_item(
                    SalesItems(
                        sale_source=SalesItems.SOURCE_RAW_MATERIAL,
                        raw_material_stock=old_raw_material_stock,
                        quantity=old_raw_material_quantity or 0,
                        piece_count=old_raw_material_piece_count or 0,
                        unit_cost=getattr(item, "_prior_raw_unit_cost", item.unit_cost),
                    ),
                )

        if new_source == SalesItems.SOURCE_TANK:
            validate_tank_fill_quantity(
                item.storage_tank,
                item.liter_amount,
                exclude_sale_item_id=item.pk,
            )
            return

        if new_source == SalesItems.SOURCE_RAW_MATERIAL:
            same_rm = (
                old_source == SalesItems.SOURCE_RAW_MATERIAL
                and old_raw_material_stock is not None
                and item.raw_material_stock_id == old_raw_material_stock.id
            )
            if same_rm:
                apply_raw_material_sale_item(
                    item,
                    previous_quantity=old_raw_material_quantity,
                    previous_piece_count=old_raw_material_piece_count,
                )
            else:
                apply_raw_material_sale_item(item)
            return

        old_stock = old_stock or item.stock
        new_stock = item.stock
        if old_source != SalesItems.SOURCE_STOCK:
            try:
                allocate_inventory_for_sale_item(item, new_pieces)
            except InsufficientInventoryError as e:
                raise ValidationError(str(e))
            return

        if old_stock is None or new_stock is None or old_stock.pk != new_stock.pk:
            revert_sale_item_allocations(item)
            try:
                allocate_inventory_for_sale_item(item, new_pieces)
            except InsufficientInventoryError as e:
                raise ValidationError(str(e))
            return

        update_sale_item_allocations(item, old_pieces, new_pieces)

    def _increase_stock_for_sales_item(self, item, sale):
        """Revert packed-stock / raw-material deductions; tank liters free when line is removed."""
        if item.sale_source == SalesItems.SOURCE_TANK:
            return
        if item.sale_source == SalesItems.SOURCE_RAW_MATERIAL:
            revert_raw_material_sale_item(item)
            return
        revert_sale_item_allocations(item)



def filter_raw_material_only_sales(queryset):
    """Sales whose every line is a raw-material stock sale (no finished goods / tank)."""
    other_items = SalesItems.objects.filter(
        sales_id=OuterRef('pk'),
    ).exclude(sale_source=SalesItems.SOURCE_RAW_MATERIAL)
    return (
        queryset.annotate(
            _rm_lines=Count(
                'sales_items',
                filter=Q(sales_items__sale_source=SalesItems.SOURCE_RAW_MATERIAL),
            ),
        )
        .filter(_rm_lines__gt=0)
        .exclude(Exists(other_items))
        .distinct()
    )


class RawMaterialSalesViewSet(SalesViewSet):
    """Dedicated endpoint for selling raw materials from RM stock."""

    permission_module = 'raw_material_sales'

    def get_queryset(self):
        qs = DataRootViewSet.get_queryset(self).select_related(
            'customer', 'vendor', 'salesman', 'employee', 'salary_settlement',
        ).order_by('-sale_date')

        outstanding = self.request.query_params.get('outstanding')
        if outstanding in ('1', 'true', 'True'):
            qs = qs.filter(
                total_amount__gt=F('paid_amount'),
                vendor__isnull=True,
                employee__isnull=True,
            ).exclude(status='cancelled')

        qs = filter_raw_material_only_sales(qs)

        if self.action == 'retrieve':
            qs = qs.prefetch_related(
                'documents',
                Prefetch(
                    'sales_items',
                    queryset=SalesItems.objects.select_related(
                        'stock',
                        'stock__product',
                        'storage_tank',
                        'raw_material_stock',
                        'raw_material_stock__raw_material',
                    ),
                ),
            )
        return qs

    def create(self, request, *args, **kwargs):
        self._assert_raw_material_only_payload(request.data)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if 'sales_items' in (request.data or {}):
            self._assert_raw_material_only_payload(request.data)
        return super().update(request, *args, **kwargs)

    def _assert_raw_material_only_payload(self, data):
        items = data.get('sales_items') if hasattr(data, 'get') else None
        if not items:
            raise ValidationError({
                'sales_items': 'Add at least one raw material line.',
            })
        for index, item in enumerate(items):
            source = (item or {}).get('sale_source')
            if source != SalesItems.SOURCE_RAW_MATERIAL:
                raise ValidationError({
                    'sales_items': (
                        f'Line {index + 1} must sell from raw material stock '
                        f'(sale_source=raw_material).'
                    ),
                })
            if not (item or {}).get('raw_material_stock'):
                raise ValidationError({
                    'sales_items': f'Line {index + 1} must select a raw material stock.',
                })

class SalesItemsViewSet(DataRootViewSet):
    permission_module = 'sales'
    queryset = SalesItems.objects.all().order_by("-id")
    serializer_class = SalesItemsSerializer
    filterset_fields = ["sales", "stock"]

    def get_queryset(self):
        qs = super().get_queryset()
        return qs

    def _stock_view(self):
        return SalesViewSet()

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            response = super().create(request, *args, **kwargs)
            item = SalesItems.objects.get(id=response.data['id'])
            sale = item.sales
            if sale.returns.exists():
                raise ValidationError({'detail': 'Remove existing returns before changing sale items.'})
            view = self._stock_view()
            view._snapshot_unit_cost(item)
            if view._order_affects_stock(sale):
                view._update_stock_for_sales_item(item, sale)
            return response

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            item = self.get_object()
            item._prior_raw_unit_cost = item.unit_cost
            sale = item.sales
            if sale.returns.exists():
                raise ValidationError({'detail': 'Remove existing returns before changing sale items.'})
            from api.utils.packaging import sales_item_pieces
            old_piece_amount = sales_item_pieces(item)
            old_stock = item.stock
            old_tank = item.storage_tank
            old_rm_stock = item.raw_material_stock
            old_rm_quantity = raw_stock_quantity(item) if item.raw_material_stock_id else item.quantity
            old_rm_piece_count = raw_stock_pieces(item) if item.raw_material_stock_id else item.piece_count
            old_source = item.sale_source
            view = self._stock_view()

            response = super().update(request, *args, **kwargs)
            item = self.get_object()
            view._snapshot_unit_cost(item)
            if view._order_affects_stock(sale):
                view._update_stock_for_sales_item_update(
                    item,
                    sale,
                    old_piece_amount,
                    old_stock=old_stock,
                    old_tank=old_tank,
                    old_source=old_source,
                    old_raw_material_stock=old_rm_stock,
                    old_raw_material_quantity=old_rm_quantity,
                    old_raw_material_piece_count=old_rm_piece_count,
                )
            return response

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            item = self.get_object()
            sale = item.sales
            if sale.returns.exists():
                raise ValidationError({'detail': 'Remove existing returns before changing sale items.'})
            view = self._stock_view()
            response = super().destroy(request, *args, **kwargs)
            if view._order_affects_stock(sale):
                view._increase_stock_for_sales_item(item, sale)
            return response
