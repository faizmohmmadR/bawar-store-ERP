from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError

from api.models.data.payroll import Payroll
from api.serializers.data.payroll import PayrollSerializer
from api.views.data.base import DataRootViewSet


class PayrollViewSet(DataRootViewSet):
    permission_module = 'payroll'
    serializer_class = PayrollSerializer
    search_fields = ["employee__full_name", "employee__email", "employee__phone", "notes", "reference_number"]
    filterset_fields = ['employee', 'month', 'year', 'payroll_type', 'period_calendar']
    queryset = Payroll.objects.select_related('employee').all().order_by("-id")

    def _save_payroll(self, serializer):
        try:
            serializer.save()
        except IntegrityError as exc:
            message = str(exc)
            # Legacy unique indexes may still exist until migration 0032 runs.
            if 'uniq_payroll_employee_period' in message or 'Duplicate entry' in message:
                raise ValidationError({
                    'non_field_errors': [
                        'Could not save payroll due to a legacy unique index. '
                        'Run migrations, then retry — multiple payments per month are allowed.',
                    ],
                }) from exc
            raise

    @transaction.atomic
    def perform_create(self, serializer):
        self._save_payroll(serializer)

    @transaction.atomic
    def perform_update(self, serializer):
        self._save_payroll(serializer)

    @transaction.atomic
    def perform_destroy(self, instance):
        if instance.source_sale_id:
            raise ValidationError({
                'detail': 'Cancel or delete the linked product sale to reverse this salary settlement.',
            })
        instance.delete()
