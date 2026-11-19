from rest_framework import serializers
from django.utils import timezone

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.sale_batch_allocation import SaleBatchAllocation
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.currency import CURRENCY_CHOICES
from api.serializers.data.base import DataRootSerializer


class InventoryBatchSerializer(DataRootSerializer):
    """Serializer for InventoryBatch model."""
    currency = serializers.IntegerField()
    product_details = serializers.SerializerMethodField()
    supplier_details = serializers.SerializerMethodField()
    stock_id = serializers.SerializerMethodField()
    unit_cost_per_carton = serializers.SerializerMethodField()
    cartons_remaining = serializers.ReadOnlyField()
    loose_pieces = serializers.ReadOnlyField()
    days_until_expiry = serializers.ReadOnlyField()
    is_expired = serializers.ReadOnlyField()
    is_near_expiry = serializers.ReadOnlyField()

    class Meta:
        model = InventoryBatch
        fields = "__all__"
        read_only_fields = ['batch_number']

    def get_product_details(self, obj):
        if obj.product:
            return {
                "id": obj.product.id,
                "name": obj.product.name,
                "barcode": obj.product.barcode,
                "bottle_capacity_liters": obj.product.bottle_capacity_liters,
                "carton_capacity_liters": obj.product.carton_capacity_liters,
                "bottles_per_carton": obj.product.bottles_per_carton,
            }
        return None

    def get_supplier_details(self, obj):
        if obj.supplier:
            return {
                "id": obj.supplier.id,
                "name": obj.supplier.name,
            }
        return None

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is not None and any(key in attrs and attrs[key] != getattr(self.instance,key) for key in ['product','condition']):
            raise serializers.ValidationError('Use a stock movement to change product or condition.')
        if self.instance is not None and 'unit_cost' in attrs and attrs['unit_cost'] != self.instance.unit_cost:
            raise serializers.ValidationError({'unit_cost': 'Use the stock adjustment workflow to change the shared average cost.'})
        return attrs

    def create(self, validated_data):
        # Direct lot receipts must preserve a pre-existing stock-only opening balance.
        from django.db import transaction
        from api.models.data.stock import Stock
        from api.services.pooled_stock import ensure_stock_batches
        with transaction.atomic():
            stock = Stock.all_objects.select_for_update().filter(
                product=validated_data['product'], condition=validated_data.get('condition', 'good'),
            ).first()
            if stock:
                ensure_stock_batches(stock)
            return super().create(validated_data)

    def get_stock_id(self, obj):
        """Legacy Stock row id for this product and condition."""
        cache = self.context.setdefault('_stock_id_cache', {})
        key = (obj.product_id, obj.condition)
        if key not in cache:
            from api.models.data.stock import Stock

            cache[key] = (
                Stock.objects.filter(
                    product_id=obj.product_id,
                    condition=obj.condition,
                )
                .values_list('id', flat=True)
                .first()
            )
        return cache[key]

    def get_unit_cost_per_carton(self, obj):
        from api.utils.packaging import bottles_per_carton, price_per_carton_from_piece
        return float(price_per_carton_from_piece(
            obj.unit_cost, bottles_per_carton(obj.product),
        ))


class InventoryBatchListSerializer(InventoryBatchSerializer):
    """Lightweight list serializer for batches."""
    class Meta(InventoryBatchSerializer.Meta):
        fields = [
            'id', 'batch_number', 'product', 'product_details',
            'supplier', 'supplier_details',
            'status', 'condition', 'cartons_received', 'pieces_received',
            'remaining_pieces', 'cartons_remaining', 'loose_pieces',
            'unit_cost', 'receipt_unit_cost', 'unit_cost_per_carton', 'currency',
            'expire_date', 'days_until_expiry', 'is_expired', 'is_near_expiry',
            'stock_id', 'created_at', 'notes',
        ]


class SaleBatchAllocationSerializer(DataRootSerializer):
    """Serializer for SaleBatchAllocation model."""
    batch_details = serializers.SerializerMethodField()
    sale_details = serializers.SerializerMethodField()
    sale_item_details = serializers.SerializerMethodField()

    class Meta:
        model = SaleBatchAllocation
        fields = "__all__"

    def get_batch_details(self, obj):
        if obj.inventory_batch:
            return {
                "id": obj.inventory_batch.id,
                "batch_number": obj.inventory_batch.batch_number,
                "product": obj.inventory_batch.product.name if obj.inventory_batch.product else None,
                "expire_date": obj.inventory_batch.expire_date,
            }
        return None

    def get_sale_details(self, obj):
        if obj.sale:
            return {
                "id": obj.sale.id,
                "invoice_number": obj.sale.invoice_number,
                "sale_date": obj.sale.sale_date,
            }
        return None

    def get_sale_item_details(self, obj):
        if obj.sale_item:
            return {
                "id": obj.sale_item.id,
                "product": obj.sale_item.stock.product.name if obj.sale_item.stock and obj.sale_item.stock.product else None,
            }
        return None


class StockAdjustmentSerializer(DataRootSerializer):
    """Serializer for StockAdjustment model."""
    batch_details = serializers.SerializerMethodField()
    adjusted_by_details = serializers.SerializerMethodField()

    class Meta:
        model = StockAdjustment
        fields = "__all__"

    def get_batch_details(self, obj):
        if obj.inventory_batch:
            return {
                "id": obj.inventory_batch.id,
                "batch_number": obj.inventory_batch.batch_number,
                "product": obj.inventory_batch.product.name if obj.inventory_batch.product else None,
            }
        return None

    def get_adjusted_by_details(self, obj):
        if obj.adjusted_by:
            user = obj.adjusted_by
            full_name = (
                getattr(user, 'get_full_name', None)
                and user.get_full_name()
            ) or ' '.join(
                filter(None, [getattr(user, 'first_name', ''),
                       getattr(user, 'last_name', '')])
            ).strip() or getattr(user, 'username', None) or getattr(user, 'email', None)
            return {
                "id": user.id,
                "username": getattr(user, 'username', None),
                "full_name": full_name,
            }
        return None


class StockAdjustmentCreateSerializer(DataRootSerializer):
    """Serializer for creating stock adjustments."""
    class Meta:
        model = StockAdjustment
        fields = [
            'inventory_batch', 'adjustment_type', 'quantity_before',
            'quantity_after', 'reason', 'reference_number'
        ]

    def validate(self, attrs):
        quantity_before = attrs.get('quantity_before')
        quantity_after = attrs.get('quantity_after')

        if quantity_before is None or quantity_after is None:
            raise serializers.ValidationError(
                "Both quantity_before and quantity_after are required."
            )
        if quantity_after < 0:
            raise serializers.ValidationError(
                {'quantity_after': 'Quantity after adjustment cannot be negative.'}
            )
        # quantity_change is computed in StockAdjustment.save()
        attrs['quantity_change'] = quantity_after - quantity_before
        return attrs
