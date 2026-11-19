from decimal import Decimal
from rest_framework import serializers
from api.models.data.currency import CURRENCY_CHOICES, currency_details as _currency_details_fn
from api.models.data.returns import Return, ReturnItems
from api.serializers.data.base import DataRootSerializer
from api.mixins.base_currency import BaseCurrencySerializerMixin
from api.utils.order_numeric import quantize_return_amount, quantize_return_qty




class ReturnItemsSerializer(DataRootSerializer):
    sales_item_details = serializers.SerializerMethodField()
    product_details = serializers.SerializerMethodField()

    class Meta:
        model = ReturnItems
        fields = "__all__"
        read_only_fields = ('batch_returns',)

    def get_sales_item_details(self, obj):
        if not obj.sales_item:
            return None
        item = obj.sales_item
        if item.sale_source == 'tank' and item.storage_tank_id:
            from api.services.tank_inventory import tank_product_label
            product_name = tank_product_label(item.storage_tank)
        else:
            product_name = (
                item.stock.product.name
                if item.stock_id and item.stock.product_id
                else None
            )
        return {
            "id": item.id,
            "product": product_name,
            "sale_source": item.sale_source,
            "liter_amount": item.liter_amount,
            "sell_price": item.sell_price,
        }

    def get_product_details(self, obj):
        if not obj.sales_item:
            return None
        item = obj.sales_item
        if item.sale_source == 'tank' and item.storage_tank_id:
            from api.services.tank_inventory import tank_product_label
            return {
                "id": None,
                "name": tank_product_label(item.storage_tank),
                "barcode": None,
                "is_tank_fill": True,
            }
        if item.stock_id and item.stock.product_id:
            return {
                "id": item.stock.product.id,
                "name": item.stock.product.name,
                "barcode": item.stock.product.barcode,
            }
        return None

    def validate(self, attrs):
        attrs = super().validate(attrs)
        from decimal import Decimal
        from django.db.models import Sum
        sale_item = attrs.get('sales_item', getattr(self.instance, 'sales_item', None))
        order = attrs.get('return_order', getattr(self.instance, 'return_order', None))
        if sale_item and order and sale_item.sales_id != order.sales_id:
            raise serializers.ValidationError({'sales_item': 'Select a line from the sale being returned.'})
        if self.instance and 'sales_item' in attrs and attrs['sales_item'] != self.instance.sales_item:
            raise serializers.ValidationError({'sales_item': 'Keep the original sale line when editing a return.'})
        if sale_item and sale_item.sales.is_free:
            attrs['return_price'] = Decimal('0')
            attrs['return_amount'] = Decimal('0')
        if sale_item:
            existing = ReturnItems.all_objects.filter(sales_item=sale_item)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            field = 'quantity_kg' if sale_item.unit == 'kg' else 'liter_amount'
            quantity = Decimal(str(attrs.get(field, getattr(self.instance, field, 0)) or 0))
            limit = Decimal(str(sale_item.quantity if field == 'quantity_kg' else sale_item.liter_amount))
            total = existing.aggregate(value=Sum(field))['value'] or Decimal('0')
            if quantity < 0 or total + quantity > limit:
                raise serializers.ValidationError({field: 'Returned quantities cannot exceed the quantity sold.'})

        if 'liter_amount' in attrs and attrs['liter_amount'] is not None:
            attrs['liter_amount'] = quantize_return_qty(attrs['liter_amount'])
        if 'return_price' in attrs and attrs['return_price'] is not None:
            attrs['return_price'] = quantize_return_amount(attrs['return_price'])
        return attrs


class ReturnSerializer(BaseCurrencySerializerMixin, DataRootSerializer):
    base_currency_amount_fields = ('total_amount', 'refund_amount')
    base_currency_date_field = 'return_date'

    currency = serializers.IntegerField()
    sales_details = serializers.SerializerMethodField()
    currency_details = serializers.SerializerMethodField()

    class Meta:
        model = Return
        fields = "__all__"
        read_only_fields = ('return_number',)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance and 'sales' in attrs and attrs['sales'] != self.instance.sales and self.instance.return_items.exists():
            raise serializers.ValidationError({'sales': 'Remove return lines before changing the original sale.'})
        sale = attrs.get('sales') or (self.instance.sales if self.instance else None)
        if sale and sale.vendor_id:
            raise serializers.ValidationError({'sales': 'Cancel or edit the vendor goods document instead of creating a customer return.'})
        if sale and 'currency' in attrs and attrs['currency'] != sale.currency:
            raise serializers.ValidationError({'currency': 'Return currency must match the original sale currency.'})
        if sale and sale.employee_id and Decimal(str(attrs.get('refund_amount', 0) or 0)) > 0:
            raise serializers.ValidationError({'refund_amount': 'Employee goods returns reduce salary settlement and cannot be refunded in cash.'})
        if sale and sale.is_free:
            if Decimal(str(attrs.get('refund_amount', 0) or 0)) > 0:
                raise serializers.ValidationError({'refund_amount': 'Free sales have no cash refund.'})
            attrs.update(total_amount=Decimal('0'), refund_amount=Decimal('0'))
        for field in ('total_amount', 'refund_amount'):
            if field in attrs and attrs[field] is not None:
                attrs[field] = quantize_return_amount(attrs[field])
        return attrs

    def get_sales_details(self, obj):
        if obj.sales:
            return {
                "id": obj.sales.id,
                "invoice_number": obj.sales.invoice_number,
            }
        return None

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)
