from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.serializers.data.base import DataRootSerializer


class UnitCategorySerializer(DataRootSerializer):
    class Meta:
        model = UnitCategory
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'deleted_at', 'deleted_by']


class UnitOfMeasureSerializer(DataRootSerializer):
    class Meta:
        model = UnitOfMeasure
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'deleted_at', 'deleted_by']
