from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from api.models.data.sales import Sales, SalesItems
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.products import serialize_product
from api.services.financial_reports import _item_cogs_base, _item_revenue_base
from api.services.inventory.engine import deliver_sale_item, get_default_warehouse
from api.services.uom.conversion import d, snapshot_factor


def _sale_profit_afn(sale) -> dict:
    """Gross profit for one sale in AFN (line revenue − AVCO COGS)."""
    revenue = Decimal('0')
    cogs = Decimal('0')
    items = sale.sales_items.all()
    for item in items:
        revenue += _item_revenue_base(item)
        cogs += _item_cogs_base(item)
    profit = revenue - cogs
    margin = (profit / revenue * Decimal('100')) if revenue > 0 else Decimal('0')
    return {
        'revenue_afn': float(revenue),
        'cogs_afn': float(cogs),
        'profit_afn': float(profit),
        'margin_pct': float(margin),
    }


class SalesItemsSerializer(DataRootSerializer):
    product_details = serializers.SerializerMethodField()
    packaging_details = serializers.SerializerMethodField()
    line_total = serializers.SerializerMethodField()
    line_cogs_afn = serializers.SerializerMethodField()
    line_profit_afn = serializers.SerializerMethodField()

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

    def get_line_cogs_afn(self, obj):
        return float(_item_cogs_base(obj))

    def get_line_profit_afn(self, obj):
        return float(_item_revenue_base(obj) - _item_cogs_base(obj))


class SalesSerializer(DataRootSerializer):
    sales_items = SalesItemsSerializer(many=True, required=False)
    items = SalesItemsSerializer(many=True, required=False, write_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True, default=None)
    vendor_name = serializers.CharField(source='vendor.name', read_only=True, default=None)
    profit_afn = serializers.SerializerMethodField()
    cogs_afn = serializers.SerializerMethodField()
    margin_pct = serializers.SerializerMethodField()

    class Meta:
        model = Sales
        fields = '__all__'
        read_only_fields = [
            'id', 'invoice_number', 'created_at', 'updated_at', 'deleted_at', 'deleted_by',
        ]

    def _profit(self, obj):
        cache = getattr(obj, '_profit_cache', None)
        if cache is None:
            cache = _sale_profit_afn(obj)
            obj._profit_cache = cache
        return cache

    def get_profit_afn(self, obj):
        return self._profit(obj)['profit_afn']

    def get_cogs_afn(self, obj):
        return self._profit(obj)['cogs_afn']

    def get_margin_pct(self, obj):
        return self._profit(obj)['margin_pct']

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
        self._auto_pay_walk_in(sale)
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
        self._auto_pay_walk_in(instance)
        return instance

    def _auto_pay_walk_in(self, sale):
        from api.services.walk_in_sale_payment import auto_pay_walk_in_sale

        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        auto_pay_walk_in_sale(sale, user=user)

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
