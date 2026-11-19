from decimal import Decimal

from rest_framework import serializers

from api.models.data.damaged_materials import DamagedMaterialItem, DamagedMaterialRecord
from api.models.data.raw_materials import RawMaterial
from api.serializers.data.base import DataRootSerializer
from api.services.damaged_materials import save_damaged_record


class DamagedMaterialItemSerializer(DataRootSerializer):
    raw_material_name = serializers.SerializerMethodField()
    material_type = serializers.SerializerMethodField()
    product_name = serializers.CharField(source='product.name', read_only=True, default=None)

    class Meta:
        model = DamagedMaterialItem
        fields = (
            'id',
            'component_type',
            'raw_material',
            'raw_material_name',
            'material_type',
            'product',
            'product_name',
            'quantity_pieces',
            'unit',
            'unit_price_afn',
            'total_cost_afn',
        )
        read_only_fields = ('unit', 'total_cost_afn', 'product', 'product_name')

    def get_raw_material_name(self, obj):
        if obj.raw_material_id:
            return obj.raw_material.name
        if obj.product_id:
            return obj.product.name
        return None

    def get_material_type(self, obj):
        if obj.raw_material_id:
            return obj.raw_material.material_type
        if obj.component_type == DamagedMaterialRecord.COMPONENT_LIQUID:
            return 'liquid'
        return None


class DamagedMaterialItemInputSerializer(serializers.Serializer):
    component_type = serializers.ChoiceField(
        choices=[
            choice for choice in DamagedMaterialRecord.COMPONENT_CHOICES
            if choice[0] != DamagedMaterialRecord.COMPONENT_LIQUID
        ],
    )
    raw_material = serializers.PrimaryKeyRelatedField(queryset=RawMaterial.objects.all())
    quantity_pieces = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=Decimal('0'),
    )
    unit_price_afn = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, allow_null=True,
    )


class DamagedMaterialRecordSerializer(DataRootSerializer):
    items = DamagedMaterialItemSerializer(many=True, read_only=True)
    write_items = DamagedMaterialItemInputSerializer(many=True, write_only=True, source='items')
    tank_leak_id = serializers.SerializerMethodField()
    storage_tank_id = serializers.SerializerMethodField()
    storage_tank_name = serializers.SerializerMethodField()
    tank_leak_quantity_kg = serializers.SerializerMethodField()
    tank_available_kg = serializers.SerializerMethodField()

    class Meta:
        model = DamagedMaterialRecord
        fields = (
            'id',
            'damaged_number',
            'record_date',
            'notes',
            'total_cost_afn',
            'source',
            'items',
            'write_items',
            'tank_leak_id',
            'storage_tank_id',
            'storage_tank_name',
            'tank_leak_quantity_kg',
            'tank_available_kg',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'damaged_number',
            'total_cost_afn',
            'source',
            'tank_leak_id',
            'storage_tank_id',
            'storage_tank_name',
            'tank_leak_quantity_kg',
            'tank_available_kg',
        )

    def _active_tank_leak(self, obj):
        leaks = getattr(obj, '_prefetched_objects_cache', {}).get('tank_leaks')
        if leaks is not None:
            for leak in leaks:
                if getattr(leak, 'deleted_at', None) is None:
                    return leak
            return None
        return (
            obj.tank_leaks.filter(deleted_at__isnull=True)
            .select_related('storage_tank')
            .order_by('-id')
            .first()
        )

    def get_tank_leak_id(self, obj):
        leak = self._active_tank_leak(obj)
        return leak.pk if leak else None

    def get_storage_tank_id(self, obj):
        leak = self._active_tank_leak(obj)
        return leak.storage_tank_id if leak else None

    def get_storage_tank_name(self, obj):
        leak = self._active_tank_leak(obj)
        if not leak:
            return None
        tank = getattr(leak, 'storage_tank', None)
        return tank.name if tank is not None else None

    def get_tank_leak_quantity_kg(self, obj):
        leak = self._active_tank_leak(obj)
        return leak.quantity_kg if leak else None

    def get_tank_available_kg(self, obj):
        leak = self._active_tank_leak(obj)
        if not leak:
            return None
        from api.services.tank_inventory import get_tank_mass_quantity
        return get_tank_mass_quantity(leak.storage_tank)

    def to_internal_value(self, data):
        mutable = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'items' in mutable and 'write_items' not in mutable:
            mutable['write_items'] = mutable.pop('items')
        return super().to_internal_value(mutable)

    def create(self, validated_data):
        items = validated_data.pop('items', [])
        return save_damaged_record(
            items=items,
            record_date=validated_data.get('record_date'),
            notes=validated_data.get('notes') or '',
        )

    def update(self, instance, validated_data):
        items = validated_data.pop('items', None)
        if items is None:
            raise serializers.ValidationError({'items': 'Provide packaging rows to update.'})
        return save_damaged_record(
            items=items,
            record=instance,
            record_date=validated_data.get('record_date', instance.record_date),
            notes=validated_data.get('notes', instance.notes),
        )
