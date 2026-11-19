from rest_framework import serializers

from api.models.data.currency import CURRENCY_CHOICES, currency_details as _currency_details_fn
from api.models.data.currency_exchange import CurrencyExchange
from api.serializers.data.base import DataRootSerializer

POSTED_LOCKED_FIELDS = (
    'from_currency',
    'to_currency',
    'from_amount',
    'to_amount',
    'rate',
    'from_exchange_rate',
    'to_exchange_rate',
    'from_method',
    'to_method',
    'exchange_date',
)


class CurrencyExchangeSerializer(DataRootSerializer):
    from_currency = serializers.IntegerField()
    to_currency = serializers.IntegerField()
    rate = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, allow_null=True)
    from_currency_details = serializers.SerializerMethodField()
    to_currency_details = serializers.SerializerMethodField()
    created_by_details = serializers.SerializerMethodField()

    class Meta:
        model = CurrencyExchange
        fields = '__all__'
        read_only_fields = ('from_exchange_rate',
                            'to_exchange_rate', 'posted_at', 'created_by')

    def to_internal_value(self, data):
        if hasattr(data, 'copy'):
            data = data.copy()
            if data.get('rate') == '':
                data['rate'] = None
        return super().to_internal_value(data)

    def validate(self, attrs):
        instance = self.instance
        from_currency = attrs.get('from_currency', getattr(
            instance, 'from_currency', None))
        to_currency = attrs.get('to_currency', getattr(
            instance, 'to_currency', None))
        if from_currency is not None and to_currency is not None and int(from_currency) == int(to_currency):
            raise serializers.ValidationError(
                'from_currency and to_currency must differ.')
        if from_currency not in dict(CURRENCY_CHOICES) or to_currency not in dict(CURRENCY_CHOICES):
            raise serializers.ValidationError('Unknown currency.')

        if instance is not None and instance.status == CurrencyExchange.STATUS_POSTED:
            new_status = attrs.get('status', instance.status)
            if new_status == CurrencyExchange.STATUS_POSTED:
                for field in POSTED_LOCKED_FIELDS:
                    if field not in attrs:
                        continue
                    if attrs[field] != getattr(instance, field):
                        raise serializers.ValidationError(
                            'Posted currency exchanges cannot be edited. Reverse the document instead.'
                        )
            elif new_status != CurrencyExchange.STATUS_REVERSED:
                raise serializers.ValidationError(
                    'A posted exchange can only be reversed, not changed to another status.'
                )
        if instance is not None and instance.status == CurrencyExchange.STATUS_REVERSED:
            raise serializers.ValidationError(
                'A reversed currency exchange cannot be edited.')
        return attrs

    def get_from_currency_details(self, obj):
        return _currency_details_fn(obj.from_currency)

    def get_to_currency_details(self, obj):
        return _currency_details_fn(obj.to_currency)

    def get_created_by_details(self, obj):
        if not obj.created_by_id:
            return None
        u = obj.created_by
        return {
            'id': u.id,
            'username': u.username,
            'fullname': f'{u.first_name or ""} {u.last_name or ""}'.strip(),
        }
