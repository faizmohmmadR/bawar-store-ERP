from rest_framework import mixins, status
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from api.models.data.equipment import EquipmentDepreciation
from api.serializers.data.equipment_depreciation import EquipmentDepreciationSerializer
from api.views.data.base import DataRootViewSet


class EquipmentDepreciationViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    GenericViewSet,
):
    """
    Add-only depreciation entries per equipment per year.
    - GET  /equipment-depreciation/          — list all
    - GET  /equipment-depreciation/?equipment=<id>  — filter by equipment
    - GET  /equipment-depreciation/<id>/     — detail
    - POST /equipment-depreciation/          — add new entry (no edit, no delete)
    """
    permission_module = 'equipment'
    serializer_class = EquipmentDepreciationSerializer
    filterset_fields = ['equipment', 'year']
    search_fields = ['equipment__name', 'notes']
    ordering_fields = ['year', 'amount', 'created_at']

    def get_queryset(self):
        return (
            EquipmentDepreciation.objects
            .select_related('equipment')
            .order_by('equipment__name', 'year')
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(
            self.get_serializer(instance).data,
            status=status.HTTP_201_CREATED,
        )
