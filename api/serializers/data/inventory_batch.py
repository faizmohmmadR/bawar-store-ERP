from rest_framework import serializers

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.sale_batch_allocation import SaleBatchAllocation
from api.models.data.stock_adjustment import StockAdjustment
from api.serializers.data.base import DataRootSerializer


class InventoryBatchSerializer(DataRootSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = InventoryBatch
        fields = '__all__'
        read_only_fields = ['batch_number']


class InventoryBatchListSerializer(InventoryBatchSerializer):
    pass


class SaleBatchAllocationSerializer(DataRootSerializer):
    class Meta:
        model = SaleBatchAllocation
        fields = '__all__'


class StockAdjustmentSerializer(DataRootSerializer):
    class Meta:
        model = StockAdjustment
        fields = '__all__'


class StockAdjustmentCreateSerializer(StockAdjustmentSerializer):
    pass
