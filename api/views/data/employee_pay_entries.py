from api.models.data.employee_pay_entries import EmployeeAbsenceEntry, EmployeeOvertimeEntry
from api.serializers.data.employee_pay_entries import (
    EmployeeAbsenceEntrySerializer,
    EmployeeOvertimeEntrySerializer,
)
from api.views.data.base import DataRootViewSet


class EmployeeOvertimeEntryViewSet(DataRootViewSet):
    permission_module = 'payroll'
    serializer_class = EmployeeOvertimeEntrySerializer
    filterset_fields = ['employee', 'month', 'year', 'period_calendar', 'work_date']
    search_fields = ['employee__full_name', 'notes']
    queryset = EmployeeOvertimeEntry.objects.select_related('employee').all()


class EmployeeAbsenceEntryViewSet(DataRootViewSet):
    permission_module = 'payroll'
    serializer_class = EmployeeAbsenceEntrySerializer
    filterset_fields = ['employee', 'month', 'year', 'period_calendar', 'absence_date', 'entry_type']
    search_fields = ['employee__full_name', 'notes']
    queryset = EmployeeAbsenceEntry.objects.select_related('employee').all()
