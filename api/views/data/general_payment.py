from rest_framework import serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from api.models.data.currency import CURRENCY_CHOICES
from api.models.data.payment import GeneralPayment
from api.serializers.data.payment import GeneralPaymentSerializer
from api.services.general_payments import balance_data, delete_general_payment
from api.views.data.base import DataRootViewSet


class GeneralPaymentViewSet(DataRootViewSet):
    permission_module = 'payments'
    permission_codenames = ['view_payments', 'view_sale_payments', 'view_purchase_payments']
    permission_action_map = {'balance': permission_codenames}
    soft_delete_enabled = False
    queryset = GeneralPayment.objects.filter(source_sale__isnull=True).select_related('customer', 'vendor').prefetch_related('allocations__content_type', 'allocations__documents')
    serializer_class = GeneralPaymentSerializer
    filterset_fields = ['payment_type', 'customer', 'vendor', 'currency', 'payment_method']
    search_fields = ['reference_number', 'notes', 'customer__name', 'vendor__name']
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def perform_hard_destroy(self, instance):
        delete_general_payment(instance)

    @action(detail=False, methods=['get'])
    def balance(self, request):
        class BalanceInput(serializers.Serializer):
            payment_type = serializers.ChoiceField(choices=['sale', 'purchase'])
            party_id = serializers.IntegerField(min_value=1)
            currency = serializers.ChoiceField(choices=CURRENCY_CHOICES)
            exclude_general_payment = serializers.IntegerField(min_value=1, required=False)
        data = BalanceInput(data=request.query_params)
        data.is_valid(raise_exception=True)
        return Response(balance_data(**data.validated_data))
