from decimal import Decimal
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from api.models.data.currency import CURRENCY_CHOICES, currency_details as _currency_details_fn
from api.models.data.payment import GeneralPayment, Payment
from api.serializers.data.base import DataRootSerializer
from api.mixins.base_currency import BaseCurrencySerializerMixin


class PaymentSerializer(BaseCurrencySerializerMixin, DataRootSerializer):
    base_currency_amount_fields = ('amount',)
    base_currency_date_field = 'payment_date'

    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.01'))
    currency = serializers.ChoiceField(choices=CURRENCY_CHOICES)
    currency_details = serializers.SerializerMethodField()
    related_object_details = serializers.SerializerMethodField()
    vendor_goods_source = serializers.SerializerMethodField()
    intermediary_vendor_details = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = "__all__"
        read_only_fields = ('exchange_rate', 'amount_base', 'general_payment', 'is_advance', 'is_credit_application',)

    def get_vendor_goods_source(self, obj):
        receipt = obj.general_payment
        if receipt and receipt.source_sale_id:
            return {'id': receipt.source_sale_id, 'invoice_number': receipt.source_sale.invoice_number, 'operation': receipt.source_sale.vendor_transaction}
        return None

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)

    def get_related_object_details(self, obj):
        if not obj.content_object:
            return None
        content_type = obj.content_type.model
        if content_type == 'generalpayment':
            receipt = obj.content_object
            return {'type': receipt.payment_type, 'id': None, 'invoice_number': str(receipt),
                    'customer_name': receipt.customer.name if receipt.customer_id else None,
                    'vendor_name': receipt.vendor.name if receipt.vendor_id else None}
        if content_type == 'sales':
            sale = obj.content_object
            customer_name = sale.customer.name if sale.customer else None
            return {
                "type": "sale",
                "id": obj.object_id,
                "invoice_number": sale.invoice_number,
                "customer_name": customer_name,
                "vendor_name": None,
            }
        if content_type == 'rawmaterialpurchase':
            purchase = obj.content_object
            vendor_name = purchase.vendor.name if purchase.vendor else None
            return {
                "type": "purchase",
                "id": obj.object_id,
                "invoice_number": purchase.invoice_number,
                "customer_name": None,
                "vendor_name": vendor_name,
            }
        if content_type == 'purchase':
            # Legacy finished-goods purchase payments (model removed).
            return {
                "type": "purchase",
                "id": obj.object_id,
                "invoice_number": None,
                "customer_name": None,
                "vendor_name": None,
            }
        return None

    def get_intermediary_vendor_details(self, obj):
        vendor = getattr(obj, 'intermediary_vendor', None)
        if not vendor:
            return None
        return {
            'id': vendor.id,
            'name': vendor.name,
            'phone': vendor.phone,
            'email': vendor.email,
        }

    def validate(self, attrs):
        try:
            attrs = super().validate(attrs)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'currency': exc.messages}) from exc
        method = attrs.get('payment_method', getattr(self.instance, 'payment_method', None))
        payment_type = attrs.get('payment_type', getattr(self.instance, 'payment_type', None))
        intermediary_vendor = attrs.get(
            'intermediary_vendor',
            getattr(self.instance, 'intermediary_vendor', None),
        )

        if method == 'intermediary_credit':
            if self.instance is None:
                raise serializers.ValidationError(
                    {'payment_method': 'Use third-party settlements instead of intermediary credit.'}
                )
            if payment_type != 'purchase':
                raise serializers.ValidationError(
                    {'payment_method': 'Intermediary credit is only supported for purchase payments.'}
                )
            if intermediary_vendor is None:
                raise serializers.ValidationError(
                    {'intermediary_vendor': 'Select the intermediary vendor (sarafi/bank).'}
                )
        return attrs

    def get_documents(self, obj):
        from api.services.attachments import serialize_document

        docs = getattr(obj, 'documents', None)
        if docs is None:
            return []
        request = self.context.get('request')
        return [serialize_document(doc, request) for doc in docs.all()]


class GeneralPaymentSerializer(BaseCurrencySerializerMixin, DataRootSerializer):
    base_currency_amount_fields = ('amount',)
    base_currency_date_field = 'payment_date'
    amount = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=Decimal('0.01'))
    allocations = serializers.SerializerMethodField()
    available_credit = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    party_name = serializers.SerializerMethodField()
    currency_details = serializers.SerializerMethodField()

    class Meta:
        model = GeneralPayment
        exclude = ('deleted_at', 'deleted_by')
        read_only_fields = ('source_sale', 'amount_base', 'exchange_rate', 'created_at', 'updated_at')

    def get_allocations(self, obj):
        return PaymentSerializer([p for p in obj.allocations.all() if not p.is_advance], many=True, context=self.context).data

    def get_party_name(self, obj):
        party = obj.customer if obj.payment_type == 'sale' else obj.vendor
        return party.name if party else ''

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)

    def validate(self, attrs):
        try:
            attrs = super().validate(attrs)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'currency': exc.messages}) from exc
        kind = attrs.get('payment_type', getattr(self.instance, 'payment_type', None))
        customer = attrs.get('customer', getattr(self.instance, 'customer', None))
        vendor = attrs.get('vendor', getattr(self.instance, 'vendor', None))
        if (kind == 'sale' and (customer is None or vendor is not None)) or (kind == 'purchase' and (vendor is None or customer is not None)):
            raise serializers.ValidationError({'customer' if kind == 'sale' else 'vendor': 'Select exactly one customer for sales or one vendor for purchases.'})
        return attrs

    def create(self, validated_data):
        from api.services.general_payments import save_general_payment
        return save_general_payment(validated_data)

    def update(self, instance, validated_data):
        from api.services.general_payments import save_general_payment
        return save_general_payment(validated_data, instance)
