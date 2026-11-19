from decimal import Decimal
from rest_framework import serializers

from api.models.data.packing import PackingRun, PackingRunComponent, PackingRunOutput
from api.models.data.raw_materials import RawMaterial, RawMaterialPurchaseItem
from api.models.data.storage_tank import StorageTank
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.cost_currency import CostCurrencyMixin


class PackingRunComponentSerializer(CostCurrencyMixin, DataRootSerializer):
    product_name = serializers.SerializerMethodField()
    raw_material = serializers.SerializerMethodField()
    purchase_item = serializers.SerializerMethodField()
    component_label = serializers.CharField(
        source='get_component_type_display', read_only=True,
    )

    def get_product_name(self, obj):
        if obj.raw_material_stock_id:
            return obj.raw_material_stock.raw_material.name
        return obj.stock.product.name if obj.stock_id else ''

    def get_raw_material(self, obj):
        return obj.raw_material_stock.raw_material_id if obj.raw_material_stock_id else None

    def get_purchase_item(self, obj):
        allocations = obj.inventory_allocations or []
        return allocations[0].get('purchase_item') if allocations else None

    class Meta:
        model = PackingRunComponent
        fields = (
            'id', 'component_type', 'component_label', 'stock',
            'raw_material_stock', 'raw_material', 'purchase_item', 'product_name',
            'quantity_pieces', 'unit_cost_afn', 'total_cost_afn',
            'inventory_allocations',
        )


class PackingRunOutputSerializer(CostCurrencyMixin, DataRootSerializer):
    product_name = serializers.CharField(source='stock.product.name', read_only=True)
    raw_material = serializers.IntegerField(source='stock.product.raw_material_id', read_only=True)
    product = serializers.IntegerField(source='stock.product_id', read_only=True)

    class Meta:
        model = PackingRunOutput
        fields = ('id', 'component_type', 'stock', 'inventory_batch', 'raw_material', 'product', 'product_name', 'quantity_pieces', 'unit_cost_afn', 'total_cost_afn')


