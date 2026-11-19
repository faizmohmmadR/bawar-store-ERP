from decimal import Decimal
from rest_framework import serializers
from api.models.data.raw_materials import RawMaterialCategory, RawMaterial, RawMaterialPurchase, RawMaterialPurchaseItem, RawMaterialStock
from api.models.data.currency import CURRENCY_CHOICES, currency_details as _currency_details_fn
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.cost_currency import CostCurrencyMixin
from api.mixins.base_currency import BaseCurrencySerializerMixin
from api.utils.order_numeric import quantize_order_amount


class RawMaterialCategorySerializer(DataRootSerializer):
    class Meta:
        model = RawMaterialCategory
        fields = ('id', 'name', 'created_at', 'updated_at')

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter a category name.')
        if RawMaterialCategory.all_objects.filter(name__iexact=value).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('A category with this name already exists.')
        return value


class RawMaterialSerializer(DataRootSerializer):
    """Serializer for RawMaterial model."""

    category_name = serializers.CharField(source="category.name", read_only=True, default=None)

    class Meta:
        model = RawMaterial
        fields = "__all__"
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get('weight_per_piece_kg') is not None and attrs['weight_per_piece_kg'] <= 0:
            raise serializers.ValidationError({'weight_per_piece_kg': 'Piece weight must be greater than zero.'})
        material_type = attrs.get('material_type', getattr(
            self.instance, 'material_type', None))
        category = attrs.get('category', getattr(self.instance, 'category', None))
        categorized_types = {'bottle', 'bottle_with_cap', 'plastic'}
        if category is not None and material_type not in categorized_types:
            raise serializers.ValidationError({'category': 'Categories apply to bottles and plastic only.'})
        if material_type in categorized_types and category is None:
            raise serializers.ValidationError({'category': 'Select a category.'})
        capacity = attrs.get('capacity_liters', getattr(
            self.instance, 'capacity_liters', None))
        capacity_kg = attrs.get('capacity_kg', getattr(
            self.instance, 'capacity_kg', None))
        bottles_per_carton = attrs.get('bottles_per_carton', getattr(
            self.instance, 'bottles_per_carton', None))
        capacity_fields_submitted = (
            'capacity_liters' in attrs or 'capacity_kg' in attrs
        )
        bottle_types = {
            RawMaterial.TYPE_BOTTLE,
            RawMaterial.TYPE_BOTTLE_WITH_CAP,
        }
        material_type_changed_to_bottle = (
            self.instance is not None
            and self.instance.material_type not in bottle_types
            and material_type in bottle_types
        )

        sized_types = bottle_types | {
            RawMaterial.TYPE_CARTON,
        }
        material_type_changed_to_sized = (
            self.instance is not None
            and self.instance.material_type not in sized_types
            and material_type in sized_types
        )
        if material_type in sized_types:
            if (
                capacity_fields_submitted
                or self.instance is None
                or material_type_changed_to_bottle
                or material_type_changed_to_sized
            ):
                has_volume_capacity = capacity is not None
                has_mass_capacity = capacity_kg is not None
                if has_volume_capacity == has_mass_capacity:
                    raise serializers.ValidationError({
                        'capacity_liters': (
                            'Set exactly one matching bottle size: volume (ml/L) '
                            'or mass (kg).'
                        )
                    })
            if capacity is not None and Decimal(str(capacity)) <= 0:
                raise serializers.ValidationError({
                    'capacity_liters': 'Matching bottle volume must be greater than zero.'
                })
            if capacity_kg is not None and Decimal(str(capacity_kg)) <= 0:
                raise serializers.ValidationError({
                    'capacity_kg': 'Matching bottle mass must be greater than zero kilograms.'
                })
            if capacity_fields_submitted:
                if capacity is None:
                    attrs['capacity_liters'] = None
                if capacity_kg is None:
                    attrs['capacity_kg'] = None
        else:
            attrs['capacity_kg'] = None
            capacity_kg = None
            if capacity is not None and Decimal(str(capacity)) <= 0:
                raise serializers.ValidationError({
                    'capacity_liters': 'Capacity must be greater than zero when provided.'
                })
        if capacity_kg is not None and Decimal(str(capacity_kg)) <= 0:
            raise serializers.ValidationError({
                'capacity_kg': 'Mass capacity must be greater than zero when provided.'
            })

        if material_type == RawMaterial.TYPE_CARTON:
            if bottles_per_carton is None:
                raise serializers.ValidationError({
                    'bottles_per_carton': 'Bottles per carton is required for carton materials.'
                })
            if int(bottles_per_carton) < 1:
                raise serializers.ValidationError({
                    'bottles_per_carton': 'Bottles per carton must be at least 1.'
                })
        elif 'bottles_per_carton' in attrs:
            attrs['bottles_per_carton'] = None

        if material_type == RawMaterial.TYPE_PLASTIC:
            attrs['capacity_liters'] = None
            attrs['capacity_kg'] = None
            ratio = attrs.get('bottles_per_plastic', getattr(self.instance, 'bottles_per_plastic', None))
            if ratio is not None and ratio < 1:
                raise serializers.ValidationError({'bottles_per_plastic': 'Enter a positive whole bottle capacity.'})
        elif 'bottles_per_plastic' in attrs:
            attrs['bottles_per_plastic'] = None

        display_unit = attrs.get(
            'capacity_display_unit',
            getattr(self.instance, 'capacity_display_unit', None),
        )
        if display_unit not in {
            RawMaterial.CAPACITY_UNIT_ML,
            RawMaterial.CAPACITY_UNIT_L,
            None,
            '',
        }:
            raise serializers.ValidationError({
                'capacity_display_unit': 'Capacity display unit must be ml or L.',
            })
        if material_type not in {
            RawMaterial.TYPE_BOTTLE,
            RawMaterial.TYPE_BOTTLE_WITH_CAP,
            RawMaterial.TYPE_PLASTIC,
            RawMaterial.TYPE_CARTON,
        }:
            if 'capacity_display_unit' in attrs:
                attrs['capacity_display_unit'] = RawMaterial.CAPACITY_UNIT_ML

        if material_type in RawMaterial.KG_ONLY_TYPES:
            # Always stocked in kilograms (optional piece counts on purchases).
            attrs['unit'] = RawMaterial.UNIT_KG
            attrs['capacity_liters'] = None
            attrs['capacity_kg'] = None
            attrs['bottles_per_carton'] = None
            attrs['bottles_per_plastic'] = None

        return attrs

    def validate_unit(self, value):
        material_type = None
        if hasattr(self, 'initial_data') and isinstance(self.initial_data, dict):
            material_type = self.initial_data.get('material_type')
        if material_type is None and self.instance is not None:
            material_type = self.instance.material_type
        if material_type in RawMaterial.KG_ONLY_TYPES:
            return RawMaterial.UNIT_KG
        if self.instance and self.instance.unit != value:
            if self.instance.purchase_items.exists() or self.instance.stocks.filter(quantity__gt=0).exists():
                raise serializers.ValidationError(
                    'Unit cannot be changed after this raw material has purchase or stock history.'
                )
        return value


