from django.db import IntegrityError
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.currency import (
    BASE_CURRENCY_ID, CURRENCY_CHOICES, CURRENCY_DEFINITIONS,
    ExchangeRate, currency_details,
)
from api.serializers.data.base import DataRootSerializer
from api.views.data.base import DataRootViewSet


class ExchangeRateSerializer(DataRootSerializer):
    from_currency = serializers.IntegerField()
    to_currency = serializers.IntegerField(default=BASE_CURRENCY_ID)
    from_currency_details = serializers.SerializerMethodField()
    to_currency_details = serializers.SerializerMethodField()
    rate = serializers.DecimalField(max_digits=18, decimal_places=6, coerce_to_string=False)

    class Meta:
        model = ExchangeRate
        fields = '__all__'

    def get_from_currency_details(self, obj):
        return currency_details(obj.from_currency)

    def get_to_currency_details(self, obj):
        return currency_details(obj.to_currency)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        to_currency = attrs.get('to_currency', BASE_CURRENCY_ID)
        from_currency = attrs.get('from_currency')

        # Always force to_currency to base
        attrs['to_currency'] = BASE_CURRENCY_ID

        if from_currency and int(from_currency) == BASE_CURRENCY_ID:
            base_code = CURRENCY_DEFINITIONS[BASE_CURRENCY_ID]['code']
            raise serializers.ValidationError(
                {'from_currency': f'Cannot set exchange rate for base currency ({base_code}).'}
            )
        if from_currency and int(from_currency) not in CURRENCY_DEFINITIONS:
            raise serializers.ValidationError({'from_currency': 'Invalid currency id.'})
        if attrs.get('rate') is not None and attrs['rate'] <= 0:
            raise serializers.ValidationError({'rate': 'Rate must be positive.'})
        return attrs


class ExchangeRateViewSet(DataRootViewSet):
    soft_delete_enabled = False
    """Historical exchange rates to base currency (AFN)."""

    permission_module = 'exchange_rates'
    # Sidebar is gated by view_exchange_rates; accept that for writes so
    # existing users are not blocked (add_* was missing until now).
    permission_action_map = {
        'list': 'view_exchange_rates',
        'retrieve': 'view_exchange_rates',
        'create': ['add_exchange_rates', 'view_exchange_rates', 'edit_settings'],
        'update': ['edit_exchange_rates', 'view_exchange_rates', 'edit_settings'],
        'partial_update': ['edit_exchange_rates', 'view_exchange_rates', 'edit_settings'],
        'destroy': ['delete_exchange_rates', 'view_exchange_rates', 'edit_settings'],
        'lookup': 'view_exchange_rates',
    }

    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer
    filterset_fields = ['from_currency', 'to_currency', 'is_active']
    search_fields = []
    ordering_fields = ['date', 'rate']
    ordering = ['-date']

    def perform_create(self, serializer):
        try:
            serializer.save()
        except IntegrityError:
            raise serializers.ValidationError({
                'date': 'An exchange rate for this currency and date already exists.',
            })

    def perform_update(self, serializer):
        try:
            serializer.save()
        except IntegrityError:
            raise serializers.ValidationError({
                'date': 'An exchange rate for this currency and date already exists.',
            })

    @action(detail=False, methods=['get'])
    def lookup(self, request):
        """Find exchange rate nearest to a datetime for a currency id."""
        from api.services.currency_conversion import lookup_rate_to_base

        currency_id = request.query_params.get('currency')
        at = request.query_params.get('date')
        if not currency_id:
            return Response({'error': 'currency is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            currency_id = int(currency_id)
        except (TypeError, ValueError):
            return Response({'error': 'Invalid currency id'}, status=status.HTTP_400_BAD_REQUEST)

        if currency_id not in CURRENCY_DEFINITIONS:
            return Response({'error': 'Currency not found'}, status=status.HTTP_404_NOT_FOUND)

        at_dt = parse_datetime(at) if at else timezone.now()
        if at and not at_dt:
            return Response({'error': 'Invalid date format'}, status=status.HTTP_400_BAD_REQUEST)

        if request.query_params.get('cost_reporting') == 'true' and currency_id == 2:
            from api.services.cost_currency import usd_cost_rate
            return Response({'rate': usd_cost_rate(at_dt), 'date': at_dt})

        try:
            rate, rate_date = lookup_rate_to_base(currency_id, at_dt)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'from_currency': currency_details(currency_id),
            'to_currency': currency_details(BASE_CURRENCY_ID),
            'rate': rate,
            'date': at_dt,
            'rate_date': rate_date,
        })
