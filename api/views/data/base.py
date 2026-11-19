from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter
from api.views.data.pagination import CustomPagination
from api.views.mixins.soft_delete import SoftDeleteViewSetMixin
from account.permissions import HasModulePermission


class DataRootViewSet(SoftDeleteViewSetMixin, ModelViewSet):
    permission_classes = [IsAuthenticated, HasModulePermission]
    pagination_class = CustomPagination
    filter_backends = [DjangoFilterBackend, SearchFilter]
    permission_module = None
    permission_codenames = None

    # Business event dates, rather than record creation timestamps. Master
    # data (customers, vendors, products) use dates for financial summaries only.
    report_date_fields = {
        'sales': 'sale_date', 'rawmaterialpurchase': 'purchase_date',
        'expense': 'expense_date', 'payroll': 'payment_date',
        'generalpayment': 'payment_date', 'payment': 'payment_date', 'loan': 'loan_date', 'loanpayment': 'payment_date',
        'withdrawal': 'withdrawal_date', 'currencyexchange': 'exchange_date',
        'salesmancommissionpayment': 'payment_date', 'rawmaterialprocess': 'process_date',
        'packingrun': 'created_at',
        'equipment': 'acquired_date', 'attendance': 'date',
        'journalentry': 'entry_date', 'accountentry': 'entry_date',
        'stocktransfer': 'transfer_date', 'stockadjustment': 'adjustment_date',
        'fxrevaluation': 'as_of_date',
        'employeeovertimeentry': 'work_date',
        'employeeabsenceentry': 'absence_date',
    }

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        from api.utils.date_filters import apply_date_range, date_range_params
        start, end = date_range_params(self.request)
        name = queryset.model._meta.model_name
        field = self.report_date_fields.get(name)
        if field:
            queryset = apply_date_range(queryset, field, start, end)
        elif name == 'employeeleave':
            # A leave belongs to any selected period it overlaps.
            queryset = apply_date_range(queryset, 'end_date', start, None)
            queryset = apply_date_range(queryset, 'start_date', None, end)
        if self.action == 'list':
            field_names = {
                field.name for field in queryset.model._meta.get_fields()
            }
            created_field = next(
                (name for name in ('created_at', 'date_joined') if name in field_names),
                None,
            )
            if created_field:
                queryset = queryset.order_by(f'-{created_field}', '-pk')
        return queryset
