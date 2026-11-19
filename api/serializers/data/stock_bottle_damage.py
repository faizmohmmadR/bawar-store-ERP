from rest_framework import serializers

from api.models.data.stock_bottle_damage import StockBottleDamage
from api.serializers.data.base import DataRootSerializer


class StockBottleDamageSerializer(DataRootSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    storage_tank_name = serializers.CharField(source='storage_tank.name', read_only=True, default=None)
    damaged_number = serializers.CharField(
        source='damaged_record.damaged_number', read_only=True, default=None,
    )
    performed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = StockBottleDamage
        fields = (
            'id',
            'stock',
            'product',
            'product_name',
            'storage_tank',
            'storage_tank_name',
            'damaged_record',
            'damaged_number',
            'bottle_count',
            'capacity_kg',
            'capacity_liters',
            'density_kg_per_liter',
            'total_liquid_kg',
            'total_liquid_liters',
            'remaining_liquid_kg',
            'remaining_liquid_liters',
            'damaged_liquid_kg',
            'damaged_liquid_liters',
            'liquid_unit_cost_afn',
            'returned_liquid_cost_afn',
            'damaged_liquid_cost_afn',
            'notes',
            'recorded_at',
            'performed_by',
            'performed_by_name',
            'created_at',
            'updated_at',
        )
        read_only_fields = fields

    def get_performed_by_name(self, obj):
        user = obj.performed_by
        if not user:
            return None
        return getattr(user, 'get_full_name', lambda: '')() or user.get_username()
