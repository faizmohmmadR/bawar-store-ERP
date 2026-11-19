from decimal import Decimal, ROUND_HALF_UP

from rest_framework import serializers

from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.cost_currency import CostCurrencyMixin


class StorageTankSerializer(CostCurrencyMixin, DataRootSerializer):
    current_liters = serializers.DecimalField(
        max_digits=12, decimal_places=4, read_only=True,
    )
    available_liters = serializers.SerializerMethodField()
    effective_density_kg_per_liter = serializers.SerializerMethodField()
    current_kg = serializers.SerializerMethodField()
    capacity_kg = serializers.DecimalField(max_digits=12, decimal_places=4, required=False, allow_null=True)
    available_kg = serializers.SerializerMethodField()
    liquid_cost_per_liter_afn = serializers.SerializerMethodField()

    def get_liquid_cost_per_liter_afn(self, obj):
        # Divide Decimals in Python: SQLite may truncate integer-valued NUMERIC division.
        if hasattr(obj, 'current_liquid_value_afn'):
            liters = Decimal(str(obj.current_liters))
            value = Decimal(str(obj.current_liquid_value_afn))
            cost = value / liters if liters > 0 else Decimal('0')
        else:
            from api.services.tank_inventory import get_tank_liquid_totals
            cost = get_tank_liquid_totals(obj)[2]
        return str(cost.quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP))

    class Meta:
        model = StorageTank
        fields = (
            'id', 'name', 'product', 'capacity_liters', 'current_liters',
            'available_liters', 'density_kg_per_liter',
            'effective_density_kg_per_liter', 'capacity_kg',
            'current_kg', 'available_kg', 'liquid_cost_per_liter_afn',
            'created_at', 'updated_at',
        )
        read_only_fields = ('current_liters', 'available_liters')
        extra_kwargs = {
            'product': {'required': False, 'allow_null': True},
            'density_kg_per_liter': {'required': False},
            'capacity_liters': {'required': False},
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        capacity_kg = attrs.get('capacity_kg', getattr(self.instance, 'capacity_kg', None))
        if capacity_kg is not None:
            from api.services.tank_inventory import get_tank_mass_quantity
            if capacity_kg <= 0:
                raise serializers.ValidationError({'capacity_kg': 'Capacity must be greater than zero kg.'})
            if self.instance and capacity_kg < get_tank_mass_quantity(self.instance):
                raise serializers.ValidationError({'capacity_kg': 'Capacity cannot be below stored kilograms.'})
            if self.instance is None:
                attrs.setdefault('capacity_liters', capacity_kg)
        elif self.instance is None and not attrs.get('capacity_liters'):
            raise serializers.ValidationError({'capacity_kg': 'Enter capacity in kilograms.'})
        return attrs

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter a storage tank name.')
        return value

    def validate_capacity_liters(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                'Tank capacity must be greater than zero liters.')
        current_liters = getattr(self.instance, 'current_liters', Decimal('0'))
        if value < current_liters:
            raise serializers.ValidationError(
                'Capacity cannot be lower than the tank’s stored liters.')
        return value

    def validate_density_kg_per_liter(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                'Density must be greater than zero kg/L.')
        return value

    def get_available_liters(self, obj):
        current_liters = getattr(obj, 'current_liters', Decimal('0'))
        return max(Decimal('0'), obj.capacity_liters - current_liters)

    def get_effective_density_kg_per_liter(self, obj):
        from api.services.tank_inventory import get_tank_density

        return get_tank_density(obj)

    def _density(self, obj):
        return self.get_effective_density_kg_per_liter(obj)

    def get_current_kg(self, obj):
        from api.services.tank_inventory import get_tank_mass_quantity
        return get_tank_mass_quantity(obj)

    def get_capacity_kg(self, obj):
        return obj.capacity_kg if obj.capacity_kg is not None else obj.capacity_liters * self._density(obj)

    def get_available_kg(self, obj):
        return max(
            Decimal('0'),
            self.get_capacity_kg(obj) - self.get_current_kg(obj),
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['capacity_kg'] = str(self.get_capacity_kg(instance))
        # Sales/packing convert L↔kg with live density; keep configured separately for edits.
        data['configured_density_kg_per_liter'] = str(
            getattr(instance, 'density_kg_per_liter', 1) or 1
        )
        data['density_kg_per_liter'] = str(self.get_effective_density_kg_per_liter(instance))
        from api.services.cost_currency import usd_amount
        # Value divided by the actual remaining mass avoids rounding density first.
        mass = Decimal(str(data['current_kg']))
        if hasattr(instance, 'current_liquid_value_afn'):
            value = Decimal(str(instance.current_liquid_value_afn))
        else:
            from api.services.tank_inventory import get_tank_liquid_totals
            value = get_tank_liquid_totals(instance)[1]
        per_kg = value / mass if mass > 0 else Decimal('0')
        data['liquid_cost_per_kg_afn'] = str(per_kg.quantize(
            Decimal('0.000001'), rounding=ROUND_HALF_UP,
        ))
        data['liquid_cost_per_kg_usd'] = usd_amount(per_kg, data['usd_to_afn_rate'])
        return data


class StorageTankTransferHistorySerializer(DataRootSerializer):
    process_number = serializers.CharField(
        source='production.process_number', read_only=True,
    )
    production_name = serializers.CharField(
        source='production.product_name', read_only=True,
    )
    process_date = serializers.DateTimeField(
        source='production.process_date', read_only=True,
    )

    class Meta:
        model = ProductionStorageTransfer
        fields = (
            'id', 'process_number', 'production_name', 'process_date',
            'quantity_liters', 'created_at',
            'quantity_kg',
        )


class StorageTankDetailSerializer(StorageTankSerializer):
    production_transfers = serializers.SerializerMethodField()

    class Meta(StorageTankSerializer.Meta):
        fields = StorageTankSerializer.Meta.fields + ('production_transfers',)

    def get_production_transfers(self, obj):
        transfers = obj.production_transfers.filter(
            deleted_at__isnull=True,
            production__deleted_at__isnull=True,
        ).select_related('production').order_by('-created_at', '-id')[:100]
        return StorageTankTransferHistorySerializer(
            transfers, many=True, context=self.context,
        ).data
