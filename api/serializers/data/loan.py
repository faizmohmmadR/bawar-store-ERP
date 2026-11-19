from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from api.models.data.currency import CURRENCY_CHOICES, currency_details as _currency_details_fn
from api.models.data.customers import Customer
from api.models.data.loan import Loan, LoanPayment
from api.models.data.vendors import Vendor
from api.serializers.data.base import DataRootSerializer
from api.mixins.base_currency import BaseCurrencySerializerMixin




class LoanPaymentSerializer(DataRootSerializer):
    loaner_name = serializers.CharField(source='loan.get_loaner_name', read_only=True)
    currency_details = serializers.SerializerMethodField()
    loan_type = serializers.CharField(source='loan.loan_type', read_only=True)

    class Meta:
        model = LoanPayment
        fields = '__all__'
        read_only_fields = ('amount_base', 'exchange_rate', 'deleted_at', 'deleted_by')

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.loan.currency)

    def validate(self, attrs):
        loan = attrs.get('loan', getattr(self.instance, 'loan', None))
        if self.instance and loan.pk != self.instance.loan_id:
            raise serializers.ValidationError({'loan': 'A payment cannot be moved to another loan.'})
        amount = attrs.get('amount', getattr(self.instance, 'amount', Decimal('0')))
        self._check_balance(loan, amount)
        return attrs

    def _check_balance(self, loan, amount):
        if amount <= 0:
            raise serializers.ValidationError({'amount': 'Payment amount must be greater than zero.'})
        payments = loan.payments.all()
        if self.instance:
            payments = payments.exclude(pk=self.instance.pk)
        paid = payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        remaining = loan.amount - paid
        if amount > remaining:
            raise serializers.ValidationError({'amount': f'Payment cannot exceed remaining balance ({remaining}).'})

    @transaction.atomic
    def create(self, validated_data):
        loan = Loan.objects.select_for_update().get(pk=validated_data['loan'].pk)
        self._check_balance(loan, validated_data['amount'])
        validated_data['loan'] = loan
        validated_data.setdefault('payment_method', loan.payment_method)
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        loan = Loan.objects.select_for_update().get(pk=instance.loan_id)
        self._check_balance(loan, validated_data.get('amount', instance.amount))
        instance.loan = loan
        return super().update(instance, validated_data)


class LoanSerializer(BaseCurrencySerializerMixin, DataRootSerializer):
    base_currency_amount_fields = ('amount',)
    base_currency_date_field = 'loan_date'

    currency = serializers.IntegerField()
    customer_details = serializers.SerializerMethodField()
    vendor_details = serializers.SerializerMethodField()
    loaner_name = serializers.CharField(source='get_loaner_name', read_only=True)
    currency_details = serializers.SerializerMethodField()
    loan_type_display = serializers.CharField(source='get_loan_type_display', read_only=True)
    loaner_type_display = serializers.CharField(source='get_loaner_type_display', read_only=True)
    balance_due = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    payments = LoanPaymentSerializer(many=True, read_only=True)
    loan_scenario = serializers.SerializerMethodField()
    amount_paid = serializers.DecimalField(
        max_digits=15,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = Loan
        fields = '__all__'
        read_only_fields = ('is_paid', 'amount_base', 'amount_paid_base', 'exchange_rate', 'source_payment', 'deleted_at', 'deleted_by')

    def get_customer_details(self, obj):
        if obj.customer:
            return {
                'id': obj.customer.id,
                'name': obj.customer.name,
                'phone': obj.customer.phone,
                'email': obj.customer.email,
            }
        return None

    def get_vendor_details(self, obj):
        if obj.vendor:
            return {
                'id': obj.vendor.id,
                'name': obj.vendor.name,
                'phone': obj.vendor.phone,
                'email': obj.vendor.email,
            }
        return None

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)

    def get_loan_scenario(self, obj):
        if obj.loaner_type == 'customer' and obj.loan_type == 'loan_out':
            return 'customer_receivable'
        if obj.loaner_type == 'customer' and obj.loan_type == 'loan_in':
            return 'customer_payable'
        if obj.loaner_type == 'vendor' and obj.loan_type == 'loan_out':
            return 'vendor_receivable'
        if obj.loaner_type == 'vendor' and obj.loan_type == 'loan_in':
            return 'vendor_payable'
        return None

    def validate(self, data):
        loaner_type = data.get('loaner_type', getattr(self.instance, 'loaner_type', 'customer'))
        customer = data.get('customer', getattr(self.instance, 'customer', None))
        vendor = data.get('vendor', getattr(self.instance, 'vendor', None))

        if loaner_type == 'customer':
            if not customer:
                raise serializers.ValidationError({'customer': 'Customer is required for customer loans'})
            data['vendor'] = None
        elif loaner_type == 'vendor':
            if not vendor:
                raise serializers.ValidationError({'vendor': 'Vendor is required for vendor loans'})
            data['customer'] = None



        amount = data.get('amount', getattr(self.instance, 'amount', Decimal('0')))
        if amount <= 0:
            raise serializers.ValidationError({'amount': 'Loan amount must be greater than zero.'})
        if self.instance and self.instance.payments.exists():
            if amount < self.instance.amount_paid:
                raise serializers.ValidationError({'amount': 'Loan amount cannot be less than repayments already recorded.'})
            for field in ('currency', 'loan_type', 'loaner_type', 'customer', 'vendor'):
                if field in data and data[field] != getattr(self.instance, field):
                    raise serializers.ValidationError({field: 'Cannot change this field after repayments exist.'})

        if self.instance is None:
            data['amount_paid'] = Decimal('0')

        if self.instance is not None and 'is_opening_balance' in data:
            if data['is_opening_balance'] != self.instance.is_opening_balance:
                if self.instance.payments.exists():
                    raise serializers.ValidationError({
                        'is_opening_balance': 'Cannot change opening balance flag after payments exist.',
                    })

        return super().validate(data)
