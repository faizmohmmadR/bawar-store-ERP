from rest_framework import serializers

from api.models.data.account import Account
from api.models.data.currency import CURRENCY_CHOICES, currency_details as _currency_details_fn
from api.serializers.data.base import DataRootSerializer


class AccountWriteSerializer(serializers.ModelSerializer):
    currency = serializers.IntegerField()

    class Meta:
        model = Account
        fields = ('id', 'account_number', 'name', 'currency', 'notes')

    def validate(self, data):
        from api.models.data.currency import CURRENCY_DEFINITIONS
        currency_id = data.get('currency')
        if currency_id and int(currency_id) not in CURRENCY_DEFINITIONS:
            raise serializers.ValidationError({'currency': 'Invalid currency.'})
        return data


class AccountSerializer(DataRootSerializer):
    currency_details = serializers.SerializerMethodField()
    currency_code = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = '__all__'

    def get_currency_code(self, obj):
        from api.models.data.currency import get_currency
        c = get_currency(obj.currency)
        return c['code'] if c else None

    def get_currency_details(self, obj):
        return _currency_details_fn(obj.currency)
