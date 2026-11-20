from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from api.models.data.returns import Return, ReturnItems
from api.serializers.data.base import DataRootSerializer
from api.services.inventory.engine import restore_return_item


class ReturnItemsSerializer(DataRootSerializer):
    product_details = serializers.SerializerMethodField()

    class Meta:
        model = ReturnItems
        fields = '__all__'
        read_only_fields = ['base_quantity', 'liter_amount', 'return_amount', 'batch_returns']

    def get_product_details(self, obj):
        product = getattr(obj.sales_item, 'product', None)
        if not product:
            return None
        return {'id': product.id, 'name': product.name, 'barcode': product.barcode}


class ReturnSerializer(DataRootSerializer):
    return_items = ReturnItemsSerializer(many=True, required=False)
    items = ReturnItemsSerializer(many=True, required=False, write_only=True)

    class Meta:
        model = Return
        fields = '__all__'
        read_only_fields = ['return_number', 'total_amount', 'total_amount_base']

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop('return_items', None) or validated_data.pop('items', [])
        ret = Return.objects.create(**validated_data)
        for row in items:
            ReturnItems.objects.create(return_order=ret, **dict(row))
        self._recalc(ret)
        self._restore_stock(ret)
        return ret

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop('return_items', None)
        if items is None:
            items = validated_data.pop('items', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if items is not None:
            instance.return_items.all().delete()
            for row in items:
                ReturnItems.objects.create(return_order=instance, **dict(row))
        self._recalc(instance)
        return instance

    def _recalc(self, ret):
        total = sum((Decimal(str(i.return_amount)) for i in ret.return_items.all()), Decimal('0'))
        Return.objects.filter(pk=ret.pk).update(total_amount=total, total_amount_base=total * Decimal(str(ret.exchange_rate or 1)))

    def _restore_stock(self, ret):
        user = self.context.get('request').user if self.context.get('request') else None
        for item in ret.return_items.select_related('sales_item__product', 'sales_item__packaging').all():
            restore_return_item(item, user=user, sellable=ret.is_sellable)
