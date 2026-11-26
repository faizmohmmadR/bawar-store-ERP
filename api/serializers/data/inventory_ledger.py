from django.utils import timezone
from rest_framework import serializers

from api.models.data.inventory_ledger import InventoryBalance, StockMovement
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.products import serialize_product
from api.services.inventory.display import packaging_breakdown


class InventoryBalanceSerializer(DataRootSerializer):
    product_details = serializers.SerializerMethodField()
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    quantity_available = serializers.DecimalField(
        max_digits=18, decimal_places=6, read_only=True,
    )
    packaging_breakdown = serializers.SerializerMethodField()
    lot_number = serializers.CharField(source='lot.lot_number', read_only=True, default=None)
    expiry_date = serializers.DateField(source='lot.expiry_date', read_only=True, default=None)
    days_to_expiry = serializers.SerializerMethodField()
    is_expired = serializers.SerializerMethodField()
    purchase_invoice = serializers.SerializerMethodField()
    purchase_id = serializers.SerializerMethodField()
    purchase_item_id = serializers.SerializerMethodField()

    class Meta:
        model = InventoryBalance
        fields = '__all__'

    def get_product_details(self, obj):
        return serialize_product(obj.product, self.context.get('request'))

    def get_packaging_breakdown(self, obj):
        packs = list(obj.product.packagings.filter(is_active=True, deleted_at__isnull=True))
        return packaging_breakdown(obj.quantity_on_hand, packs)

    def get_days_to_expiry(self, obj):
        lot = getattr(obj, 'lot', None)
        if not lot or not lot.expiry_date:
            return None
        return (lot.expiry_date - timezone.localdate()).days

    def get_is_expired(self, obj):
        days = self.get_days_to_expiry(obj)
        return bool(days is not None and days < 0)

    def _purchase_receipt_source(self, obj):
        """Cache first purchase-receipt movement source for this lot balance."""
        cache = self.context.setdefault('_lot_purchase_cache', {})
        lot_id = getattr(obj, 'lot_id', None)
        if not lot_id:
            return None
        if lot_id in cache:
            return cache[lot_id]

        movement = (
            StockMovement.objects.filter(
                lot_id=lot_id,
                movement_type=StockMovement.TYPE_PURCHASE_RECEIPT,
                object_id__isnull=False,
            )
            .order_by('occurred_at', 'id')
            .first()
        )
        purchase = None
        purchase_item_id = None
        invoice = None
        if movement is not None and movement.content_type_id and movement.object_id:
            try:
                source = movement.content_type.get_object_for_this_type(pk=movement.object_id)
            except Exception:
                source = None
            if source is not None:
                purchase_item_id = getattr(source, 'id', None)
                purchase = getattr(source, 'purchase', None)
                if purchase is not None:
                    invoice = getattr(purchase, 'invoice_number', None) or getattr(
                        purchase, 'bill_number', None,
                    )
        cache[lot_id] = {
            'purchase_id': getattr(purchase, 'id', None),
            'purchase_item_id': purchase_item_id,
            'purchase_invoice': invoice,
        }
        return cache[lot_id]

    def get_purchase_invoice(self, obj):
        info = self._purchase_receipt_source(obj)
        return info['purchase_invoice'] if info else None

    def get_purchase_id(self, obj):
        info = self._purchase_receipt_source(obj)
        return info['purchase_id'] if info else None

    def get_purchase_item_id(self, obj):
        info = self._purchase_receipt_source(obj)
        return info['purchase_item_id'] if info else None


class StockMovementSerializer(DataRootSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    packaging_name = serializers.CharField(source='packaging.name', read_only=True, default=None)
    lot_number = serializers.CharField(source='lot.lot_number', read_only=True, default=None)
    expiry_date = serializers.DateField(source='lot.expiry_date', read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = '__all__'
        read_only_fields = [f.name for f in StockMovement._meta.fields]
