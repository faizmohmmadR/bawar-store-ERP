from decimal import Decimal

from rest_framework import serializers

from api.models.data.currency import BASE_CURRENCY_ID, currency_details as _currency_details_fn
from api.models.data.salesman_commission_payment import SalesmanCommissionPayment
from api.serializers.data.base import DataRootSerializer
from api.services.salesman_commission import (
    salesman_commission_balance,
    salesman_commission_earned,
    salesman_commission_paid,
)


class SalesmanCommissionPaymentSerializer(DataRootSerializer):
    currency = serializers.IntegerField(required=False, default=BASE_CURRENCY_ID)
    currency_details = serializers.SerializerMethodField()
    salesman_details = serializers.SerializerMethodField()

    class Meta:
        model = SalesmanCommissionPayment
        fields = '__all__'
        read_only_fields = ('amount_base', 'exchange_rate', 'currency')

    def get_currency_details(self, obj):
        return _currency_details_fn(BASE_CURRENCY_ID)

    def get_salesman_details(self, obj):
        s = obj.salesman
        if not s:
            return None
        return {
            'id': s.id,
            'name': s.name,
            'phone': s.phone,
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        attrs['currency'] = BASE_CURRENCY_ID
        attrs['exchange_rate'] = Decimal('1')

        salesman = attrs.get('salesman') or getattr(self.instance, 'salesman', None)
        amount = attrs.get('amount')
        if amount is None and self.instance is not None:
            amount = self.instance.amount
        amount = Decimal(str(amount or 0))
        if amount <= 0:
            raise serializers.ValidationError({'amount': 'Amount must be greater than zero.'})

        method = attrs.get('payment_method', getattr(self.instance, 'payment_method', 'cash'))
        if method not in ('cash', 'bank', 'sarafi'):
            raise serializers.ValidationError({
                'payment_method': 'Select cash, bank, or sarafi.',
            })

        if salesman is None:
            raise serializers.ValidationError({'salesman': 'Select a salesman.'})

        exclude_id = self.instance.pk if self.instance else None
        balance = salesman_commission_balance(salesman, exclude_payment_id=exclude_id)
        # Allow tiny rounding slack
        if amount > balance + Decimal('0.01'):
            raise serializers.ValidationError({
                'amount': (
                    f'Payment exceeds unpaid commission. '
                    f'Earned {salesman_commission_earned(salesman):.2f} AFN, '
                    f'already paid {salesman_commission_paid(salesman, exclude_payment_id=exclude_id):.2f} AFN, '
                    f'remaining {balance:.2f} AFN.'
                ),
            })

        attrs['amount'] = amount.quantize(Decimal('0.01'))
        attrs['amount_base'] = attrs['amount']
        return attrs
