from django.db import transaction
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.damaged_materials import DamagedMaterialRecord
from api.serializers.data.damaged_materials import DamagedMaterialRecordSerializer
from api.services.damaged_materials import delete_damaged_record, list_damaged_material_options
from api.views.data.base import DataRootViewSet


class DamagedMaterialRecordViewSet(DataRootViewSet):
    permission_module = 'damaged'
    queryset = DamagedMaterialRecord.objects.prefetch_related(
        'items__raw_material',
        'items__product',
        'tank_leaks__storage_tank',
    ).all()
    serializer_class = DamagedMaterialRecordSerializer
    search_fields = [
        'damaged_number',
        'notes',
        'items__raw_material__name',
        'items__product__name',
    ]
    filterset_fields = []
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    @action(detail=False, methods=['get'], url_path='available-materials')
    def available_materials(self, request):
        include = request.query_params.getlist('include') or request.query_params.getlist('include[]')
        if not include:
            raw = request.query_params.get('include', '')
            include = [part for part in raw.split(',') if part.strip()] if raw else []
        return Response({
            'results': list_damaged_material_options(include_raw_material_ids=include),
        })

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        delete_damaged_record(instance)
