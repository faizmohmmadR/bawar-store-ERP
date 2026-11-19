from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.loan import Loan, LoanPayment
from api.serializers.data.loan import LoanPaymentSerializer, LoanSerializer
from api.views.data.base import DataRootViewSet


class LoanPaymentViewSet(DataRootViewSet):
    queryset = LoanPayment.objects.select_related('loan').all()
    permission_module = 'loans'
    serializer_class = LoanPaymentSerializer
    filterset_fields = ['loan', 'payment_method', 'loan__loan_type']
    search_fields = ['loan__customer__name', 'loan__vendor__name', 'bill_number', 'reference_number', 'notes']

    @transaction.atomic
    def perform_destroy(self, instance):
        Loan.objects.select_for_update().get(pk=instance.loan_id)
        super().perform_destroy(instance)

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        return qs.order_by('-payment_date', '-pk') if self.action == 'list' else qs


class LoanViewSet(DataRootViewSet):
    permission_module = 'loans'
    queryset = Loan.objects.select_related().prefetch_related('payments').all().order_by('-loan_date')
    serializer_class = LoanSerializer
    filterset_fields = ['loaner_type', 'loan_type', 'is_paid', 'currency', 'customer', 'vendor']
    search_fields = ['customer__name', 'customer__phone', 'customer__email', 'vendor__name', 'bill_number', 'notes']

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.get_queryset()

        loan_in_total = queryset.filter(loan_type='loan_in').aggregate(total=Sum('amount'))['total'] or 0
        loan_out_total = queryset.filter(loan_type='loan_out').aggregate(total=Sum('amount'))['total'] or 0

        unpaid_loan_in = Decimal('0')
        unpaid_loan_out = Decimal('0')
        for loan in queryset.filter(is_paid=False):
            due = loan.balance_due
            if loan.loan_type == 'loan_in':
                unpaid_loan_in += due
            else:
                unpaid_loan_out += due

        summary = {
            'total_loan_in': loan_in_total,
            'total_loan_out': loan_out_total,
            'unpaid_loan_in': float(unpaid_loan_in),
            'unpaid_loan_out': float(unpaid_loan_out),
            'net_balance': loan_in_total - loan_out_total,
            'total_loans': queryset.count(),
            'unpaid_loans': queryset.filter(is_paid=False).count(),
        }

        return Response(summary)

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """Loans section report — AFN totals and native by-currency breakdown."""
        from api.services.loan_report import get_loan_report
        from api.services.report_period import format_report_period_response, resolve_report_period

        start_date, end_date = resolve_report_period(
            period=request.query_params.get('period', 'monthly'),
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            fiscal_year_id=request.query_params.get('fiscal_year_id'),
        )
        report = get_loan_report(start_date=start_date, end_date=end_date)
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def add_payment(self, request, pk=None):
        loan = self.get_object()
        data = request.data.copy()
        data['loan'] = loan.pk
        serializer = LoanPaymentSerializer(data=data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=201)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def mark_paid(self, request, pk=None):
        loan = Loan.objects.select_for_update().get(pk=self.get_object().pk)
        remaining = loan.balance_due
        if remaining > 0:
            serializer = LoanPaymentSerializer(data={
                'loan': loan.pk,
                'amount': remaining,
                'payment_method': request.data.get('payment_method') or loan.payment_method or 'cash',
                'payment_date': request.data.get('payment_date') or timezone.now(),
                'notes': 'Marked as fully paid',
            }, context=self.get_serializer_context())
            serializer.is_valid(raise_exception=True)
            serializer.save()
        else:
            loan.is_paid = True
            loan.save(update_fields=['is_paid', 'updated_at'])
        return Response(LoanSerializer(loan).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def mark_unpaid(self, request, pk=None):
        loan = Loan.objects.select_for_update().get(pk=self.get_object().pk)
        loan.payments.all().delete()
        loan.amount_paid = Decimal('0')
        loan.amount_paid_base = Decimal('0')
        loan.is_paid = False
        loan.save(update_fields=['amount_paid', 'amount_paid_base', 'is_paid', 'updated_at'])
        return Response({'message': 'Loan marked as unpaid'})