class RawMaterialPurchaseItemSerializer(DataRootSerializer):
    """Serializer for RawMaterialPurchaseItem model."""
    price_per_unit = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=Decimal('0'), required=False, default=Decimal('0'),
    )
    raw_material_details = serializers.SerializerMethodField()

    class Meta:
        model = RawMaterialPurchaseItem
        fields = "__all__"
        read_only_fields = ['total_price',
                            'price_per_unit_base', 'total_price_base']

    def get_raw_material_details(self, obj):
        if obj.raw_material:
            return {
                "id": obj.raw_material.id,
                "name": obj.raw_material.name,
                "unit": obj.raw_material.unit,
                "material_type": obj.raw_material.material_type,
                "category": obj.raw_material.category_id,
                "category_name": obj.raw_material.category.name if obj.raw_material.category_id else None,
                "capacity_liters": str(obj.raw_material.capacity_liters) if obj.raw_material.capacity_liters is not None else None,
                "capacity_display_unit": obj.raw_material.capacity_display_unit,
                "weight_per_piece_kg": str(obj.raw_material.weight_per_piece_kg) if obj.raw_material.weight_per_piece_kg else None,
                "capacity_kg": str(obj.raw_material.capacity_kg) if obj.raw_material.capacity_kg is not None else None,
                "bottles_per_carton": obj.raw_material.bottles_per_carton,
                "bottles_per_plastic": obj.raw_material.bottles_per_plastic,
            }
        return None

    def validate(self, attrs):
        attrs = super().validate(attrs)

        purchase = attrs.get('purchase') or (self.instance.purchase if self.instance else None)
        if purchase and purchase.is_free:
            attrs['price_per_unit'] = Decimal('0')
        elif purchase and Decimal(str(attrs.get('price_per_unit', getattr(self.instance, 'price_per_unit', 0)))) <= 0:
            raise serializers.ValidationError({'price_per_unit': 'Enter a positive price for paid purchases.'})
        quantity = attrs.get('quantity')
        price_per_unit = attrs.get('price_per_unit')
        raw_material = attrs.get('raw_material')
        if raw_material is None and self.instance is not None:
            raw_material = self.instance.raw_material

        piece_count = attrs.get('piece_count')
        if piece_count is None and self.instance is not None:
            piece_count = self.instance.piece_count
        if raw_material and raw_material.unit == RawMaterial.UNIT_PIECE and piece_count:
            raise serializers.ValidationError({
                'piece_count': 'Additional piece count is only available for kilogram-based materials.'
            })

        if quantity is not None and price_per_unit is not None:
            attrs['total_price'] = quantity * price_per_unit

        return attrs


