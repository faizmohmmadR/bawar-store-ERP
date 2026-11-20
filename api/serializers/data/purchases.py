from django.db import transaction
from rest_framework import serializers

from api.models.data.purchases import Purchase, PurchaseItem, PurchaseLandedCost
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.products import serialize_product
from api.services.inventory.engine import get_default_warehouse, receive_purchase_item
from api.services.uom.conversion import snapshot_factor


class PurchaseItemSerializer(DataRootSerializer):
    product_details = serializers.SerializerMethodField()
    packaging_details = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseItem
        fields = '__all__'
        read_only_fields = [
            'id', 'purchase', 'base_quantity', 'total_price', 'price_per_unit_base',
            'total_price_base', 'created_at', 'updated_at', 'deleted_at', 'deleted_by',
        ]

    def get_product_details(self, obj):
        return serialize_product(obj.product, self.context.get('request'))

    def get_packaging_details(self, obj):
        p = obj.packaging
        if not p:
            return None
        return {
            'id': p.id,
            'name': p.name,
            'qty_in_base': p.qty_in_base,
            'is_variable_weight': p.is_variable_weight,
        }


class PurchaseLandedCostSerializer(DataRootSerializer):
    class Meta:
        model = PurchaseLandedCost
        fields = '__all__'


class PurchaseSerializer(DataRootSerializer):
    items = PurchaseItemSerializer(many=True, required=False)
    landed_costs = PurchaseLandedCostSerializer(many=True, required=False)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    vendor_details = serializers.SerializerMethodField()
    currency_details = serializers.SerializerMethodField()
    remaining_amount = serializers.SerializerMethodField()
    final_total = serializers.SerializerMethodField()

    class Meta:
        model = Purchase
        fields = '__all__'
        read_only_fields = [
            'id', 'invoice_number', 'total_amount', 'total_amount_base',
            'created_at', 'updated_at', 'deleted_at', 'deleted_by',
        ]

    def get_vendor_details(self, obj):
        vendor = obj.vendor
        if not vendor:
            return None
        return {
            'id': vendor.id,
            'name': vendor.name,
            'phone': getattr(vendor, 'phone', None),
            'email': getattr(vendor, 'email', None),
            'address': getattr(vendor, 'address', None),
        }

    def get_currency_details(self, obj):
        from api.models.data.currency import currency_details
        return currency_details(obj.currency)

    def get_remaining_amount(self, obj):
        total = obj.final_total if hasattr(obj, 'final_total') else obj.total_amount
        paid = obj.paid_amount or 0
        remaining = (total or 0) - (paid or 0)
        return max(remaining, 0)

    def get_final_total(self, obj):
        return obj.final_total

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not attrs.get('warehouse') and not (self.instance and self.instance.warehouse_id):
            attrs['warehouse'] = get_default_warehouse()
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        landed = validated_data.pop('landed_costs', [])
        purchase = Purchase.objects.create(**validated_data)
        self._replace_items(purchase, items_data)
        for row in landed:
            PurchaseLandedCost.objects.create(purchase=purchase, **row)
        self._maybe_receive(purchase)
        return purchase

    @transaction.atomic
    def update(self, instance, validated_data):
        old_status = instance.status
        items_data = validated_data.pop('items', None)
        landed = validated_data.pop('landed_costs', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items_data is not None:
            instance.items.all().delete()
            self._replace_items(instance, items_data)
        if landed is not None:
            instance.landed_costs.all().delete()
            for row in landed:
                PurchaseLandedCost.objects.create(purchase=instance, **row)
        if old_status != 'received' and instance.status == 'received':
            self._maybe_receive(instance, force=True)
        return instance

    def _replace_items(self, purchase, items_data):
        for row in items_data:
            data = dict(row)
            packaging = data.get('packaging')
            if packaging and not data.get('conversion_factor'):
                data['conversion_factor'] = snapshot_factor(packaging)
            PurchaseItem.objects.create(purchase=purchase, **data)

    def _maybe_receive(self, purchase, force=False):
        if purchase.status != 'received' and not force:
            return
        user = self.context.get('request').user if self.context.get('request') else None
        for item in purchase.items.all():
            receive_purchase_item(item, user=user)
