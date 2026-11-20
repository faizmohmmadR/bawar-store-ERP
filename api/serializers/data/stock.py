from rest_framework import serializers

from api.models.data.stock import Stock
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.products import serialize_product


class StockSerializer(DataRootSerializer):
    product_details = serializers.SerializerMethodField()
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)

    class Meta:
        model = Stock
        fields = '__all__'

    def get_product_details(self, obj):
        return serialize_product(obj.product, self.context.get('request'))