class RawMaterialPurchaseSerializer(BaseCurrencySerializerMixin, DataRootSerializer):
    """Serializer for RawMaterialPurchase model."""

    base_currency_amount_fields = ('total_amount',)
    base_currency_date_field = 'purchase_date'

    currency = serializers.ChoiceField(choices=CURRENCY_CHOICES)
    vendor_details = serializers.SerializerMethodField()
    currency_details = serializers.SerializerMethodField()
    items = RawMaterialPurchaseItemSerializer(many=True, read_only=True)
    subtotal_amount = serializers.SerializerMethodField()
    final_total = serializers.SerializerMethodField()
    remaining_amount = serializers.SerializerMethodField()

    class Meta:
        model = RawMaterialPurchase
        fields = "__all__"
        read_only_fields = (
            'invoice_number', 'exchange_rate', 'total_amount_base',
            'paid_amount_base',
            'subtotal_amount', 'final_total', 'remaining_amount',
        )

    def validate(self, attrs):
        attrs = super().validate(attrs)

        if attrs.get('transaction_type', getattr(self.instance, 'transaction_type', 'paid')) == 'free':
            if (self.instance and Decimal(str(self.instance.paid_amount or 0)) > 0) or Decimal(str(attrs.get('paid_amount', 0) or 0)) > 0:
                raise serializers.ValidationError({'transaction_type': 'Reverse bill payments before changing this purchase to free.'})
            attrs.update(total_amount=Decimal('0'), paid_amount=Decimal('0'))
        for field in ('total_amount', 'paid_amount'):
            if field in attrs and attrs[field] is not None:
                attrs[field] = quantize_order_amount(attrs[field])

        if self.instance and self.instance.status == 'received':
            currency = attrs.get('currency', self.instance.currency)
            purchase_date = attrs.get(
                'purchase_date', self.instance.purchase_date)
            if (
                int(currency) == self.instance.currency
                and purchase_date.date() == self.instance.purchase_date.date()
            ):
                attrs['exchange_rate'] = self.instance.exchange_rate
                amount = attrs.get('total_amount', self.instance.total_amount)
                attrs['total_amount_base'] = quantize_order_amount(
                    amount * self.instance.exchange_rate
                )

        vendor = attrs.get('vendor')
        if vendor is None and self.instance is not None:
            vendor = self.instance.vendor
        if vendor is None:
            raise serializers.ValidationError(
                {'vendor': 'Vendor is required.'})

        return attrs

    def get_vendor_details(self, obj):
        if obj.vendor:
            return {
                "id": obj.vendor.id,
                "name": obj.vendor.name,
                "phone": obj.vendor.phone,
                "email": obj.vendor.email,
                "address": obj.vendor.address,
            }
        return None

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)

    def get_subtotal_amount(self, obj):
        return float(obj.subtotal_amount)

    def get_final_total(self, obj):
        return float(obj.final_total)

    def get_remaining_amount(self, obj):
        total = float(obj.final_total if hasattr(
            obj, 'final_total') else (obj.total_amount or 0))
        paid = float(obj.paid_amount or 0)
        return max(0.0, total - paid)


