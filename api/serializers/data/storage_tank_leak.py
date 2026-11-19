from decimal import Decimal

from rest_framework import serializers

from api.models.data.storage_tank_leak import StorageTankLeak
from api.serializers.data.base import DataRootSerializer
from api.services.storage_tank_leak import record_tank_leak, update_tank_leak


class StorageTankLeakSerializer(DataRootSerializer):
    storage_tank_name = serializers.CharField(source='storage_tank.name', read_only=True)
    damaged_number = serializers.CharField(
        source='damaged_record.damaged_number', read_only=True, default=None,
    )
    quantity_kg = serializers.DecimalField(
        max_digits=14, decimal_places=4, min_value=Decimal('0.0001'),
    )

    class Meta:
        model = StorageTankLeak
        fields = (
            'id',
            'storage_tank',
            'storage_tank_name',
            'damaged_record',
            'damaged_number',
            'quantity_kg',
            'quantity_liters',
            'density_kg_per_liter',
            'unit_cost_afn',
            'total_cost_afn',
            'notes',
            'recorded_at',
            'performed_by',
            'created_at',
            'updated_at',
        )
        read_only_fields = (
            'damaged_record',
            'damaged_number',
            'quantity_liters',
            'density_kg_per_liter',
            'unit_cost_afn',
            'total_cost_afn',
            'performed_by',
            'created_at',
            'updated_at',
        )

    def create(self, validated_data):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        return record_tank_leak(
            storage_tank_id=validated_data['storage_tank'].pk,
            quantity_kg=validated_data['quantity_kg'],
            notes=validated_data.get('notes') or '',
            recorded_at=validated_data.get('recorded_at'),
            user=user,
        )

    def update(self, instance, validated_data):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        return update_tank_leak(
            leak_id=instance.pk,
            quantity_kg=validated_data.get('quantity_kg', instance.quantity_kg),
            notes=validated_data.get('notes', instance.notes),
            recorded_at=validated_data.get('recorded_at', instance.recorded_at),
            user=user,
        )
