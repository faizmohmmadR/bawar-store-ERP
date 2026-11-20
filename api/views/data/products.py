from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from api.models.data.product_packaging import ProductPackaging
from api.models.data.products import Product, ProductCategory
from api.serializers.data.products import (
    ProductCategorySerializer,
    ProductPackagingSerializer,
    ProductSerializer,
)
from api.views.data.base import DataRootViewSet


class ProductViewSet(DataRootViewSet):
    permission_module = 'products'
    queryset = (
        Product.objects.select_related('base_uom', 'category')
        .prefetch_related('packagings', 'prices', 'barcodes')
        .all()
        .order_by('-id')
    )
    parser_classes = (JSONParser, MultiPartParser, FormParser)
    serializer_class = ProductSerializer
    search_fields = ['name', 'barcode', 'sku', 'description', 'brand']
    filterset_fields = ['category', 'base_uom', 'is_active', 'track_inventory']
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options', 'delete']


class ProductPackagingViewSet(DataRootViewSet):
    permission_module = 'products'
    queryset = ProductPackaging.objects.select_related('product', 'uom').all().order_by('sort_order', 'id')
    serializer_class = ProductPackagingSerializer
    filterset_fields = ['product', 'for_purchase', 'for_sale', 'is_active', 'is_base']
    search_fields = ['name', 'barcode', 'product__name']


class ProductCategoryViewSet(DataRootViewSet):
    permission_module = 'products'
    queryset = ProductCategory.objects.all().order_by('name')
    serializer_class = ProductCategorySerializer
    search_fields = ['name']
