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
    product_name = serializers.CharField(source='product.name', read_only=True, default=None)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)
    adjusted_by_name = serializers.SerializerMethodField()
    batch_number = serializers.CharField(
        source='inventory_batch.batch_number', read_only=True, default=None,
    )
    loss_value = serializers.SerializerMethodField()
    adjustment_type_display = serializers.CharField(
        source='get_adjustment_type_display', read_only=True,
    )

    class Meta:
        model = StockAdjustment
        fields = '__all__'

    def get_adjusted_by_name(self, obj):
        user = getattr(obj, 'adjusted_by', None)
        if not user:
            return None
        full = f'{getattr(user, "first_name", "")} {getattr(user, "last_name", "")}'.strip()
        return full or getattr(user, 'username', None) or getattr(user, 'email', None)

    def get_loss_value(self, obj):
        from decimal import Decimal
        change = Decimal(str(obj.quantity_change or 0))
        if change >= 0:
            return '0'
        cost = Decimal(str(obj.unit_cost or 0))
        return str(abs(change * cost))


class StockAdjustmentCreateSerializer(StockAdjustmentSerializer):
    pass


class RecordDamagedStockSerializer(serializers.Serializer):
    product = serializers.IntegerField()
    warehouse = serializers.IntegerField(required=False, allow_null=True)
    packaging = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, allow_null=True,
    )
    base_quantity = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, allow_null=True,
    )
    reason = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    adjustment_date = serializers.DateTimeField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs.get('base_quantity') is None and attrs.get('quantity') is None:
            raise serializers.ValidationError(
                {'quantity': 'Provide quantity or base_quantity.'}
            )
        return attrs
