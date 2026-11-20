from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.serializers.data.uom import UnitCategorySerializer, UnitOfMeasureSerializer
from api.views.data.base import DataRootViewSet


class UnitCategoryViewSet(DataRootViewSet):
    permission_module = 'uom'
    queryset = UnitCategory.objects.all().order_by('name')
    serializer_class = UnitCategorySerializer
    search_fields = ['name', 'code']


class UnitOfMeasureViewSet(DataRootViewSet):
    permission_module = 'uom'
    queryset = UnitOfMeasure.objects.select_related('category').all().order_by('name')
    serializer_class = UnitOfMeasureSerializer
    search_fields = ['name', 'code', 'symbol']
    filterset_fields = ['category', 'is_category_reference']
