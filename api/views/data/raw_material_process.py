from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.raw_material_process import RawMaterialProcess
from api.serializers.data.raw_material_process import (
    RawMaterialProcessListSerializer,
    RawMaterialProcessSerializer,
)
from api.services.raw_material_process import (
    consume_raw_materials_for_process,
    get_available_raw_material_process_options,
    release_raw_materials_for_process,
    restore_raw_materials_for_process,
)
from api.services.production_storage import replace_production_storage_transfers
from api.views.data.base import DataRootViewSet


class RawMaterialProcessViewSet(DataRootViewSet):
    """Manage production runs with FIFO costing and reversible stock usage."""
    permission_module = 'raw_material_processes'
    permission_action_map = {
        'change_status': 'edit_raw_material_processes',
    }
    queryset = RawMaterialProcess.objects.prefetch_related(
        'items__raw_material',
        'storage_transfers__storage_tank',
    ).all()
    serializer_class = RawMaterialProcessSerializer
    filterset_fields = ['status']
    search_fields = ['process_number', 'product_name', 'notes']
    http_method_names = ['get', 'post', 'put',
                         'patch', 'delete', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'list':
            return RawMaterialProcessListSerializer
        return RawMaterialProcessSerializer

    @action(detail=False, methods=['get'], url_path='available-materials')
    def available_materials(self, request):
        process_id = request.query_params.get('process_id') or None
        materials = get_available_raw_material_process_options(
            exclude_process_id=process_id)
        search = request.query_params.get('search', '').strip().casefold()
        if search:
            materials = [
                material for material in materials
                if search in material['raw_material_details']['name'].casefold()
            ]
        return Response({'count': len(materials), 'results': materials})

    @action(detail=True, methods=['patch'], url_path='status')
    @transaction.atomic
    def change_status(self, request, *args, **kwargs):
        process = self.get_object()
        next_status = request.data.get('status')
        valid_statuses = {value for value,
                          _ in RawMaterialProcess.STATUS_CHOICES}
        if next_status not in valid_statuses:
            return Response(
                {'status': 'Select a valid production status.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        transfers_data = request.data.get('storage_transfers', [])
        process.status = next_status
        process.save(update_fields=['status', 'updated_at'])
        replace_production_storage_transfers(process, transfers_data)

        process.refresh_from_db()
        response_data = RawMaterialProcessSerializer(
            process,
            context=self.get_serializer_context(),
        ).data
        return Response(response_data)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        items_data = data.pop('items', None)
        if items_data is None:
            items_data = data.pop('ingredients', [])
        storage_transfers_data = data.pop('storage_transfers', [])
        if 'output_from_inputs' not in data and 'output_quantity_kg' not in data and 'output_quantity_liters' not in data:
            data['output_from_inputs'] = True

        serializer = RawMaterialProcessSerializer(
            data=data,
            context={**self.get_serializer_context(), 'production_items': items_data},
        )
        serializer.is_valid(raise_exception=True)
        process = serializer.save()
        consume_raw_materials_for_process(process, items_data)
        replace_production_storage_transfers(process, storage_transfers_data)

        process.refresh_from_db()
        response_data = RawMaterialProcessSerializer(
            process,
            context=self.get_serializer_context(),
        ).data
        return Response(response_data, status=status.HTTP_201_CREATED)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        process = self.get_object()
        data = request.data.copy()
        items_data = data.pop('items', None)
        storage_transfers_data = data.pop('storage_transfers', None)
        if items_data is None:
            items_data = [
                {
                    'raw_material': item.raw_material_id,
                    'quantity': item.quantity,
                    'piece_count': item.piece_count,
                    **({'purchase_items': [source['purchase_item'] for source in item.purchase_sources]} if item.purchase_sources and all(source.get('purchase_item') for source in item.purchase_sources) else {}),
                }
                for item in process.items.all()
            ]
        if storage_transfers_data is None:
            next_status = data.get('status', process.status)
            if next_status == RawMaterialProcess.STATUS_MOVED_TO_STORAGE:
                storage_transfers_data = list(
                    process.storage_transfers.values(
                        'storage_tank_id', 'quantity_liters', 'quantity_kg',
                    )
                )
                storage_transfers_data = [
                    {
                        'storage_tank': transfer['storage_tank_id'],
                        'quantity_liters': transfer['quantity_liters'],
                        'quantity_kg': transfer['quantity_kg'],
                    }
                    for transfer in storage_transfers_data
                ]
            else:
                storage_transfers_data = []

        serializer = RawMaterialProcessSerializer(
            process,
            data=data,
            partial=partial,
            context={**self.get_serializer_context(), 'production_items': items_data},
        )
        serializer.is_valid(raise_exception=True)
        restore_raw_materials_for_process(process)
        process = serializer.save()
        consume_raw_materials_for_process(process, items_data)
        replace_production_storage_transfers(process, storage_transfers_data)

        process.refresh_from_db()
        response_data = RawMaterialProcessSerializer(
            process,
            context=self.get_serializer_context(),
        ).data
        return Response(response_data)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        process = self.get_object()
        release_raw_materials_for_process(process)
        return super().destroy(request, *args, **kwargs)
