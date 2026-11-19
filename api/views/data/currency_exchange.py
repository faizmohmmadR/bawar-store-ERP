from django.db import transaction
from rest_framework.exceptions import ValidationError

from api.models.data.currency_exchange import CurrencyExchange
from api.serializers.data.currency_exchange import CurrencyExchangeSerializer
from api.views.data.base import DataRootViewSet


class CurrencyExchangeViewSet(DataRootViewSet):
    permission_module = 'currency_exchanges'
    queryset = (
        CurrencyExchange.objects.select_related('created_by')
        .all()
        .order_by('-exchange_date', '-id')
    )
    serializer_class = CurrencyExchangeSerializer
    filterset_fields = ['from_currency', 'to_currency', 'status', 'from_method', 'to_method']
    search_fields = ['reference_number', 'notes']

    def get_queryset(self):
        qs = super().get_queryset()
        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        if instance.status == CurrencyExchange.STATUS_POSTED:
            raise ValidationError(
                'Posted currency exchanges cannot be deleted. Reverse the document instead.'
            )
        instance.delete()
