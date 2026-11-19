from rest_framework import serializers
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum
from decimal import Decimal

from api.models.data.currency import CURRENCY_CHOICES, currency_details as _currency_details_fn
from api.models.data.stock import Stock
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.cost_currency import CostCurrencyMixin
from api.utils.packaging import (
    PIECES_PER_CARTON,
    bottles_per_carton,
    cartons_from_pieces,
    remainder_pieces,
    price_per_carton_from_piece,
)




class StockSerializer(CostCurrencyMixin, DataRootSerializer):
    cost_aliases = {"buy_price_afn": "buy_price", "buy_price_per_carton_afn": "buy_price_per_carton"}
    currency = serializers.IntegerField()
    product_details = serializers.SerializerMethodField()
    currency_details = serializers.SerializerMethodField()
    batches = serializers.SerializerMethodField()
    # Writable qty inputs (also returned via to_representation from batches)
    carton_amount = serializers.DecimalField(
        max_digits=12, decimal_places=4, required=False, allow_null=True
    )
    piece_amount = serializers.DecimalField(
        max_digits=12, decimal_places=4, required=False, allow_null=True
    )
    loose_pieces = serializers.SerializerMethodField()
    bottle_amount = serializers.SerializerMethodField()
    plastic_amount = serializers.SerializerMethodField()
    days_until_expiry = serializers.SerializerMethodField()
    buy_price_per_carton = serializers.SerializerMethodField()

    class Meta:
        model = Stock
        fields = '__all__'

    def _stock_lots(self, obj):
        if not hasattr(self, '_lot_cache'):
            self._lot_cache = {}
        if obj.pk not in self._lot_cache:
            prefetched = getattr(obj.product, 'stock_cost_batches', None)
            if prefetched is not None:
                lots = [lot for lot in prefetched if lot.condition == obj.condition]
            else:
                from api.models.data.inventory_batch import InventoryBatch
                lots = list(InventoryBatch.objects.filter(product_id=obj.product_id, condition=obj.condition).select_related('supplier', 'product'))
            self._lot_cache[obj.pk] = lots
        return self._lot_cache[obj.pk]

    def _valuation(self, obj):
        if not hasattr(self, '_valuation_cache'):
            self._valuation_cache = {}
        if obj.pk not in self._valuation_cache:
            from api.services.stock_valuation import stock_valuation
            self._valuation_cache[obj.pk] = stock_valuation(obj, batches=self._stock_lots(obj))
        return self._valuation_cache[obj.pk]

    def _sellable_pieces(self, obj):
        return self._valuation(obj)['available']

    def get_loose_pieces(self, obj):
        if obj.product.is_piece_stock:
            return 0
        return float(remainder_pieces(
            self._sellable_pieces(obj), bottles_per_carton(obj.product),
        ))

    def get_bottle_amount(self, obj):
        """Total sellable bottles (same canonical pieces as packed stock)."""
        if obj.product.is_piece_stock and obj.product.stock_kind != 'bottle':
            return 0
        return float(self._sellable_pieces(obj))

    def get_plastic_amount(self, obj):
        """Total sellable plastic sleeves (1:1 with bottles after packing)."""
        if obj.product.is_piece_stock and obj.product.stock_kind != 'plastic':
            return 0
        return float(self._sellable_pieces(obj))

    def get_buy_price_per_carton(self, obj):
        return float(price_per_carton_from_piece(
            obj.buy_price, bottles_per_carton(obj.product),
        ))

    def get_days_until_expiry(self, obj):
        dates = [lot.expire_date for lot in self._stock_lots(obj) if lot.remaining_pieces > 0 and lot.status in ('active', 'expired') and lot.expire_date]
        earliest = min(dates) if dates else obj.expire_date
        return (earliest - timezone.localdate()).days if earliest else None

    def get_batches(self, obj):
        from api.serializers.data.inventory_batch import InventoryBatchListSerializer
        batches = [lot for lot in self._stock_lots(obj) if lot.remaining_pieces > 0 and lot.status in ('active', 'expired')]
        batches.sort(key=lambda lot: (lot.expire_date is None, lot.expire_date or timezone.localdate(), lot.created_at, lot.pk))
        return InventoryBatchListSerializer(batches, many=True, context=self.context).data

    def get_product_details(self, obj):
        if obj.product:
            from api.serializers.data.products import serialize_product
            return serialize_product(obj.product, self.context.get('request'))
        return None

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        pieces = self._sellable_pieces(instance)
        carton_size = bottles_per_carton(instance.product)
        data['piece_amount'] = pieces
        data['bottle_amount'] = float(pieces)
        data['plastic_amount'] = float(pieces)
        data['carton_amount'] = float(cartons_from_pieces(pieces, carton_size))
        data['loose_pieces'] = float(remainder_pieces(pieces, carton_size))
        if instance.product.is_piece_stock:
            material_type = instance.product.stock_kind
            data['quantity_unit'] = 'piece'
            data['bottle_amount'] = float(pieces) if material_type in {'bottle', 'bottle_with_cap'} else 0
            data['carton_amount'] = float(pieces) if material_type == 'carton' else 0
            data['plastic_amount'] = float(pieces) if material_type == 'plastic' else 0
            data['loose_pieces'] = 0

        from decimal import ROUND_HALF_UP
        from api.services.cost_currency import usd_amount
        valuation = self._valuation(instance)
        for field, source in {
            'on_hand_quantity': 'quantity', 'available_quantity': 'available',
            'average_unit_cost_afn': 'average', 'stock_value_afn': 'value',
            'min_unit_cost_afn': 'min_cost', 'max_unit_cost_afn': 'max_cost',
            'last_unit_cost_afn': 'last_cost',
        }.items():
            value = valuation[source]
            precision = Decimal('0.000001') if 'unit_cost' in field else Decimal('0.0001')
            data[field] = str(value.quantize(precision, rounding=ROUND_HALF_UP))
            if field.endswith('_afn'):
                data[field[:-4] + '_usd'] = usd_amount(value, data['usd_to_afn_rate'])
        data['batch_count'] = valuation['batch_count']
        data['price_layer_count'] = valuation['price_count']
        data['buy_price'] = str(valuation['average'].quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP))
        data['buy_price_afn'] = data['buy_price']
        data['buy_price_usd'] = usd_amount(valuation['average'], data['usd_to_afn_rate'])
        data['buy_price_per_carton'] = float(valuation['average'] * carton_size)
        data['buy_price_per_carton_afn'] = data['buy_price_per_carton']
        data['buy_price_per_carton_usd'] = usd_amount(valuation['average'] * carton_size, data['usd_to_afn_rate'])
        dates = [lot.expire_date for lot in self._stock_lots(instance) if lot.remaining_pieces > 0 and lot.status in ('active', 'expired') and lot.expire_date]
        data['expire_date'] = min(dates).isoformat() if dates else (instance.expire_date.isoformat() if instance.expire_date else None)
        return data

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance and self.instance.product.is_piece_stock and attrs.get('product', self.instance.product) != self.instance.product:
            raise serializers.ValidationError({'product': 'A material-linked stock row must keep its original material product.'})

        # Stock rows represent a product variant and condition.
        product = attrs.get('product')
        condition = attrs.get('condition')
        
        if product is None and self.instance is not None:
            product = self.instance.product
        if condition is None and self.instance is not None:
            condition = self.instance.condition
        
        if product and condition:
            qs = Stock.objects.filter(
                product=product,
                condition=condition
            )
            
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            
            if qs.exists():
                raise serializers.ValidationError({
                    'detail': 'A stock entry with this product and condition already exists.',
                })

        initial = self.initial_data if isinstance(self.initial_data, dict) else {}

        carton_raw = attrs.get('carton_amount', initial.get('carton_amount'))
        loose_raw = initial.get('loose_pieces')
        pieces_raw = attrs.get('piece_amount')
        if pieces_raw is None:
            pieces_raw = initial.get('piece_amount', initial.get('dana_amount'))

        product = attrs.get('product') or getattr(self.instance, 'product', None)
        carton_size = bottles_per_carton(product)
        cartons = Decimal(str(carton_raw or 0))
        loose = Decimal(str(loose_raw or 0))
        pieces = Decimal(str(pieces_raw or 0))

        # Canonical write: explicit total pieces wins; else cartons + loose
        if pieces_raw is not None:
            pass
        elif cartons > 0 or loose > 0:
            pieces = (cartons * carton_size) + loose
        elif self.instance is not None and carton_raw is None and loose_raw is None:
            pieces = self._valuation(self.instance)['quantity']
        if pieces < 0:
            raise serializers.ValidationError({'piece_amount': 'Stock quantity must be zero or greater.'})

        attrs['piece_amount'] = pieces
        attrs.pop('carton_amount', None)

        return attrs

    def create(self, validated_data):
        from api.services.batch_inventory import sync_manual_stock_batch

        stock = super().create(validated_data)
        sync_manual_stock_batch(
            stock,
            pieces=stock.piece_amount,
            expire_date=stock.expire_date,
        )
        self._lot_cache = {}
        self._valuation_cache = {}
        if hasattr(stock.product, 'stock_cost_batches'):
            del stock.product.stock_cost_batches
        return stock

    @transaction.atomic
    def update(self, instance, validated_data):
        from api.services.batch_inventory import sync_manual_stock_batch

        from api.services.stock_valuation import stock_valuation
        instance = Stock.objects.select_for_update().get(pk=instance.pk)
        from api.services.pooled_stock import ensure_stock_batches
        ensure_stock_batches(instance)
        previous_pieces = stock_valuation(instance)['quantity']
        requested_pieces = validated_data.get('piece_amount', previous_pieces)
        requested_price = validated_data.get('buy_price')
        previous_price = instance.buy_price
        if requested_pieces != previous_pieces:
            # Batch inflow / manual adjustment owns the quantity-change journal.
            instance._skip_stock_journal = True
        stock = super().update(instance, validated_data)
        sync_manual_stock_batch(
            stock,
            pieces=stock.piece_amount,
            expire_date=stock.expire_date,
            previous_pieces=previous_pieces,
            user=getattr(self.context.get('request'), 'user', None),
        )
        # An explicit price correction applies to the remaining stock, including
        # packing lots and edits that also change the counted quantity.
        if requested_price is not None and requested_price != previous_price:
            from api.models.data.inventory_batch import InventoryBatch
            from api.services.currency_conversion import normalize_stock_buy_price
            from api.services.stock_valuation import sync_stock_valuation
            price, _ = normalize_stock_buy_price(requested_price, validated_data.get('currency', 1), raise_if_missing=False)
            InventoryBatch.objects.filter(product=stock.product, condition=stock.condition,
                status__in=['active', 'expired'], remaining_pieces__gt=0).update(unit_cost=price)
            sync_stock_valuation(stock)
        self._lot_cache = {}
        self._valuation_cache = {}
        if hasattr(stock.product, 'stock_cost_batches'):
            del stock.product.stock_cost_batches
        return stock
