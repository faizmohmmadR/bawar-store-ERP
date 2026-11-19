from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from api.models.data.products import Product
from api.serializers.data.products import ProductSerializer
from api.views.data.base import DataRootViewSet


class ProductViewSet(DataRootViewSet):
    permission_module = 'products'
    queryset = Product.objects.all().order_by('-id')
    parser_classes = (JSONParser, MultiPartParser, FormParser)
    serializer_class = ProductSerializer
    search_fields = ["name", "barcode", "description"]
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']