class PackingRunSerializer(CostCurrencyMixin, DataRootSerializer):
    storage_tank_name = serializers.CharField(
        source='storage_tank.name', read_only=True, default=None)
    product_name = serializers.SerializerMethodField()
    components = PackingRunComponentSerializer(many=True, read_only=True)
    outputs = PackingRunOutputSerializer(many=True, read_only=True)
    full_unit_costs = serializers.SerializerMethodField()
    class Meta:
        model = PackingRun
        fields = '__all__'
        read_only_fields = ('packing_number',)

    def get_full_unit_costs(self, obj):
        from api.services.packing_costs import packing_full_cost_sections
        return packing_full_cost_sections(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        from api.services.cost_currency import usd_amount
        for component in data['components']:
            if component['component_type'] not in ('carton', 'plastic'):
                continue
            count = Decimal(component['quantity_pieces'])
            cost = instance.total_cost_afn / count if count > 0 else None
            key = 'cost_per_' + component['component_type']
            data[key + '_afn'] = str(cost) if cost is not None else None
            data[key + '_usd'] = usd_amount(cost, instance.usd_to_afn_rate)
        return data

    def get_product_name(self, obj):
        return obj.product.name if obj.product_id else ''

class PackingComponentInputSerializer(serializers.Serializer):
    component_type = serializers.ChoiceField(
        choices=PackingRun.COMPONENT_CHOICES)
    raw_material = serializers.PrimaryKeyRelatedField(
        queryset=RawMaterial.all_objects.all())
    purchase_item = serializers.PrimaryKeyRelatedField(
        required=False, allow_null=True,
        queryset=RawMaterialPurchaseItem.objects.filter(
            purchase__status='received',
            purchase__deleted_at__isnull=True,
        ),
    )
    quantity_pieces = serializers.IntegerField(min_value=1)

    def validate(self, attrs):
        expected_category = {
            PackingRun.COMPONENT_BOTTLE: {
                RawMaterial.TYPE_BOTTLE,
                RawMaterial.TYPE_BOTTLE_WITH_CAP,
            },
            PackingRun.COMPONENT_CAP: RawMaterial.TYPE_CAP,
            PackingRun.COMPONENT_CAP_LABEL: RawMaterial.TYPE_CAP_LABEL,
            PackingRun.COMPONENT_LABEL: set(RawMaterial.LABEL_TYPES),
            PackingRun.COMPONENT_PLASTIC: RawMaterial.TYPE_PLASTIC,
            PackingRun.COMPONENT_CARTON: RawMaterial.TYPE_CARTON,
            PackingRun.COMPONENT_CARTON_PLASTIC: RawMaterial.TYPE_CARTON_PLASTIC,
        }[attrs['component_type']]
        actual_category = attrs['raw_material'].material_type
        if (
            actual_category not in expected_category
            if isinstance(expected_category, set)
            else actual_category != expected_category
        ):
            raise serializers.ValidationError({
                'raw_material': 'Select a raw material with the matching packaging type.'
            })
        if attrs.get('purchase_item') and attrs['purchase_item'].raw_material_id != attrs['raw_material'].id:
            raise serializers.ValidationError({
                'purchase_item': 'The selected purchase does not belong to this raw material.'
            })
        return attrs


class PackingOutputProductInputSerializer(serializers.Serializer):
    component_type = serializers.ChoiceField(choices=['bottle', 'carton', 'plastic', 'returned_carton'])
    product = serializers.IntegerField(min_value=1, required=False)
    product_name = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        if bool(attrs.get('product')) == bool(attrs.get('product_name', '').strip()):
            raise serializers.ValidationError('Choose an existing product or enter a new name.')
        return attrs


class CreatePackingRunSerializer(serializers.Serializer):
    output_products = PackingOutputProductInputSerializer(many=True, required=False)
    from api.models.data.packing import PackingReturn
    packing_return = serializers.PrimaryKeyRelatedField(queryset=PackingReturn.objects.filter(inventory_moved=True), required=False, allow_null=True)
    returned_bottle_count = serializers.IntegerField(min_value=0, default=0)
    returned_carton = serializers.PrimaryKeyRelatedField(queryset=RawMaterial.objects.filter(material_type=RawMaterial.TYPE_CARTON), required=False, allow_null=True)
    returned_carton_quantity = serializers.IntegerField(min_value=0, default=0)

    filled_bottle_count = serializers.IntegerField(min_value=1, max_value=99999999, required=False)
    quantity_kg = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=Decimal('0.0001'), required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if bool(attrs.get('packing_return')) != bool(attrs.get('returned_bottle_count')):
            raise serializers.ValidationError({'returned_bottle_count': 'Choose the returned item and quantity together.'})
        if bool(attrs.get('returned_carton')) != bool(attrs.get('returned_carton_quantity')) or (attrs.get('returned_carton') and not attrs.get('packing_return')):
            raise serializers.ValidationError({'returned_carton': 'Choose the returned source, carton and quantity together.'})
        if 'quantity_kg' in attrs:
            from api.services.tank_inventory import get_tank_density
            density = get_tank_density(attrs['storage_tank'])
            attrs['quantity_liters'] = (attrs['quantity_kg'] / density).quantize(Decimal('0.0001'))
        if not attrs.get('quantity_liters') or attrs['quantity_liters'] <= 0:
            raise serializers.ValidationError({'quantity_kg': 'Enter a positive quantity in kg.'})
        return attrs

    storage_tank = serializers.PrimaryKeyRelatedField(
        queryset=StorageTank.objects.all())
    quantity_liters = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=Decimal('0.0001'), required=False,
    )
    bottle_volume_liters = serializers.DecimalField(
        max_digits=8, decimal_places=4, min_value=Decimal('0.0001'),
        required=False, allow_null=True,
    )
    components = PackingComponentInputSerializer(many=True, required=False, default=list)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_components(self, components):
        optional = {
            PackingRun.COMPONENT_BOTTLE,
            PackingRun.COMPONENT_CARTON,
            PackingRun.COMPONENT_PLASTIC,
            PackingRun.COMPONENT_CAP,
            PackingRun.COMPONENT_CAP_LABEL,
            PackingRun.COMPONENT_LABEL,
            PackingRun.COMPONENT_CARTON_PLASTIC,
        }
        normalized = []
        for component in components:
            component_type = component['component_type']
            if component_type in optional:
                if not any([
                    component.get('raw_material'),
                    component.get('purchase_item'),
                    component.get('quantity_pieces'),
                ]):
                    continue
            normalized.append(component)

        types = [component['component_type'] for component in normalized]
        material_ids = [
            component['raw_material'].id for component in normalized]
        bottle = next((component for component in normalized
            if component['component_type'] == PackingRun.COMPONENT_BOTTLE), None)
        if (
            bottle is not None
            and bottle['raw_material'].material_type == RawMaterial.TYPE_BOTTLE_WITH_CAP
            and PackingRun.COMPONENT_CAP in types
        ):
            raise serializers.ValidationError(
                'Do not add a separate cap when the selected bottle includes one.'
            )
        if len(types) != len(set(types)):
            raise serializers.ValidationError(
                'Each packaging component type can only appear once.'
            )
        if len(material_ids) != len(set(material_ids)):
            raise serializers.ValidationError(
                'Select a different raw material for each packaging component.'
            )
        return normalized


