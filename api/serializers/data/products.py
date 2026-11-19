from decimal import Decimal
from rest_framework import serializers

from api.models.data.products import Product
from api.serializers.data.base import DataRootSerializer


def product_image_url(product, request=None):
    image = getattr(product, 'image', None)
    if not image:
        return None
    try:
        url = image.url
    except ValueError:
        return None
    if request:
        return request.build_absolute_uri(url)
    return url


def serialize_product(product, request=None):
    if not product:
        return None
    raw_material_details = None
    if product.raw_material_id:
        material = product.raw_material
        raw_material_details = {
            'id': material.id,
            'name': material.name,
            'material_type': material.material_type,
            'unit': material.unit,
            'capacity_liters': material.capacity_liters,
            'capacity_kg': material.capacity_kg,
            'capacity_display_unit': material.capacity_display_unit,
            'bottles_per_carton': material.bottles_per_carton,
            'bottles_per_plastic': material.bottles_per_plastic,
        }
    return {
        'id': product.id,
        'name': product.name,
        'raw_material': product.raw_material_id,
        'material_type': product.stock_kind,
        'packaging_type': product.packaging_type,
        'raw_material_details': raw_material_details,
        'inventory_unit': 'piece' if product.is_piece_stock else None,
        'barcode': product.barcode,
        'description': getattr(product, 'description', None),
        'image': product_image_url(product, request),
        'bottle_capacity_liters': product.bottle_capacity_liters,
        'bottle_capacity_kg': (
            product.bottle_capacity_kg if product.bottle_capacity_kg is not None else (product.bottle_capacity_liters * product.density_kg_per_liter).quantize(Decimal('0.0001'))
            if product.bottle_capacity_kg is not None or product.bottle_capacity_liters is not None
            else None
        ),
        'density_kg_per_liter': product.density_kg_per_liter,
        'carton_capacity_liters': product.carton_capacity_liters,
        'bottles_per_carton': product.bottles_per_carton,
    }


class ProductSerializer(DataRootSerializer):
    packaging_type = serializers.ChoiceField(choices=['bottle', 'carton', 'plastic'], required=False, allow_null=True, default=None)
    bottle_capacity_kg = serializers.DecimalField(max_digits=12, decimal_places=4, required=False, allow_null=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance and attrs.get('packaging_type', self.instance.packaging_type) != self.instance.packaging_type:
            raise serializers.ValidationError({'packaging_type': 'An existing product must keep its inventory type.'})
        if attrs.get('packaging_type'):
            attrs['bottles_per_carton'] = 1
        if 'bottle_capacity_kg' in attrs:
            mass = attrs['bottle_capacity_kg']
            if mass is not None and mass <= 0:
                raise serializers.ValidationError({'bottle_capacity_kg': 'Bottle capacity must be greater than zero kg.'})
            density = Decimal(str(getattr(self.instance, 'density_kg_per_liter', 1) or 1))
            attrs['bottle_capacity_liters'] = (mass / density).quantize(Decimal('0.0001')) if mass is not None else None
        elif 'bottle_capacity_liters' in attrs:
            density = Decimal(str(attrs.get('density_kg_per_liter', getattr(self.instance, 'density_kg_per_liter', 1)) or 1))
            volume = attrs['bottle_capacity_liters']
            attrs['bottle_capacity_kg'] = (volume * density).quantize(Decimal('0.0001')) if volume is not None else None
        return attrs

    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = ('raw_material',)

    def validate_barcode(self, value):
        if not value:
            return None
        existing = Product.all_objects.filter(barcode=value)
        if self.instance is not None:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError('A product with this barcode already exists.')
        return value

    def validate_density_kg_per_liter(self, value):
        if value <= 0:
            raise serializers.ValidationError('Density must be greater than zero kg/L.')
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        data['material_type'] = instance.stock_kind
        data['image'] = product_image_url(instance, request)
        data['bottle_capacity_kg'] = (
            instance.bottle_capacity_kg if instance.bottle_capacity_kg is not None else (instance.bottle_capacity_liters * instance.density_kg_per_liter).quantize(Decimal('0.0001'))
            if instance.bottle_capacity_kg is not None or instance.bottle_capacity_liters is not None
            else None
        )
        return data