class RawMaterialPurchaseListSerializer(RawMaterialPurchaseSerializer):
    """Lightweight list serializer for raw material purchases."""
    class Meta(RawMaterialPurchaseSerializer.Meta):
        fields = (
            'transaction_type',
            'id',
            'invoice_number',
            'bill_number',
            'purchase_date',
            'status',
            'vendor',
            'vendor_details',
            'currency',
            'currency_details',
            'total_amount',
            'total_amount_base',
            'exchange_rate',
            'paid_amount',
            'final_total',
            'remaining_amount',
            'notes',
        )


class RawMaterialStockSerializer(CostCurrencyMixin, DataRootSerializer):
    cost_aliases = {"last_purchase_price_afn": "last_purchase_price"}
    """Serializer for RawMaterialStock model."""
    raw_material_details = serializers.SerializerMethodField()
    average_unit_cost_afn = serializers.DecimalField(source="last_purchase_price", max_digits=18, decimal_places=6, read_only=True)
    cost_layers = serializers.SerializerMethodField()
    price_is_sample = serializers.SerializerMethodField()

    def get_price_is_sample(self, obj):
        return '[TEST DATA: SAMPLE PRICE]' in (obj.raw_material.description or '')

    class Meta:
        model = RawMaterialStock
        fields = "__all__"
        read_only_fields = ['last_purchase_price', 'last_purchase_date', 'zero_cost_allowed']

    def get_raw_material_details(self, obj):
        if obj.raw_material:
            return {
                "id": obj.raw_material.id,
                "name": obj.raw_material.name,
                "unit": obj.raw_material.unit,
                "material_type": obj.raw_material.material_type,
                "category": obj.raw_material.category_id,
                "category_name": obj.raw_material.category.name if obj.raw_material.category_id else None,
                "capacity_liters": str(obj.raw_material.capacity_liters) if obj.raw_material.capacity_liters is not None else None,
                "capacity_display_unit": obj.raw_material.capacity_display_unit,
                "weight_per_piece_kg": str(obj.raw_material.weight_per_piece_kg) if obj.raw_material.weight_per_piece_kg else None,
                "capacity_kg": str(obj.raw_material.capacity_kg) if obj.raw_material.capacity_kg is not None else None,
                "bottles_per_carton": obj.raw_material.bottles_per_carton,
                "bottles_per_plastic": obj.raw_material.bottles_per_plastic,
            }
        return None

    def get_cost_layers(self, obj):
        items = getattr(obj.raw_material, 'received_purchase_items', None)
        if items is None:
            items = RawMaterialPurchaseItem.objects.filter(
                raw_material=obj.raw_material,
                purchase__status='received',
                purchase__deleted_at__isnull=True,
                quantity__gt=0,
            ).select_related('purchase').order_by(
                'purchase__purchase_date', 'id'
            )

        return [
            {
                'id': item.id,
                'purchase_id': item.purchase_id,
                'invoice_number': item.purchase.invoice_number,
                'bill_number': item.purchase.bill_number or '',
                'purchase_date': item.purchase.purchase_date,
                'currency': item.purchase.currency,
                'currency_details': _currency_details_fn(item.purchase.currency),
                'quantity': item.quantity,
                'piece_count': item.piece_count,
                'price_per_unit': item.price_per_unit,
                'total_price': item.total_price,
                'price_per_unit_base': item.price_per_unit_base,
                'total_price_base': item.total_price_base,
            }
            for item in items
        ]


