from api.models.data.warehouse import Warehouse
from api.serializers.data.base import DataRootSerializer


class WarehouseSerializer(DataRootSerializer):
    class Meta:
        model = Warehouse
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'deleted_at', 'deleted_by']
