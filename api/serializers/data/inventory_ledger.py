from rest_framework import serializers

from api.models.data.inventory_ledger import InventoryBalance, StockMovement
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.products import serialize_product
from api.services.inventory.display import packaging_breakdown


class InventoryBalanceSerializer(DataRootSerializer):
    product_details = serializers.SerializerMethodField()
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    quantity_available = serializers.DecimalField(
        max_digits=18, decimal_places=6, read_only=True,
    )
    packaging_breakdown = serializers.SerializerMethodField()

    class Meta:
        model = InventoryBalance
        fields = '__all__'

    def get_product_details(self, obj):
        return serialize_product(obj.product, self.context.get('request'))

    def get_packaging_breakdown(self, obj):
        packs = list(obj.product.packagings.filter(is_active=True, deleted_at__isnull=True))
        return packaging_breakdown(obj.quantity_on_hand, packs)


class StockMovementSerializer(DataRootSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    packaging_name = serializers.CharField(source='packaging.name', read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = '__all__'
        read_only_fields = [f.name for f in StockMovement._meta.fields]