class RawMaterialStockUpdateSerializer(DataRootSerializer):
    """Serializer for updating raw material stock."""
    quantity_change = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=True,
        help_text='Amount to add (positive) or subtract (negative) from stock'
    )
    price_per_unit = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
        required=False,
        help_text=(
            'New unit price in AFN (optional). Raw material stock always stores '
            'last_purchase_price in AFN — convert foreign-currency prices before sending.'
        ),
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = RawMaterialStock
        fields = ['quantity_change', 'price_per_unit', 'notes']

    def validate_quantity_change(self, value):
        if value == 0:
            raise serializers.ValidationError(
                'Quantity change cannot be zero.')
        return value


class RawMaterialStockDirectSerializer(DataRootSerializer):
    """Serializer for directly creating or editing a stock entry (not purchase-linked)."""
    raw_material_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = RawMaterialStock
        fields = [
            'id', 'raw_material', 'raw_material_details',
            'quantity', 'piece_count',
            'last_purchase_price', 'last_purchase_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_raw_material_details(self, obj):
        if obj.raw_material:
            return {
                'id': obj.raw_material.id,
                'name': obj.raw_material.name,
                'unit': obj.raw_material.unit,
                'material_type': obj.raw_material.material_type,
                'category_name': obj.raw_material.category.name if obj.raw_material.category_id else None,
            }
        return None

    def validate_quantity(self, value):
        from decimal import Decimal
        if value is not None and Decimal(str(value)) < 0:
            raise serializers.ValidationError('Quantity cannot be negative.')
        return value

    def validate_last_purchase_price(self, value):
        from decimal import Decimal
        if value is not None and Decimal(str(value)) < 0:
            raise serializers.ValidationError('Price cannot be negative.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        raw_material = attrs.get('raw_material', getattr(self.instance, 'raw_material', None))
        if raw_material is None:
            raise serializers.ValidationError({'raw_material': 'Raw material is required.'})
        quantity = attrs.get('quantity', getattr(self.instance, 'quantity', Decimal('0')))
        pieces = attrs.get('piece_count', getattr(self.instance, 'piece_count', 0))
        price = attrs.get('last_purchase_price', getattr(self.instance, 'last_purchase_price', Decimal('0')))
        if (quantity > 0 or pieces > 0) and price <= 0:
            raise serializers.ValidationError({
                'last_purchase_price': 'Enter the actual positive AFN cost per material unit for stock on hand.',
            })
        if self.instance is not None and RawMaterialPurchaseItem.objects.filter(
            raw_material=raw_material, purchase__status='received', purchase__deleted_at__isnull=True,
        ).exists():
            changed = any(key in attrs and attrs[key] != getattr(self.instance, key) for key in (
                'raw_material', 'quantity', 'piece_count', 'last_purchase_price', 'last_purchase_date',
            ))
            if changed:
                raise serializers.ValidationError({'detail': 'This stock is linked to received purchases. Edit the original purchase to correct its quantity or price; the weighted average price is recalculated automatically.'})
        # On create: ensure no duplicate stock entry
        if self.instance is None:
            if RawMaterialStock.objects.filter(raw_material=raw_material).exists():
                raise serializers.ValidationError(
                    {'raw_material': 'A stock entry for this raw material already exists. Edit the existing one.'}
                )
        return attrs
