from decimal import Decimal

from rest_framework import serializers

from api.models.data.currency import (
    BASE_CURRENCY_ID,
    currency_details as currency_details_for,
)
from api.models.data.raw_material_process import (
    RawMaterialProcess,
    RawMaterialProcessItem,
)
from api.serializers.data.production_storage import ProductionStorageTransferSerializer
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.cost_currency import CostCurrencyMixin


class RawMaterialProcessItemSerializer(CostCurrencyMixin, DataRootSerializer):
    raw_material_details = serializers.SerializerMethodField()
    purchase_sources = serializers.JSONField(read_only=True)

    class Meta:
        model = RawMaterialProcessItem
        fields = (
            'id', 'raw_material', 'raw_material_details', 'quantity', 'piece_count',
            'material_cost_afn', 'purchase_sources',
        )

    def get_raw_material_details(self, obj):
        return {
            'id': obj.raw_material_id,
            'name': obj.raw_material.name,
            'unit': obj.raw_material.unit,
            'material_type': obj.raw_material.material_type,
        }


class RawMaterialProcessSerializer(CostCurrencyMixin, DataRootSerializer):
    items = RawMaterialProcessItemSerializer(many=True, read_only=True)
    storage_transfers = ProductionStorageTransferSerializer(
        many=True, read_only=True)
    expense_currency_details = serializers.SerializerMethodField()

    class Meta:
        model = RawMaterialProcess
        fields = '__all__'
        read_only_fields = (
            'materials_quantity_kg', 'chemistry_quantity_kg', 'total_input_quantity_kg',
            'process_number', 'material_cost_afn', 'extra_expense_afn',
            'total_cost_afn', 'cost_per_liter_afn', 'cost_per_kg_afn',
            'created_at', 'updated_at',
        )
        extra_kwargs = {
            'product': {'required': False, 'allow_null': True},
            'density_kg_per_liter': {'required': False},
            'output_quantity_liters': {'required': False},
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # Product FK is optional/legacy — production uses free-text product_name.
        if 'product' not in attrs and self.instance is None:
            attrs['product'] = None
        elif attrs.get('product') is None:
            attrs['product'] = None

        product_name = attrs.get(
            'product_name',
            getattr(self.instance, 'product_name', None),
        )
        if product_name is not None:
            product_name = str(product_name).strip()
            attrs['product_name'] = product_name
        if not product_name:
            raise serializers.ValidationError({
                'product_name': 'Enter a production name.',
            })

        output_from_inputs = attrs.get('output_from_inputs', getattr(self.instance, 'output_from_inputs', False))
        if output_from_inputs:
            from api.services.raw_material_process import production_input_weights
            items = self.context.get('production_items')
            if items is None and self.instance:
                items = list(self.instance.items.values('raw_material', 'quantity'))
            weights = production_input_weights(items or [], attrs.get('water_quantity_kg', attrs.get('water_quantity_liters', getattr(self.instance, 'water_quantity_kg', 0))))
            total = weights['total_input_quantity_kg']
            if total <= 0:
                raise serializers.ValidationError({'output_quantity_kg': 'Total ingredient and water weight must be greater than zero.'})
            density = attrs.get('density_kg_per_liter', getattr(self.instance, 'density_kg_per_liter', Decimal('1')))
            if density <= 0:
                raise serializers.ValidationError({'density_kg_per_liter': 'Density must be greater than zero.'})
            attrs.update(weights)
            attrs['output_quantity_kg'] = total
            attrs['output_quantity_liters'] = (total / density).quantize(Decimal('0.0001'))
            if attrs['output_quantity_liters'] <= 0:
                raise serializers.ValidationError({'output_quantity_kg': 'Total weight is too small for the production density.'})

        # Kilograms are the entry unit. Preserve legacy volume history using its
        # density snapshot when a kg-only request updates an existing run.
        if 'output_quantity_kg' in attrs and 'output_quantity_liters' not in attrs:
            density = Decimal(str(getattr(self.instance, 'density_kg_per_liter', 1) or 1))
            attrs['output_quantity_liters'] = (attrs['output_quantity_kg'] / density).quantize(Decimal('0.0001'))
        if self.instance is None and not attrs.get('output_quantity_kg') and not attrs.get('output_quantity_liters'):
            raise serializers.ValidationError({'output_quantity_kg': 'Enter produced kilograms.'})
        if 'water_quantity_kg' in attrs:
            if attrs['water_quantity_kg'] < 0:
                raise serializers.ValidationError({'water_quantity_kg': 'Water cannot be negative.'})
            attrs['water_quantity_liters'] = attrs['water_quantity_kg']
        elif 'water_quantity_liters' in attrs:
            attrs['water_quantity_kg'] = attrs['water_quantity_liters']
        liters = attrs.get(
            'output_quantity_liters',
            getattr(self.instance, 'output_quantity_liters', None),
        )
        kilograms = attrs.get(
            'output_quantity_kg',
            getattr(self.instance, 'output_quantity_kg', None),
        )
        density = attrs.get('density_kg_per_liter')
        if density is None:
            density = getattr(self.instance, 'density_kg_per_liter', None)

        if output_from_inputs:
            attrs['density_kg_per_liter'] = density or Decimal('1')
        elif liters is not None and kilograms is not None and Decimal(str(liters)) > 0:
            # Prefer derived density from editable L + kg when both provided.
            density = Decimal(str(kilograms)) / Decimal(str(liters))
            attrs['density_kg_per_liter'] = density
        elif density is None:
            density = Decimal('1')
            attrs['density_kg_per_liter'] = density
        else:
            attrs['density_kg_per_liter'] = density

        if density is not None and Decimal(str(density)) <= 0:
            raise serializers.ValidationError({
                'density_kg_per_liter': 'Density must be greater than zero kg/L.',
            })
        if kilograms is None and liters is not None and density is not None:
            attrs['output_quantity_kg'] = Decimal(str(liters)) * Decimal(str(density))
        return attrs

    def validate_output_quantity_liters(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                'Produced liters must be greater than zero.')
        return value

    def validate_extra_expense(self, value):
        if value < 0:
            raise serializers.ValidationError(
                'Extra expenses cannot be negative.')
        return value

    def validate_output_quantity_kg(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                'Produced kilograms must be greater than zero.')
        return value

    def validate_water_quantity_liters(self, value):
        if value < 0:
            raise serializers.ValidationError(
                'Water quantity cannot be negative.')
        return value

    def validate_expense_currency(self, value):
        if value != BASE_CURRENCY_ID:
            raise serializers.ValidationError(
                'Production expenses must be entered in AFN.')
        return value

    def get_expense_currency_details(self, obj):
        return currency_details_for(obj.expense_currency)


class RawMaterialProcessListSerializer(RawMaterialProcessSerializer):
    class Meta(RawMaterialProcessSerializer.Meta):
        fields = (
            'id', 'process_number', 'product_name', 'process_date',
            'status', 'output_quantity_liters', 'output_quantity_kg',
            'output_from_inputs', 'materials_quantity_kg', 'chemistry_quantity_kg',
            'water_quantity_kg', 'total_input_quantity_kg',
            'cost_per_kg_afn', 'expense_currency',
            'expense_currency_details', 'material_cost_afn',
            'extra_expense_afn', 'total_cost_afn', 'cost_per_liter_afn',
        )
