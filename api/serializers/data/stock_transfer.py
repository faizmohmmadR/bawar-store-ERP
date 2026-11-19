from rest_framework import serializers

from api.models.data.stock_transfer import StockTransfer


class StockTransferSerializer(serializers.ModelSerializer):
    product_details = serializers.SerializerMethodField()
    target_product_details = serializers.SerializerMethodField()
    reason_display = serializers.CharField(
        source='get_reason_display', read_only=True)
    condition_display = serializers.CharField(
        source='get_condition_display', read_only=True)

    class Meta:
        model = StockTransfer
        fields = [
            'id',
            'transfer_number',
            'product',
            'product_details',
            'target_product',
            'target_product_details',
            'condition',
            'condition_display',
            'reason',
            'reason_display',
            'piece_amount',
            'unit_cost',
            'currency',
            'total_value',
            'transfer_date',
            'status',
            'notes',
            'source_stock',
            'target_stock',
            'source_batch',
            'transferred_by',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_product_details(self, obj):
        p = obj.product
        if not p:
            return None
        return {'id': p.id, 'name': p.name, 'barcode': p.barcode}

    def get_target_product_details(self, obj):
        p = obj.target_product
        if not p:
            return None
        return {'id': p.id, 'name': p.name, 'barcode': p.barcode}
