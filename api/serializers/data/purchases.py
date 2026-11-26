from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.product_packaging import ProductPrice
from api.models.data.purchases import Purchase, PurchaseItem, PurchaseLandedCost
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.products import serialize_product
from api.services.currency_conversion import get_rate_to_base
from api.services.inventory.engine import get_default_warehouse, receive_purchase_item
from api.services.pricing import upsert_packaging_price
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
        attrs = self._ensure_exchange_rate(attrs)
        return attrs

    def _ensure_exchange_rate(self, attrs):
        """
        Resolve FX → AFN for foreign-currency purchases.

        Model default is 1 (AFN identity). That must never be kept for USD/KDR —
        look up the rate for the purchase date, or reject the save.
        """
        currency = attrs.get('currency')
        if currency is None and self.instance:
            currency = self.instance.currency
        if currency is None:
            return attrs

        currency = int(currency)
        rate = attrs.get('exchange_rate')
        if rate is None and self.instance:
            rate = self.instance.exchange_rate
        rate = Decimal(str(rate or 0))

        if currency == BASE_CURRENCY_ID:
            attrs['exchange_rate'] = Decimal('1')
            return attrs

        at = attrs.get('purchase_date')
        if at is None and self.instance:
            at = self.instance.purchase_date

        # Treat missing / default 1 as "not set" — always resolve from exchange rates.
        if rate <= 0 or rate == Decimal('1'):
            try:
                rate = get_rate_to_base(currency, at)
            except DjangoValidationError as exc:
                detail = getattr(exc, 'message_dict', None) or getattr(exc, 'messages', str(exc))
                raise serializers.ValidationError(detail)

        if rate <= 1:
            raise serializers.ValidationError({
                'exchange_rate': (
                    'A real USD/KDR → AFN exchange rate is required before receiving stock. '
                    'Add one in Settings → Exchange Rates.'
                ),
            })
        attrs['exchange_rate'] = rate
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
            self._sync_profit_fields(data)
            self._validate_lot_expiry(data)
            item = PurchaseItem.objects.create(purchase=purchase, **data)
            self._apply_afn_prices(item, purchase)

    def _validate_lot_expiry(self, data):
        """Require expiry when the product tracks expiry (FEFO / supermarket standard)."""
        product = data.get('product')
        if product is None:
            return
        track_expiry = bool(getattr(product, 'track_expiry', False))
        if track_expiry and not data.get('expiry_date'):
            name = getattr(product, 'name', None) or 'product'
            raise serializers.ValidationError({
                'items': {
                    'expiry_date': (
                        f'Expiry date is required for {name} '
                        '(product tracks expiry).'
                    ),
                },
            })

    def _sync_profit_fields(self, data):
        """Keep profit % and sale price consistent from cost when one side is missing."""
        cost = Decimal(str(data.get('price_per_unit') or 0))
        pct = Decimal(str(data.get('profit_percent') or 0))
        sale = Decimal(str(data.get('sale_price') or 0))
        if cost > 0 and pct > 0 and sale <= 0:
            sale = (cost * (Decimal('1') + pct / Decimal('100'))).quantize(Decimal('0.000001'))
            data['sale_price'] = sale
        elif cost > 0 and sale > 0 and pct <= 0:
            pct = ((sale - cost) / cost * Decimal('100')).quantize(Decimal('0.0001'))
            data['profit_percent'] = pct
        else:
            data['profit_percent'] = pct
            data['sale_price'] = sale

    def _apply_afn_prices(self, item, purchase):
        """
        Convert invoice buy/sale into AFN and store list prices in AFN only.
        Stock valuation and sales defaults always read these AFN amounts.
        """
        if purchase.is_free:
            return
        rate = Decimal(str(purchase.exchange_rate or 1)) or Decimal('1')
        on_date = purchase.purchase_date.date() if purchase.purchase_date else None

        buy_native = Decimal(str(item.price_per_unit or 0))
        buy_afn = Decimal(str(item.price_per_unit_base or 0))
        if buy_afn <= 0:
            buy_afn = (buy_native * rate).quantize(Decimal('0.000001'))
        if buy_afn > 0:
            upsert_packaging_price(
                item.product,
                item.packaging,
                buy_afn,
                price_type=ProductPrice.PRICE_PURCHASE,
                currency=BASE_CURRENCY_ID,
                on_date=on_date,
            )

        sale_native = Decimal(str(item.sale_price or 0))
        if sale_native <= 0:
            return
        sale_afn = (sale_native * rate).quantize(Decimal('0.000001'))
        upsert_packaging_price(
            item.product,
            item.packaging,
            sale_afn,
            price_type=ProductPrice.PRICE_RETAIL,
            currency=BASE_CURRENCY_ID,
            on_date=on_date,
        )

        factor = Decimal(str(item.conversion_factor or getattr(item.packaging, 'qty_in_base', 1) or 1))
        if factor > 1:
            base_pack = item.product.packagings.filter(is_base=True, deleted_at__isnull=True).first()
            if base_pack and base_pack.id != item.packaging_id:
                upsert_packaging_price(
                    item.product,
                    base_pack,
                    (sale_afn / factor).quantize(Decimal('0.000001')),
                    price_type=ProductPrice.PRICE_RETAIL,
                    currency=BASE_CURRENCY_ID,
                    on_date=on_date,
                )

    def _maybe_receive(self, purchase, force=False):
        if purchase.status != 'received' and not force:
            return
        user = self.context.get('request').user if self.context.get('request') else None
        for item in purchase.items.all():
            receive_purchase_item(item, user=user)
