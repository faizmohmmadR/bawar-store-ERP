from decimal import Decimal

from rest_framework import serializers
from api.models.data.currency import currency_details as _currency_details_fn, get_currency as _get_currency
from api.models.data.sales import Sales, SalesItems
from api.serializers.data.base import DataRootSerializer
from api.mixins.base_currency import BaseCurrencySerializerMixin
from api.utils.order_numeric import quantize_order_amount


def _currency_code(currency_id):
    c = _get_currency(currency_id)
    return c['code'] if c else str(currency_id or '')


def sales_item_commission_total(item) -> Decimal:
    """Line commission in AFN = quantity (selected unit) × commission per unit.

    Commission is always AFN and must never be FX-converted with the sale currency.
    """
    qty = Decimal(str(getattr(item, 'quantity', 0) or 0))
    rate = Decimal(str(getattr(item, 'commission_amount', 0) or 0))
    return quantize_order_amount(qty * rate)


class SalesItemsSerializer(DataRootSerializer):
    sell_price = serializers.DecimalField(max_digits=15, decimal_places=4, required=False, default=Decimal('0'))
    product_details = serializers.SerializerMethodField()
    stock_details = serializers.SerializerMethodField()
    storage_tank_details = serializers.SerializerMethodField()
    raw_material_stock_details = serializers.SerializerMethodField()
    commission_total = serializers.SerializerMethodField()

    class Meta:
        model = SalesItems
        fields = "__all__"
        read_only_fields = ("cost_is_known",)

    def get_commission_total(self, obj):
        return float(sales_item_commission_total(obj))

    def get_product_details(self, obj):
        if obj.sale_source == SalesItems.SOURCE_TANK and obj.storage_tank_id:
            from api.services.tank_inventory import tank_product_label
            return {
                'id': None,
                'name': tank_product_label(obj.storage_tank),
                'is_tank_fill': True,
            }
        if obj.sale_source == SalesItems.SOURCE_RAW_MATERIAL and obj.raw_material_stock_id:
            material = obj.raw_material_stock.raw_material
            return {
                'id': material.id,
                'name': material.name,
                'is_raw_material': True,
                'material_type': material.material_type,
                'unit': material.unit,
            }
        if obj.stock and obj.stock.product:
            from api.serializers.data.products import serialize_product
            return serialize_product(obj.stock.product, self.context.get('request'))
        return None

    def get_raw_material_stock_details(self, obj):
        if not obj.raw_material_stock_id:
            return None
        stock = obj.raw_material_stock
        material = stock.raw_material
        return {
            'id': stock.id,
            'raw_material': material.id,
            'name': material.name,
            'material_type': material.material_type,
            'unit': material.unit,
            'quantity': str(stock.quantity),
            'piece_count': stock.piece_count,
            'weight_per_piece_kg': str(material.weight_per_piece_kg) if material.weight_per_piece_kg else None,
            'last_purchase_price': str(stock.last_purchase_price),
        }

    def get_stock_details(self, obj):
        if not obj.stock_id:
            return None
        from api.utils.packaging import (
            bottles_per_carton,
            cartons_from_pieces,
            price_per_carton_from_piece,
            remainder_pieces,
        )
        from api.serializers.data.products import serialize_product

        pieces = obj.stock.piece_amount or 0
        piece_price = obj.stock.buy_price or 0
        carton_size = bottles_per_carton(obj.stock.product)
        return {
            "id": obj.stock.id,
            "product_details": serialize_product(obj.stock.product, self.context.get('request')),
            "piece_amount": pieces,
            "bottles_per_carton": int(carton_size),
            "carton_amount": float(cartons_from_pieces(pieces, carton_size)),
            "loose_pieces": float(remainder_pieces(pieces, carton_size)),
            "buy_price": piece_price,
            "buy_price_per_carton": float(price_per_carton_from_piece(piece_price, carton_size)),
            "condition": getattr(obj.stock, 'condition', 'good'),
            "currency": obj.stock.currency,
            "currency_code": _currency_code(obj.stock.currency),
        }

    def get_storage_tank_details(self, obj):
        if not obj.storage_tank_id:
            return None
        from api.services.tank_inventory import (
            get_tank_density,
            get_tank_liquid_totals,
            tank_product_label,
        )

        tank = obj.storage_tank
        current_liters, _, cost_per_liter = get_tank_liquid_totals(
            tank,
            exclude_sale_item_id=obj.pk,
        )
        density = get_tank_density(tank, exclude_sale_item_id=obj.pk)
        return {
            'id': tank.id,
            'name': tank.name,
            'product_name': tank_product_label(tank),
            'current_liters': str(current_liters),
            'density_kg_per_liter': str(density),
            'current_kg': str(current_liters * density),
            'liquid_cost_per_liter_afn': str(cost_per_liter),
            'capacity_liters': str(tank.capacity_liters),
        }

    def validate(self, attrs):
        from api.services.tank_inventory import get_tank_density
        from api.utils.packaging import (
            bottles_per_carton,
            kilograms_from_pieces,
            pieces_from_kilograms,
            pieces_from_units,
        )

        attrs = super().validate(attrs)
        parent = attrs.get('sales', getattr(self.instance, 'sales', None))
        if parent and parent.vendor_id and attrs.get('sale_source', getattr(self.instance, 'sale_source', 'stock')) != 'raw_material':
            raise serializers.ValidationError({'sale_source': 'Vendor transactions must use raw-material stock.'})

        sale = attrs.get('sales') or (self.instance.sales if self.instance else None)
        if sale and sale.is_free:
            attrs['sell_price'] = Decimal('0')
            attrs['commission_amount'] = Decimal('0')
        elif sale and Decimal(str(attrs.get('sell_price', getattr(self.instance, 'sell_price', 0)))) <= 0:
            raise serializers.ValidationError({'sell_price': 'Enter a positive price for paid sales.'})
        source = attrs.get('sale_source')
        if source is None and self.instance is not None:
            source = self.instance.sale_source
        source = source or SalesItems.SOURCE_STOCK

        unit = attrs.get('unit')
        quantity = attrs.get('quantity')
        stock = attrs.get('stock', serializers.empty)
        tank = attrs.get('storage_tank', serializers.empty)
        rm_stock = attrs.get('raw_material_stock', serializers.empty)
        piece_count = attrs.get('piece_count', serializers.empty)
        if self.instance:
            if unit is None:
                unit = self.instance.unit
            if quantity is None:
                quantity = self.instance.quantity
            if stock is serializers.empty:
                stock = self.instance.stock
            if tank is serializers.empty:
                tank = self.instance.storage_tank
            if rm_stock is serializers.empty:
                rm_stock = self.instance.raw_material_stock
            if piece_count is serializers.empty:
                piece_count = self.instance.piece_count
        else:
            if stock is serializers.empty:
                stock = None
            if tank is serializers.empty:
                tank = None
            if rm_stock is serializers.empty:
                rm_stock = None
            if piece_count is serializers.empty:
                piece_count = 0

        attrs['sale_source'] = source

        if source == SalesItems.SOURCE_TANK:
            if tank is None:
                raise serializers.ValidationError({
                    'storage_tank': 'Select a storage tank for tank-fill sales.',
                })
            attrs['stock'] = None
            attrs['raw_material_stock'] = None
            attrs['piece_count'] = 0
            unit = unit or SalesItems.UNIT_KG
            if unit not in {SalesItems.UNIT_LITER, SalesItems.UNIT_KG}:
                raise serializers.ValidationError({
                    'unit': 'Tank sales use liter or kilogram units.',
                })
            attrs['unit'] = unit
            if quantity is not None:
                attrs['quantity'] = quantize_order_amount(quantity)
                density = get_tank_density(
                    tank,
                    exclude_sale_item_id=self.instance.pk if self.instance else None,
                )
                if unit == SalesItems.UNIT_KG and density <= 0:
                    raise serializers.ValidationError({
                        'storage_tank': 'Set a product density before selling tank liquid by weight.',
                    })
                liters = (
                    attrs['quantity'] / density
                    if unit == SalesItems.UNIT_KG
                    else attrs['quantity']
                )
                attrs['liter_amount'] = quantize_order_amount(liters)
                attrs['kilogram_amount'] = quantize_order_amount(
                    attrs['quantity'] if unit == SalesItems.UNIT_KG
                    else liters * density
                )
        elif source == SalesItems.SOURCE_RAW_MATERIAL:
            from api.models.data.raw_materials import RawMaterial

            if rm_stock is None:
                raise serializers.ValidationError({
                    'raw_material_stock': 'Select a raw material for this sale line.',
                })
            attrs['stock'] = None
            attrs['storage_tank'] = None
            material = rm_stock.raw_material
            from api.services.raw_material_sales import resolve_raw_sale_quantities
            if self.instance is None and 'unit' not in self.initial_data:
                unit = material.unit
            unit = unit or material.unit
            quantity = quantity if quantity is not None else getattr(self.instance, 'quantity', 0)
            if self.instance and 'piece_count' not in self.initial_data and material.unit == 'piece' and unit == 'kg':
                piece_count = int(self.instance.liter_amount or 0)
            native_quantity, stock_pieces = resolve_raw_sale_quantities(rm_stock, unit, quantity, piece_count, self.instance)
            attrs['unit'] = unit
            attrs['quantity'] = quantize_order_amount(quantity)
            attrs['piece_count'] = stock_pieces
            attrs['kilogram_amount'] = quantize_order_amount(native_quantity if material.unit == 'kg' else quantity if unit == 'kg' else 0)
            attrs['liter_amount'] = quantize_order_amount(native_quantity if material.unit == 'piece' else quantity if unit == 'piece' else stock_pieces)

        else:
            if stock is None:
                raise serializers.ValidationError({
                    'stock': 'Select packed stock for this sale line.',
                })
            attrs['storage_tank'] = None
            attrs['raw_material_stock'] = None
            attrs['piece_count'] = 0
            if unit == SalesItems.UNIT_LITER:
                raise serializers.ValidationError({
                    'unit': 'Packed stock sales use carton, bottle, or plastic units.',
                })
            # Normalize legacy dana → bottle
            if unit == SalesItems.UNIT_DANA:
                unit = SalesItems.UNIT_BOTTLE
            material_unit = {
                'bottle': 'bottle', 'bottle_with_cap': 'bottle',
                'carton': 'carton', 'plastic': 'plastic',
            }.get(stock.product.stock_kind)
            unit = unit or material_unit or SalesItems.UNIT_CARTON
            if material_unit:
                if unit == 'piece':
                    unit = material_unit
                allowed = {material_unit, 'kg'} if material_unit == 'bottle' else {material_unit}
                if unit not in allowed:
                    raise serializers.ValidationError({'unit': f'This stock is counted in {material_unit} units. Select its matching sale unit.'})
            if unit not in {
                SalesItems.UNIT_CARTON,
                SalesItems.UNIT_BOTTLE,
                SalesItems.UNIT_PLASTIC,
                SalesItems.UNIT_DANA,
                SalesItems.UNIT_KG,
            }:
                raise serializers.ValidationError({
                    'unit': 'Packed stock sales use carton, bottle, or plastic.',
                })
            attrs['unit'] = unit
            if quantity is not None:
                carton_size = Decimal('1') if material_unit else bottles_per_carton(stock.product)
                attrs['quantity'] = quantize_order_amount(quantity)
                if unit == SalesItems.UNIT_KG:
                    pieces = pieces_from_kilograms(attrs['quantity'], stock.product)
                    if pieces <= 0:
                        raise serializers.ValidationError({
                            'unit': 'This product needs bottle capacity and density to be sold by kilograms.',
                        })
                    attrs['liter_amount'] = quantize_order_amount(pieces)
                    attrs['kilogram_amount'] = attrs['quantity']
                else:
                    pieces = pieces_from_units(attrs['quantity'], unit, carton_size)
                    attrs['liter_amount'] = quantize_order_amount(pieces)
                    attrs['kilogram_amount'] = quantize_order_amount(
                        kilograms_from_pieces(pieces, stock.product)
                    )

        if source == SalesItems.SOURCE_STOCK and stock and stock.product.is_piece_stock:
            if stock.product.stock_kind == 'bottle':
                pieces = Decimal(str(attrs.get('liter_amount', getattr(self.instance, 'liter_amount', 0))))
                if pieces != pieces.to_integral_value():
                    raise serializers.ValidationError({'quantity': 'Filled bottles must be sold in whole bottles.'})

        for field in ('liter_amount', 'sell_price', 'unit_cost', 'quantity', 'commission_amount'):
            if field in attrs and attrs[field] is not None:
                attrs[field] = quantize_order_amount(attrs[field])

        commission = attrs.get('commission_amount')
        if commission is None and self.instance is not None:
            commission = self.instance.commission_amount
        if commission is not None and commission < 0:
            raise serializers.ValidationError({
                'commission_amount': 'Commission cannot be negative.',
            })

        return attrs


