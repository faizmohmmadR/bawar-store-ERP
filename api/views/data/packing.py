from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from api.models.data.packing import PackingRun
from api.models.data.products import Product
from api.serializers.data.packing import (
    CreatePackingRunSerializer,
    PackingRunSerializer,
)
from api.services.packing import (
    create_packing_run,
    delete_packing_run,
    get_available_packing_components,
    get_available_packing_tanks,
    reverse_packing_run,
    update_packing_run,
)
from api.views.data.base import DataRootViewSet


class PackingRunViewSet(DataRootViewSet):
    permission_module = 'packing'
    queryset = PackingRun.objects.select_related(
        'storage_tank', 'product', 'finished_stock', 'packing_return',
    ).prefetch_related(
        'components__stock__product',
        'components__raw_material_stock__raw_material',
        'outputs__stock__product',
        'outputs__inventory_batch',
    ).all()
    serializer_class = PackingRunSerializer
    filterset_fields = ['storage_tank', 'product']
    search_fields = ['packing_number', 'storage_tank__name', 'product__name']
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def _exclude_run_id(self, request):
        value = request.query_params.get('exclude_run')
        if not value:
            return None
        try:
            run_id = int(value)
        except (TypeError, ValueError) as error:
            raise ValidationError(
                {'exclude_run': 'Select a valid packing run.'}) from error
        if not PackingRun.objects.filter(pk=run_id).exists():
            raise ValidationError(
                {'exclude_run': 'Select a valid packing run.'})
        return run_id

    @action(detail=False, methods=['get'], url_path='available-returns')
    def available_returns(self, request):
        from django.db.models import Q
        from django.utils import timezone
        from api.models.data.packing import PackingReturn
        from api.serializers.data.packing import PackingReturnSerializer
        run_id = self._exclude_run_id(request)
        run = PackingRun.objects.select_related('packing_return').filter(pk=run_id).first() if run_id else None
        criteria = Q(remaining_bottle_count__gt=0)
        if run and run.packing_return_id:
            criteria |= Q(pk=run.packing_return_id)
        records = PackingReturn.objects.filter(criteria, inventory_moved=True).filter(
            Q(expire_date__isnull=True) | Q(expire_date__gte=timezone.localdate())
        ).select_related('stock__product__raw_material').prefetch_related('packing_runs', 'return_events')
        records = records.order_by('-last_returned_at', '-id')
        results = PackingReturnSerializer(records, many=True).data
        from api.services.cost_currency import usd_cost_rate
        rate = usd_cost_rate()
        for row in results:
            row['usd_to_afn_rate'] = str(rate) if rate else None
            if run and row['id'] == run.packing_return_id:
                row['remaining_bottle_count'] += run.returned_bottle_count
                row['packed_bottle_count'] -= run.returned_bottle_count
                row['stock_value_afn'] = str(row['remaining_bottle_count'] * run.packing_return.unit_cost_afn)
                row['is_available'] = True
        return Response({'results': results})

    @action(detail=False, methods=['get'], url_path='available-tanks')
    def available_tanks(self, request):
        return Response({
            'results': get_available_packing_tanks(
                exclude_packing_run_id=self._exclude_run_id(request),
            )
        })

    @action(detail=False, methods=['get'], url_path='available-components')
    def available_components(self, request):
        return Response({
            'results': get_available_packing_components(
                exclude_packing_run_id=self._exclude_run_id(request),
            )
        })

    @action(detail=False, methods=['get'], url_path='available-products')
    def available_products(self, request):
        search = request.query_params.get('search', '').strip()
        products = Product.objects.all().order_by('name')
        if search:
            products = products.filter(name__icontains=search)
        page = self.paginate_queryset(products)
        records = page if page is not None else products
        results = [{'id': product.id, 'name': product.name}
                   for product in records]
        if page is not None:
            return self.get_paginated_response(results)
        return Response({'results': results, 'count': len(results)})

    def _save_run(self, request, *, instance=None):
        if not request.data.get('storage_tank') and (request.data.get('packing_return') or (instance and instance.packing_return_id)):
            from api.serializers.data.packing import CreateReturnedPackingRunSerializer
            from api.services.repacking import create_returned_packing_run
            if instance:
                instance = PackingRun.objects.select_for_update().get(pk=instance.pk)
            if instance and not instance.packing_return_id:
                raise ValidationError({'packing_return': 'Keep the original packing source type when editing.'})
            payload = CreateReturnedPackingRunSerializer(data=request.data)
            payload.is_valid(raise_exception=True)
            values = payload.validated_data
            if instance:
                from api.models.data.packing import PackingReturn
                list(PackingReturn.objects.select_for_update().filter(pk__in=[instance.packing_return_id, values['packing_return'].pk]).order_by('pk'))
                reverse_packing_run(instance, action='edited')
            run = create_returned_packing_run(
                packing_return_id=values['packing_return'].pk,
                bottle_count=values['bottle_count'],
                components=[{'component_type': row['component_type'], 'raw_material': row['raw_material'].pk,
                             'quantity_pieces': row['quantity_pieces']} for row in values['components']],
                notes=values['notes'], existing_run=instance, output_products=values.get('output_products'),
            )
            return Response(PackingRunSerializer(run, context=self.get_serializer_context()).data)
        serializer = CreatePackingRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        service = update_packing_run if instance else create_packing_run
        service_args = {
            'storage_tank_id': values['storage_tank'].id,
            'packing_return_id': values['packing_return'].pk if values.get('packing_return') else None,
            'returned_bottle_count': values.get('returned_bottle_count', 0),
            'returned_carton_id': values['returned_carton'].pk if values.get('returned_carton') else None,
            'returned_carton_quantity': values.get('returned_carton_quantity', 0),
            'quantity_liters': values['quantity_liters'],
            'quantity_kg': values.get('quantity_kg'),
            'bottle_volume_liters': values.get('bottle_volume_liters') or 0,
            'filled_bottle_count': values.get('filled_bottle_count'),
            'output_products': values.get('output_products'),
            'components': [
                {
                    'component_type': item['component_type'],
                    'raw_material': item['raw_material'].id,
                    'purchase_item': item['purchase_item'].id if item.get('purchase_item') else None,
                    'quantity_pieces': item['quantity_pieces'],
                }
                for item in values['components']
            ],
            'notes': values.get('notes', ''),
        }
        if instance:
            service_args['packing_run_id'] = instance.id
        try:
            run = service(**service_args)
        except ValueError as error:
            raise ValidationError({'packing': str(error)}) from error
        response = PackingRunSerializer(
            run,
            context=self.get_serializer_context(),
        ).data
        return Response(response)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        response = self._save_run(request)
        response.status_code = status.HTTP_201_CREATED
        return response

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        return self._save_run(request, instance=instance)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            if self._permanent_delete_requested():
                reverse_packing_run(instance, action='deleted')
                return super().destroy(request, *args, **kwargs)
            delete_packing_run(packing_run_id=instance.id, user=request.user)
        except ValidationError:
            raise
        except ValueError as error:
            raise ValidationError({'packing': str(error)}) from error
        return Response(status=status.HTTP_204_NO_CONTENT)
