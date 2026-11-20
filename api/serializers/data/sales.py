from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from api.models.data.sales import Sales, SalesItems
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.products import serialize_product
from api.services.inventory.engine import deliver_sale_item, get_default_warehouse
from api.services.uom.conversion import d, snapshot_factor


def sales_item_commission_total(item) -> Decimal:
    return d(item.commission_amount) * d(item.quantity)


class SalesItemsSerializer(DataRootSerializer):
    product_details = serializers.SerializerMethodField()
    packaging_details = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = SalesItems
        fields = '__all__'
        read_only_fields = [
            'id', 'sales', 'base_quantity', 'liter_amount', 'created_at', 'updated_at',
            'deleted_at', 'deleted_by',
        ]

    def get_product_details(self, obj):
        return serialize_product(obj.product, self.context.get('request'))

    def get_packaging_details(self, obj):
        p = obj.packaging
        if not p:
            return None
        return {'id': p.id, 'name': p.name, 'qty_in_base': p.qty_in_base}

    def get_line_total(self, obj):
        return obj.line_total


class SalesSerializer(DataRootSerializer):
    sales_items = SalesItemsSerializer(many=True, required=False)
    items = SalesItemsSerializer(many=True, required=False, write_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True, default=None)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True, default=None)

    class Meta:
        model = Sales
        fields = '__all__'
        read_only_fields = [
            'id', 'invoice_number', 'created_at', 'updated_at', 'deleted_at', 'deleted_by',
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get('warehouse') and not (self.instance and self.instance.warehouse_id):
            attrs['warehouse'] = get_default_warehouse()
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('sales_items', None) or validated_data.pop('items', [])
        sale = Sales.objects.create(**validated_data)
        self._replace_items(sale, items_data)
        self._recalc(sale)
        self._maybe_deliver(sale)
        return sale

    @transaction.atomic
    def update(self, instance, validated_data):
        old_status = instance.status
        items_data = validated_data.pop('sales_items', None)
        if items_data is None:
            items_data = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.sales_items.all().delete()
            self._replace_items(instance, items_data)
        self._recalc(instance)
        if old_status in ('draft', 'cancelled') and instance.status not in ('draft', 'cancelled'):
            self._maybe_deliver(instance, force=True)
        return instance

    def _replace_items(self, sale, items_data):
        for row in items_data:
            data = dict(row)
            packaging = data.get('packaging')
            if packaging and not data.get('conversion_factor'):
                data['conversion_factor'] = snapshot_factor(packaging)
            if packaging and not data.get('product'):
                data['product'] = packaging.product
            SalesItems.objects.create(sales=sale, **data)

    def _recalc(self, sale):
        from api.services.accounting.totals import recalculate_sale_totals
        recalculate_sale_totals(sale)

    def _maybe_deliver(self, sale, force=False):
        if sale.status in ('draft', 'cancelled') and not force:
            return
        user = self.context.get('request').user if self.context.get('request') else None
        for item in sale.sales_items.select_related('product', 'packaging').all():
            deliver_sale_item(item, user=user, warehouse=sale.warehouse)
