from rest_framework import serializers

from api.models.data.vendors import Vendor
from api.serializers.data.base import DataRootSerializer


class VendorSerializer(DataRootSerializer):
    class Meta:
        model = Vendor
        fields = "__all__"

    def create(self, validated_data):
        validated_data.setdefault('is_active', True)
        return super().create(validated_data)
