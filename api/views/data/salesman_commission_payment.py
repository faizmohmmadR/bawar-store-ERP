from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.salesman_commission_payment import SalesmanCommissionPayment
from api.models.data.salesmen import Salesman
from api.serializers.data.salesman_commission_payment import SalesmanCommissionPaymentSerializer
from api.services.accounting import (
    delete_journal_for_source,
    sync_salesman_commission_payment_journal,
)
from api.services.salesman_commission import (
    salesman_commission_balance,
    salesman_commission_earned,
    salesman_commission_paid,
)
from api.views.data.base import DataRootViewSet


class SalesmanCommissionPaymentViewSet(DataRootViewSet):
    permission_module = 'salesman_commission_payments'
    permission_codenames = [
        'view_salesman_commission_payments',
        'view_salesmen',
    ]
    queryset = SalesmanCommissionPayment.objects.select_related('salesman').all()
    serializer_class = SalesmanCommissionPaymentSerializer
    filterset_fields = ['salesman', 'payment_method', 'currency']
    search_fields = ['reference_number', 'notes', 'salesman__name']

    def get_queryset(self):
        qs = super().get_queryset()
        outstanding_salesman = self.request.query_params.get('outstanding_salesman')
        if outstanding_salesman:
            qs = qs.filter(salesman_id=outstanding_salesman)
        return qs

    def create(self, request, *args, **kwargs):
        with transaction.atomic():
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            payment = serializer.instance
            sync_salesman_commission_payment_journal(payment)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            partial = kwargs.pop('partial', False)
            instance = self.get_object()
            serializer = self.get_serializer(instance, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            payment = serializer.instance
            sync_salesman_commission_payment_journal(payment)
            return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            instance = self.get_object()
            delete_journal_for_source(instance)
            return super().destroy(request, *args, **kwargs)

    def perform_hard_destroy(self, instance):
        delete_journal_for_source(instance)
        instance.delete()

    @action(detail=False, methods=['get'], url_path='for_salesman')
    def for_salesman(self, request):
        salesman_id = request.query_params.get('salesman_id')
        if not salesman_id:
            return Response(
                {'error': 'salesman_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        salesman = Salesman.objects.filter(pk=salesman_id).first()
        if salesman is None:
            return Response({'error': 'Salesman not found'}, status=status.HTTP_404_NOT_FOUND)

        payments = self.get_queryset().filter(salesman=salesman).order_by('-payment_date')
        serializer = self.get_serializer(payments, many=True)
        return Response({
            'salesman_id': salesman.id,
            'earned': float(salesman_commission_earned(salesman)),
            'paid': float(salesman_commission_paid(salesman)),
            'balance': float(salesman_commission_balance(salesman)),
            'results': serializer.data,
        })
