from api.models.data.warehouse import Warehouse
from api.serializers.data.warehouse import WarehouseSerializer
from api.views.data.base import DataRootViewSet


class WarehouseViewSet(DataRootViewSet):
    permission_module = 'warehouses'
    queryset = Warehouse.objects.all().order_by('-is_default', 'name')
    serializer_class = WarehouseSerializer
    search_fields = ['code', 'name']
    filterset_fields = ['is_active', 'is_default']
