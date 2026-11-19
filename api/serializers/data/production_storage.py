from rest_framework import serializers

from api.models.data.storage_tank import ProductionStorageTransfer
from api.serializers.data.base import DataRootSerializer


class ProductionStorageTransferSerializer(DataRootSerializer):
    storage_tank_name = serializers.CharField(
        source='storage_tank.name', read_only=True,
    )
    quantity_kg = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ProductionStorageTransfer
        fields = (
            'id', 'storage_tank', 'storage_tank_name', 'quantity_liters',
            'quantity_kg', 'created_at',
        )
