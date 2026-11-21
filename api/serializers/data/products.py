from rest_framework import serializers

from api.models.data.product_packaging import ProductBarcode, ProductPackaging, ProductPrice
from api.models.data.products import Product, ProductCategory
from api.serializers.data.base import DataRootSerializer


def product_image_url(product, request=None):
    image = getattr(product, 'image', None)
    if not image:
        return None
    try:
        url = image.url
    except ValueError:
        return None
    if request:
        return request.build_absolute_uri(url)
    return url


class ProductPackagingSerializer(DataRootSerializer):
    retail_price = serializers.SerializerMethodField()

    class Meta:
        model = ProductPackaging
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'deleted_at', 'deleted_by']

    def get_retail_price(self, obj):
        price = (
            obj.prices.filter(
                deleted_at__isnull=True,
                is_active=True,
                price_type=ProductPrice.PRICE_RETAIL,
            )
            .order_by('-effective_from', '-id')
            .first()
        )
        if not price:
            return None
        return {'amount': price.amount, 'currency': price.currency}


class ProductBarcodeSerializer(DataRootSerializer):
    class Meta:
        model = ProductBarcode
        fields = '__all__'


class ProductPriceSerializer(DataRootSerializer):
    class Meta:
        model = ProductPrice
        fields = '__all__'


class ProductCategorySerializer(DataRootSerializer):
    class Meta:
        model = ProductCategory
        fields = '__all__'


def serialize_product(product, request=None):
    if not product:
        return None
    retail_by_packaging = {}
    for price in product.prices.filter(
        deleted_at__isnull=True,
        is_active=True,
        price_type=ProductPrice.PRICE_RETAIL,
    ).order_by('packaging_id', '-effective_from', '-id'):
        retail_by_packaging.setdefault(price.packaging_id, {
            'amount': price.amount,
            'currency': price.currency,
        })
    packagings = [
        {
            'id': p.id,
            'name': p.name,
            'qty_in_base': p.qty_in_base,
            'is_base': p.is_base,
            'for_purchase': p.for_purchase,
            'for_sale': p.for_sale,
            'for_stock': p.for_stock,
            'is_default_purchase': p.is_default_purchase,
            'is_default_sale': p.is_default_sale,
            'is_active': p.is_active,
            'barcode': p.barcode,
            'is_variable_weight': p.is_variable_weight,
            'uom': p.uom_id,
            'retail_price': retail_by_packaging.get(p.id),
        }
        for p in product.packagings.filter(deleted_at__isnull=True)
    ]
    return {
        'id': product.id,
        'name': product.name,
        'sku': product.sku,
        'barcode': product.barcode,
        'description': product.description,
        'image': product_image_url(product, request),
        'base_uom': product.base_uom_id,
        'base_uom_details': {
            'id': product.base_uom_id,
            'code': getattr(product.base_uom, 'code', None),
            'name': getattr(product.base_uom, 'name', None),
            'symbol': getattr(product.base_uom, 'symbol', None),
        } if product.base_uom_id else None,
        'category': product.category_id,
        'brand': product.brand,
        'costing_method': product.costing_method,
        'average_cost': product.average_cost,
        'min_stock_level': product.min_stock_level,
        'reorder_level': product.reorder_level,
        'track_inventory': product.track_inventory,
        'track_batch': product.track_batch,
        'track_expiry': product.track_expiry,
        'is_active': product.is_active,
        'packagings': packagings,
        'default_purchase_packaging': product.default_purchase_packaging_id,
        'default_sales_packaging': product.default_sales_packaging_id,
    }


class ProductSerializer(DataRootSerializer):
    packagings = ProductPackagingSerializer(many=True, read_only=True)
    packagings_data = serializers.ListField(
        child=serializers.DictField(), required=False, write_only=True,
    )
    image_url = serializers.SerializerMethodField()
    base_uom_details = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = '__all__'
        read_only_fields = [
            'id', 'average_cost', 'created_at', 'updated_at', 'deleted_at', 'deleted_by',
        ]

    def get_image_url(self, obj):
        return product_image_url(obj, self.context.get('request'))

    def get_base_uom_details(self, obj):
        if not obj.base_uom_id:
            return None
        uom = obj.base_uom
        return {
            'id': obj.base_uom_id,
            'code': getattr(uom, 'code', None),
            'name': getattr(uom, 'name', None),
            'symbol': getattr(uom, 'symbol', None),
        }

    def create(self, validated_data):
        packagings_data = validated_data.pop('packagings_data', [])
        product = super().create(validated_data)
        self._write_packagings(product, packagings_data)
        self._ensure_base_packaging(product)
        return product

    def update(self, instance, validated_data):
        packagings_data = validated_data.pop('packagings_data', None)
        product = super().update(instance, validated_data)
        if packagings_data is not None:
            product.packagings.all().delete()
            self._write_packagings(product, packagings_data)
        self._ensure_base_packaging(product)
        return product

    def _write_packagings(self, product, rows):
        for row in rows or []:
            data = {k: v for k, v in dict(row).items() if k not in ('id', 'product')}
            ProductPackaging.objects.create(product=product, **data)

    def _ensure_base_packaging(self, product):
        if product.packagings.filter(is_base=True).exists():
            return
        ProductPackaging.objects.create(
            product=product,
            name=getattr(product.base_uom, 'name', None) or 'Base',
            uom=product.base_uom,
            qty_in_base=1,
            is_base=True,
            for_purchase=True,
            for_sale=True,
            for_stock=True,
            is_default_purchase=True,
            is_default_sale=True,
            barcode=product.barcode,
        )