class PackingReturnSerializer(DataRootSerializer):
    product_name = serializers.CharField(source='stock.product.name', read_only=True)
    material_type = serializers.CharField(source='stock.product.stock_kind', read_only=True)
    is_available = serializers.SerializerMethodField()
    packed_bottle_count = serializers.SerializerMethodField()
    stock_value_afn = serializers.SerializerMethodField()
    packing_runs = serializers.SerializerMethodField()
    return_events = serializers.SerializerMethodField()

    class Meta:
        from api.models.data.packing import PackingReturn
        model = PackingReturn
        fields = '__all__'

    def get_is_available(self, obj):
        from django.utils import timezone
        return obj.inventory_moved and obj.remaining_bottle_count > 0 and (obj.expire_date is None or obj.expire_date >= timezone.localdate())

    def get_packed_bottle_count(self, obj):
        return obj.bottle_count - obj.remaining_bottle_count if obj.inventory_moved else 0

    def get_stock_value_afn(self, obj):
        return str(obj.remaining_bottle_count * obj.unit_cost_afn)

    def get_return_events(self, obj):
        return [{'id': event.pk, 'returned_at': event.returned_at, 'bottle_count': event.bottle_count,
                 'inventory_moved': event.inventory_moved, 'unit_cost_afn': str(event.unit_cost_afn),
                 'notes': event.notes, 'event_type': event.details.get('type', 'return'),
                 'quantity_change': event.details.get('quantity_change', event.bottle_count),
                 'previous_total': event.details.get('previous_total'),
                 'corrected_total': event.details.get('corrected_total')} for event in obj.return_events.all()]

    def get_packing_runs(self, obj):
        return [{'id': run.pk, 'packing_number': run.packing_number, 'bottle_count': run.returned_bottle_count}
                for run in obj.packing_runs.all() if not run.deleted_at]


class CreateReturnedPackingRunSerializer(serializers.Serializer):
    output_products = PackingOutputProductInputSerializer(many=True, required=False)
    from api.models.data.packing import PackingReturn
    packing_return = serializers.PrimaryKeyRelatedField(queryset=PackingReturn.objects.filter(inventory_moved=True))
    bottle_count = serializers.IntegerField(min_value=1)
    components = PackingComponentInputSerializer(many=True, required=False, default=list)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