class SalesSerializer(BaseCurrencySerializerMixin, DataRootSerializer):
    total_amount = serializers.DecimalField(max_digits=15, decimal_places=4, required=False, default=Decimal('0'))
    base_currency_amount_fields = ('total_amount', 'paid_amount')
    base_currency_date_field = 'sale_date'

    currency = serializers.IntegerField()
    vendor_details = serializers.SerializerMethodField()
    vendor_credit = serializers.SerializerMethodField()
    customer_details = serializers.SerializerMethodField()
    employee_details = serializers.SerializerMethodField()
    salesman_details = serializers.SerializerMethodField()
    currency_details = serializers.SerializerMethodField()
    salary_settlement_id = serializers.SerializerMethodField()
    items = SalesItemsSerializer(many=True, read_only=True, source='sales_items')
    subtotal_amount = serializers.SerializerMethodField()
    discount_amount = serializers.SerializerMethodField()
    final_total = serializers.SerializerMethodField()
    remaining_amount = serializers.SerializerMethodField()
    total_commission = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()

    class Meta:
        model = Sales
        fields = "__all__"
        read_only_fields = (
            'exchange_rate', 'total_amount_base', 'paid_amount_base',
        )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        is_free = attrs.get('transaction_type', getattr(self.instance, 'transaction_type', 'paid')) == 'free'
        if is_free:
            if self.instance and Decimal(str(self.instance.paid_amount or 0)) > 0:
                raise serializers.ValidationError({'transaction_type': 'Reverse linked payments before changing this invoice to free.'})
            if Decimal(str(attrs.get('paid_amount', 0) or 0)) > 0:
                raise serializers.ValidationError({'paid_amount': 'Free sales cannot receive bill payments.'})
            attrs.update(total_amount=Decimal('0'), paid_amount=Decimal('0'), discount_percentage=Decimal('0'), salesman=None)
        for field in ('total_amount', 'paid_amount'):
            if field in attrs and attrs[field] is not None:
                attrs[field] = quantize_order_amount(attrs[field])

        customer = attrs.get('customer', getattr(self.instance, 'customer', None))
        vendor = attrs.get('vendor', getattr(self.instance, 'vendor', None))
        employee = attrs.get('employee', getattr(self.instance, 'employee', None))
        party_count = sum(1 for party in (customer, vendor, employee) if party)
        if party_count != 1:
            raise serializers.ValidationError({
                'customer': 'Select exactly one of customer, vendor, or employee.',
            })
        vendor_transaction = attrs.get('vendor_transaction', getattr(self.instance, 'vendor_transaction', 'sale'))
        if vendor_transaction == 'purchase_return' and (not vendor or is_free):
            raise serializers.ValidationError({'vendor_transaction': 'Purchase returns require a vendor and a paid transaction.'})
        if vendor:
            if Decimal(str(attrs.get('paid_amount', getattr(self.instance, 'paid_amount', 0)) or 0)) > 0:
                raise serializers.ValidationError({'paid_amount': 'Vendor transactions settle supplier balances; do not enter a cash receipt.'})
            attrs['salesman'] = None
        if employee:
            attrs['salesman'] = None
            if is_free:
                raise serializers.ValidationError({
                    'transaction_type': 'Employee product sales must be paid — free sales cannot settle salary.',
                })
            # Cash receipts are not allowed — settlement service marks the sale paid.
            attrs['paid_amount'] = Decimal('0')
        if self.instance and (
            (self.instance.vendor_id or vendor)
            or (self.instance.employee_id or employee)
        ) and (
            customer != self.instance.customer
            or vendor != self.instance.vendor
            or employee != self.instance.employee
        ):
            raise serializers.ValidationError({
                'customer': 'The party cannot change. Cancel this document and create a new one.',
            })

        currency = attrs.get('currency')
        if currency is None and self.instance is not None:
            currency = self.instance.currency
        # Sales invoices are AFN (1) or USD (2) only — inventory costs are AFN.
        if currency is not None and int(currency) not in (1, 2):
            raise serializers.ValidationError({
                'currency': 'Sales currency must be AFN or USD.',
            })

        salesman = attrs.get('salesman', serializers.empty)
        if salesman is serializers.empty and self.instance is not None:
            salesman = self.instance.salesman
        if salesman is serializers.empty:
            salesman = None
        # Empty string / 0 from clients → null
        if salesman in ('', 0, '0'):
            attrs['salesman'] = None
            salesman = None

        return attrs

    def get_vendor_details(self, obj):
        if obj.vendor_id:
            return {'id': obj.vendor_id, 'name': obj.vendor.name, 'phone': obj.vendor.phone, 'email': obj.vendor.email, 'address': obj.vendor.address}
        return None

    def get_vendor_credit(self, obj):
        from api.models.data.payment import GeneralPayment
        receipt = GeneralPayment.objects.filter(source_sale=obj).first()
        if not receipt:
            return {'applied': 0, 'remaining': 0, 'allocations': []}
        return {'applied': float(receipt.amount - receipt.available_credit), 'remaining': float(receipt.available_credit),
                'allocations': [{'purchase_id': payment.object_id, 'amount': str(payment.amount), 'invoice_number': getattr(payment.content_object, 'invoice_number', '')}
                    for payment in receipt.allocations.filter(is_credit_application=True)]}

    def get_customer_details(self, obj):
        if obj.customer:
            return {
                "id": obj.customer.id,
                "name": obj.customer.name,
                "phone": obj.customer.phone,
                "email": obj.customer.email,
                "address": obj.customer.address,
            }
        return None

    def get_employee_details(self, obj):
        if obj.employee_id and obj.employee:
            return {
                'id': obj.employee.id,
                'full_name': obj.employee.full_name,
                'phone': obj.employee.phone,
                'salary_type': getattr(obj.employee, 'salary_type', None) or 'monthly',
            }
        return None

    def get_salary_settlement_id(self, obj):
        settlement = getattr(obj, 'salary_settlement', None)
        return settlement.id if settlement else None

    def get_salesman_details(self, obj):
        if obj.salesman_id and obj.salesman:
            return {
                "id": obj.salesman.id,
                "name": obj.salesman.name,
                "phone": obj.salesman.phone,
            }
        return None

    def get_total_commission(self, obj):
        """Sum of line commissions in AFN (independent of sale invoice currency)."""
        total = Decimal('0')
        for item in obj.sales_items.all():
            total += sales_item_commission_total(item)
        return float(total)

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)

    def get_subtotal_amount(self, obj):
        return float(obj.subtotal_amount)

    def get_discount_amount(self, obj):
        return float(obj.discount_amount)

    def get_final_total(self, obj):
        return float(obj.final_total)

    def get_remaining_amount(self, obj):
        if obj.vendor_id or obj.employee_id:
            return 0
        total = float(obj.final_total if hasattr(obj, 'final_total') else (obj.total_amount or 0))
        paid = float(obj.paid_amount or 0)
        return max(0.0, total - paid)

    def get_documents(self, obj):
        from api.services.attachments import serialize_document

        docs = getattr(obj, 'documents', None)
        if docs is None:
            return []
        request = self.context.get('request')
        return [serialize_document(doc, request) for doc in docs.all()]


class SalesListSerializer(SalesSerializer):
    """Lightweight list/picker payload — no line items."""

    class Meta(SalesSerializer.Meta):
        fields = (
            'transaction_type',
            'id',
            'id',
            'invoice_number',
            'bill_no',
            'sale_date',
            'status',
            'customer',
            'customer_details',
            'employee',
            'employee_details',
            'salary_settlement_id',
            'vendor', 'vendor_details', 'vendor_transaction', 'vendor_credit',
            'salesman',
            'salesman_details',
            'currency',
            'currency_details',
            'total_amount',
            'total_amount_base',
            'paid_amount',
            'paid_amount_base',
            'exchange_rate',
            'final_total',
            'remaining_amount',
            'total_commission',
            'discount_percentage',
            'notes',
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop('documents', None)
