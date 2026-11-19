from django.db import transaction
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.expenses import Expense, ExpenseCategory
from api.serializers.data.expenses import ExpenseSerializer, ExpenseCategorySerializer
from api.views.data.base import DataRootViewSet


class ExpenseCategoryViewSet(DataRootViewSet):
    soft_delete_enabled = False
    permission_module = 'expense_categories'
    queryset = ExpenseCategory.objects.all().order_by("-id")
    serializer_class = ExpenseCategorySerializer
    search_fields = ["name"]


class ExpenseViewSet(DataRootViewSet):
    permission_module = 'expenses'
    queryset = Expense.objects.all().order_by("-expense_date", "-id")
    serializer_class = ExpenseSerializer
    search_fields = ["description", "receipt"]

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """Expense section report — by currency, category, and payment method."""
        from api.services.expense_report import get_expense_report
        from api.services.report_period import format_report_period_response, resolve_report_period

        start_date, end_date = resolve_report_period(
            period=request.query_params.get('period', 'monthly'),
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            fiscal_year_id=request.query_params.get('fiscal_year_id'),
        )
        report = get_expense_report(start_date=start_date, end_date=end_date)
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance.delete()
