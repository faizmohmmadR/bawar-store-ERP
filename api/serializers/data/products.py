from django.db import transaction
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
    retail_prices = serializers.SerializerMethodField()

    class Meta:
        model = ProductPackaging
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'deleted_at', 'deleted_by']

    def _retail_qs(self, obj):
        return obj.prices.filter(
            deleted_at__isnull=True,
            is_active=True,
            price_type=ProductPrice.PRICE_RETAIL,
        )

    def get_retail_price(self, obj):
        from api.models.data.currency import BASE_CURRENCY_ID

        # Stock / sales list price is AFN only — never fall back to USD.
        price = (
            self._retail_qs(obj)
            .filter(currency=BASE_CURRENCY_ID)
            .order_by('-effective_from', '-id')
            .first()
        )
        if not price:
            return None
        return {'amount': price.amount, 'currency': BASE_CURRENCY_ID}

    def get_retail_prices(self, obj):
        from api.models.data.currency import BASE_CURRENCY_ID

        price = (
            self._retail_qs(obj)
            .filter(currency=BASE_CURRENCY_ID)
            .order_by('-effective_from', '-id')
            .first()
        )
        if not price:
            return []
        return [{'amount': price.amount, 'currency': BASE_CURRENCY_ID}]


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
    from api.models.data.currency import BASE_CURRENCY_ID

    # AFN-only stock sale prices (ignore any legacy USD/native list rows).
    retail_by_packaging = {}
    for price in product.prices.filter(
        deleted_at__isnull=True,
        is_active=True,
        price_type=ProductPrice.PRICE_RETAIL,
        currency=BASE_CURRENCY_ID,
    ).order_by('packaging_id', '-effective_from', '-id'):
        if price.packaging_id in retail_by_packaging:
            continue
        retail_by_packaging[price.packaging_id] = {
            'amount': price.amount,
            'currency': BASE_CURRENCY_ID,
        }
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
            'retail_prices': (
                [retail_by_packaging[p.id]] if p.id in retail_by_packaging else []
            ),
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
        'stock_on_hand': getattr(product, 'stock_on_hand', None),
    }


class ProductSerializer(DataRootSerializer):
    packagings = ProductPackagingSerializer(many=True, read_only=True)
    packagings_data = serializers.ListField(
        child=serializers.DictField(), required=False, write_only=True,
    )
    image_url = serializers.SerializerMethodField()
    base_uom_details = serializers.SerializerMethodField()
    stock_on_hand = serializers.SerializerMethodField()
    # Drop default UniqueValidators — uniqueness is handled in validate() with clearer messages.
    barcode = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, validators=[],
    )
    sku = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, validators=[],
    )

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

    def get_stock_on_hand(self, obj):
        annotated = obj.__dict__.get('stock_on_hand')
        if annotated is not None:
            return annotated
        from django.db.models import Sum
        from api.models.data.inventory_ledger import InventoryBalance

        qs = InventoryBalance.objects.filter(product_id=obj.pk)
        request = self.context.get('request')
        warehouse = request.query_params.get('warehouse') if request else None
        if warehouse:
            qs = qs.filter(warehouse_id=warehouse)
        return qs.aggregate(total=Sum('quantity_on_hand'))['total'] or 0

    def validate(self, attrs):
        attrs = super().validate(attrs)
        barcode = attrs.get('barcode', getattr(self.instance, 'barcode', None))
        if isinstance(barcode, str):
            barcode = barcode.strip() or None
            attrs['barcode'] = barcode

        sku = attrs.get('sku', getattr(self.instance, 'sku', None))
        if isinstance(sku, str):
            sku = sku.strip() or None
            attrs['sku'] = sku

        exclude_id = self.instance.pk if self.instance else None

        if barcode:
            taken = Product.objects.filter(barcode=barcode)
            if exclude_id:
                taken = taken.exclude(pk=exclude_id)
            other = taken.first()
            if other:
                raise serializers.ValidationError({
                    'barcode': (
                        f'This barcode is already used by “{other.name}”. '
                        'Use that product, or enter a different barcode.'
                    ),
                })

            # Ignore packaging rows left on soft-deleted products.
            pack_taken = ProductPackaging.objects.filter(
                barcode=barcode,
                product__deleted_at__isnull=True,
            )
            if exclude_id:
                pack_taken = pack_taken.exclude(product_id=exclude_id)
            pack_other = pack_taken.select_related('product').first()
            if pack_other:
                raise serializers.ValidationError({
                    'barcode': (
                        f'This barcode is already used on packaging '
                        f'“{pack_other.name}” of product “{pack_other.product.name}”.'
                    ),
                })

        if sku:
            taken_sku = Product.objects.filter(sku=sku)
            if exclude_id:
                taken_sku = taken_sku.exclude(pk=exclude_id)
            other_sku = taken_sku.first()
            if other_sku:
                raise serializers.ValidationError({
                    'sku': (
                        f'This SKU is already used by “{other_sku.name}”. '
                        'Use a different SKU.'
                    ),
                })

        rows = attrs.get('packagings_data')
        if rows is not None:
            self._validate_packaging_barcodes(rows, exclude_product_id=exclude_id, product_barcode=barcode)

        return attrs

    def _validate_packaging_barcodes(self, rows, *, exclude_product_id=None, product_barcode=None):
        seen = set()
        for index, row in enumerate(rows or []):
            code = row.get('barcode')
            if isinstance(code, str):
                code = code.strip() or None
            if not code:
                continue
            if code in seen:
                raise serializers.ValidationError({
                    'packagings_data': (
                        f'Duplicate packaging barcode “{code}”. '
                        'Each unit must have a different barcode.'
                    ),
                })
            seen.add(code)

            # Same code on product + its own base packaging is allowed.
            if product_barcode and code == product_barcode:
                continue

            pack_qs = ProductPackaging.objects.filter(
                barcode=code,
                product__deleted_at__isnull=True,
            )
            if exclude_product_id:
                pack_qs = pack_qs.exclude(product_id=exclude_product_id)
            conflict = pack_qs.select_related('product').first()
            if conflict:
                raise serializers.ValidationError({
                    'packagings_data': (
                        f'Packaging barcode “{code}” is already used on '
                        f'“{conflict.product.name}” ({conflict.name}).'
                    ),
                })

            prod_qs = Product.objects.filter(barcode=code)
            if exclude_product_id:
                prod_qs = prod_qs.exclude(pk=exclude_product_id)
            prod_conflict = prod_qs.first()
            if prod_conflict:
                raise serializers.ValidationError({
                    'packagings_data': (
                        f'Packaging barcode “{code}” is already the product barcode '
                        f'for “{prod_conflict.name}”.'
                    ),
                })

    @transaction.atomic
    def create(self, validated_data):
        packagings_data = validated_data.pop('packagings_data', [])
        product = super().create(validated_data)
        self._write_packagings(product, packagings_data)
        self._ensure_base_packaging(product)
        return product

    @transaction.atomic
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
            data = {k: v for k, v in dict(row).items() if k not in ('id', 'product', 'uom')}
            # Frontend may send uom as a raw FK id; ORM needs uom_id / instance.
            uom_value = dict(row).get('uom', None)
            if uom_value in (None, '', 0, '0'):
                data['uom_id'] = product.base_uom_id
            elif hasattr(uom_value, 'pk'):
                data['uom_id'] = uom_value.pk
            else:
                data['uom_id'] = int(uom_value)
            if data.get('barcode') == '':
                data['barcode'] = None
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
