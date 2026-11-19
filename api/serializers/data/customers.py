from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from api.models.data.customers import Customer
from api.serializers.data.base import DataRootSerializer
from api.serializers.data.loan import LoanSerializer


class CustomerSerializer(DataRootSerializer):
    has_previous_balance = serializers.BooleanField(write_only=True, required=False, default=False)
    opening_balance_amount = serializers.DecimalField(
        max_digits=15,
        decimal_places=2,
        write_only=True,
        required=False,
    )
    opening_balance_loan_type = serializers.ChoiceField(
        choices=['loan_in', 'loan_out'],
        write_only=True,
        required=False,
    )
    opening_balance_currency = serializers.IntegerField(write_only=True, required=False)
    opening_balance_notes = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        default='',
    )

    class Meta:
        model = Customer
        fields = "__all__"

    def validate(self, attrs):
        attrs = super().validate(attrs)

        has_previous_balance = attrs.get('has_previous_balance', False)
        if self.instance is None and has_previous_balance:
            amount = attrs.get('opening_balance_amount')
            loan_type = attrs.get('opening_balance_loan_type')
            currency = attrs.get('opening_balance_currency')
            errors = {}
            if amount is None or Decimal(str(amount)) <= 0:
                errors['opening_balance_amount'] = 'Enter a positive opening balance amount.'
            if not loan_type:
                errors['opening_balance_loan_type'] = 'Select whether the customer owes you or you owe the customer.'
            if currency is None:
                errors['opening_balance_currency'] = 'Currency is required for opening balance.'
            if errors:
                raise serializers.ValidationError(errors)

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        has_previous_balance = validated_data.pop('has_previous_balance', False)
        opening_amount = validated_data.pop('opening_balance_amount', None)
        opening_loan_type = validated_data.pop('opening_balance_loan_type', None)
        opening_currency = validated_data.pop('opening_balance_currency', None)
        opening_notes = validated_data.pop('opening_balance_notes', '')

        validated_data.setdefault('is_active', True)
        customer = super().create(validated_data)

        if has_previous_balance:
            loan_payload = {
                'loaner_type': 'customer',
                'customer': customer.id,
                'amount': opening_amount,
                'loan_type': opening_loan_type,
                'currency': opening_currency,
                'is_opening_balance': True,
                'notes': (opening_notes or '').strip() or 'Opening balance from before system',
            }
            loan_serializer = LoanSerializer(data=loan_payload, context=self.context)
            loan_serializer.is_valid(raise_exception=True)

        return customer
