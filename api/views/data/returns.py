from decimal import Decimal

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from api.services.fefo_allocation import (
    consume_pieces_from_sale_batches,
    restore_pieces_to_sale_batches,
)
from api.utils.order_stock import return_affects_stock
from api.utils.packaging import return_item_restore_pieces
from api.views.data.base import DataRootViewSet
from api.models.data.returns import Return, ReturnItems
from api.serializers.data.returns import ReturnSerializer, ReturnItemsSerializer


class ReturnViewSet(DataRootViewSet):
    permission_module = 'returns'
    queryset = Return.objects.select_related('sales').all().order_by("-return_date")
    serializer_class = ReturnSerializer
    filterset_fields = ["sales", "currency"]
    search_fields = ["return_number", "notes"]

    def _save_stock(self, stock):
        stock._skip_stock_journal = True
        stock.save()

    def _affects_stock(self, return_order):
        return return_affects_stock(return_order)

    def perform_create(self, serializer):
        serializer.save()

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
            return_items_data = data.pop('return_items', [])

            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            return_order = serializer.instance
            affects_stock = self._affects_stock(return_order)

            for item_data in return_items_data:
                item_data['return_order'] = return_order.id
                item_serializer = ReturnItemsSerializer(data=item_data, context=self.get_serializer_context())
                item_serializer.is_valid(raise_exception=True)
                item = item_serializer.save()
                if affects_stock:
                    self._update_stock_for_return_item(item, return_order)

            return_order.refresh_from_db()
            response_data = ReturnSerializer(return_order, context=self.get_serializer_context()).data
            response_data['return_items'] = ReturnItemsSerializer(
                ReturnItems.objects.filter(return_order=return_order), many=True, context=self.get_serializer_context()
            ).data
            return Response(response_data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            return_order = self.get_object()

            data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
            items_provided = 'return_items' in data
            return_items_data = data.pop('return_items', []) if items_provided else None

            existing_items = {item.id: item for item in return_order.return_items.all()}

            serializer = self.get_serializer(return_order, data=data, partial=kwargs.get('partial', False))
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return_order = self.get_object()
            affects_stock = self._affects_stock(return_order)

            if items_provided and affects_stock:
                processed_item_ids = set()
                for item_data in return_items_data:
                    item_id = item_data.get('id')
                    if item_id and item_id in existing_items:
                        item = existing_items[item_id]
                        old_piece_amount = self._return_quantity_for_stock(item)
                        item_serializer = ReturnItemsSerializer(
                            instance=item, data=item_data, partial=True, context=self.get_serializer_context()
                        )
                        item_serializer.is_valid(raise_exception=True)
                        updated_item = item_serializer.save()
                        self._update_stock_for_return_item_update(updated_item, return_order, old_piece_amount)
                        processed_item_ids.add(item_id)
                    else:
                        item_data['return_order'] = return_order.id
                        item_serializer = ReturnItemsSerializer(data=item_data, context=self.get_serializer_context())
                        item_serializer.is_valid(raise_exception=True)
                        new_item = item_serializer.save()
                        self._update_stock_for_return_item(new_item, return_order)
                        processed_item_ids.add(new_item.id)

                for item_id, item in existing_items.items():
                    if item_id not in processed_item_ids:
                        self._decrease_stock_for_return_item(item, return_order)
                        item.delete()
            elif items_provided:
                processed_item_ids = set()
                for item_data in return_items_data:
                    item_id = item_data.get('id')
                    if item_id and item_id in existing_items:
                        item = existing_items[item_id]
                        item_serializer = ReturnItemsSerializer(
                            instance=item, data=item_data, partial=True, context=self.get_serializer_context()
                        )
                        item_serializer.is_valid(raise_exception=True)
                        item_serializer.save()
                        processed_item_ids.add(item_id)
                    else:
                        item_data['return_order'] = return_order.id
                        item_serializer = ReturnItemsSerializer(data=item_data, context=self.get_serializer_context())
                        item_serializer.is_valid(raise_exception=True)
                        new_item = item_serializer.save()
                        processed_item_ids.add(new_item.id)

                for item_id, item in existing_items.items():
                    if item_id not in processed_item_ids:
                        item.delete()

            return_order.refresh_from_db()
            response_data = ReturnSerializer(return_order, context=self.get_serializer_context()).data
            response_data['return_items'] = ReturnItemsSerializer(
                ReturnItems.objects.filter(return_order=return_order), many=True, context=self.get_serializer_context()
            ).data
            return Response(response_data)
    
    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            return super().destroy(request, *args, **kwargs)

    def perform_hard_destroy(self, instance):
        if self._affects_stock(instance):
            for item in instance.return_items.all():
                self._decrease_stock_for_return_item(item, instance)
        instance.delete()
    
    def _return_quantity_for_stock(self, item):
        """Canonical restore quantity for packed / raw / tank return lines."""
        from api.models.data.sales import SalesItems

        sale_item = item.sales_item
        if sale_item.sale_source == SalesItems.SOURCE_RAW_MATERIAL:
            quantity = item.quantity_kg if sale_item.unit == 'kg' else item.liter_amount
            return Decimal(str(quantity or 0))
        return Decimal(str(return_item_restore_pieces(item) or 0))

    def _update_stock_for_return_item(self, item, return_order):
        """Return inventory for packed-stock / raw-material sales; tank fills use tank ledger."""
        from api.models.data.sales import SalesItems

        sale_item = item.sales_item
        if sale_item.sale_source == SalesItems.SOURCE_TANK:
            return
        if sale_item.sale_source == SalesItems.SOURCE_RAW_MATERIAL:
            from api.services.raw_material_sales import adjust_raw_sale_return
            adjust_raw_sale_return(sale_item, self._return_quantity_for_stock(item))
            return
        restore_pieces_to_sale_batches(
            sale_item, self._return_quantity_for_stock(item), return_item=item,
        )

    def _update_stock_for_return_item_update(self, item, return_order, old_piece_amount):
        """Adjust returned qty without full sale-allocation wipe."""
        from api.models.data.sales import SalesItems

        sale_item = item.sales_item
        if sale_item.sale_source == SalesItems.SOURCE_TANK:
            return
        new_quantity = self._return_quantity_for_stock(item)
        old_quantity = Decimal(str(old_piece_amount or 0))
        if sale_item.sale_source == SalesItems.SOURCE_RAW_MATERIAL:
            from api.services.raw_material_sales import adjust_raw_sale_return
            adjust_raw_sale_return(sale_item, new_quantity - old_quantity)
            return

        piece_diff = new_quantity - old_quantity
        if piece_diff == 0:
            return
        if piece_diff > 0:
            restore_pieces_to_sale_batches(sale_item, piece_diff, return_item=item)
        else:
            consume_pieces_from_sale_batches(sale_item, abs(piece_diff), return_item=item)

    def _decrease_stock_for_return_item(self, item, return_order):
        """When a return is deleted, re-consume the previously restored pieces."""
        from api.models.data.sales import SalesItems

        sale_item = item.sales_item
        if sale_item.sale_source == SalesItems.SOURCE_TANK:
            return
        if sale_item.sale_source == SalesItems.SOURCE_RAW_MATERIAL:
            from api.services.raw_material_sales import adjust_raw_sale_return
            adjust_raw_sale_return(sale_item, -self._return_quantity_for_stock(item))
            return

        consume_pieces_from_sale_batches(
            sale_item, self._return_quantity_for_stock(item), return_item=item,
        )

class ReturnItemsViewSet(DataRootViewSet):
    permission_module = 'returns'
    queryset = ReturnItems.objects.all().order_by("-id")
    serializer_class = ReturnItemsSerializer
    filterset_fields = ["return_order", "sales_item"]

    def get_queryset(self):
        qs = super().get_queryset()
        return qs
    
    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            response = super().create(request, *args, **kwargs)
            item = ReturnItems.objects.get(id=response.data['id'])
            return_order = item.return_order
            view = ReturnViewSet()
            if view._affects_stock(return_order):
                view._update_stock_for_return_item(item, return_order)
            return response
    
    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            item = self.get_object()
            return_order = item.return_order
            view = ReturnViewSet()
            old_piece_amount = view._return_quantity_for_stock(item)
            response = super().update(request, *args, **kwargs)
            item = self.get_object()
            if view._affects_stock(return_order):
                view._update_stock_for_return_item_update(item, return_order, old_piece_amount)
            return response
    
    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            item = self.get_object()
            return_order = item.return_order
            view = ReturnViewSet()
            response = super().destroy(request, *args, **kwargs)
            if view._affects_stock(return_order):
                view._decrease_stock_for_return_item(item, return_order)
            return response
