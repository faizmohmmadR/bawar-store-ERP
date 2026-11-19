from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import serializers as drf_serializers

from api.models.data.employee import Employee
from api.serializers.data.employee import EmployeeSerializer
from api.services.employee_account import create_user_for_employee
from api.views.data.base import DataRootViewSet


class EmployeeViewSet(DataRootViewSet):
    permission_module = 'employees'
    permission_action_map = {
        'create_account': ['add_users', 'edit_employees'],
    }
    serializer_class = EmployeeSerializer
    search_fields = ["full_name", "email", "phone", "tazkira_number"]
    filterset_fields = ['is_active', 'salary_type']
    queryset = Employee.objects.all().order_by("-id")

    def _summary_for_employee(self, employee, month=None, year=None, target_currency_id=None):
        from api.services.employee_payroll import employee_payroll_summary
        if year:
            year = drf_serializers.IntegerField(min_value=1, max_value=9999).run_validation(year)
        return employee_payroll_summary(
            employee, month=month, year=year, target_currency_id=target_currency_id,
            period_calendar=drf_serializers.ChoiceField(choices=['gregorian', 'jalali', 'hijri']).run_validation(
                self.request.query_params.get('period_calendar', 'gregorian')
            ),
        )

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        currency_id = request.query_params.get('summary_currency')
        target_currency_id = int(currency_id) if currency_id and currency_id.isdigit() else None

        payload = response.data
        rows = payload.get('results', payload) if isinstance(payload, dict) else payload
        if isinstance(rows, list):
            employee_map = {
                str(emp.id): emp
                for emp in Employee.objects.filter(id__in=[row.get('id') for row in rows if row.get('id')]).prefetch_related('payrolls')
            }
            for row in rows:
                employee = employee_map.get(str(row.get('id')))
                if not employee:
                    continue
                row['payment_summary'] = self._summary_for_employee(
                    employee, month=month, year=year, target_currency_id=target_currency_id
                )
        return response

    @action(detail=False, methods=['get'], url_path='report')
    def report(self, request):
        """HR section report — headcount, payroll cash, attendance, OT/deductions."""
        from api.services.hr_report import get_hr_report
        from api.services.report_period import format_report_period_response, resolve_report_period

        start_date, end_date = resolve_report_period(
            period=request.query_params.get('period', 'monthly'),
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            fiscal_year_id=request.query_params.get('fiscal_year_id'),
        )
        report = get_hr_report(start_date=start_date, end_date=end_date)
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })

    @action(detail=True, methods=['get'])
    def financial_summary(self, request, pk=None):
        employee = self.get_object()
        month = request.query_params.get('month')
        year = request.query_params.get('year')
        currency_id = request.query_params.get('currency')
        target_currency_id = int(currency_id) if currency_id and currency_id.isdigit() else None
        return Response(self._summary_for_employee(
            employee, month=month, year=year, target_currency_id=target_currency_id
        ))

    @action(detail=True, methods=['get'])
    def yearly_summary(self, request, pk=None):
        from api.services.employee_payroll import employee_yearly_payroll_summary

        employee = self.get_object()
        year = request.query_params.get('year')
        if not year:
            return Response({'year': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST)
        year = drf_serializers.IntegerField(min_value=1, max_value=9999).run_validation(year)
        currency_id = request.query_params.get('currency')
        target_currency_id = int(currency_id) if currency_id and currency_id.isdigit() else None
        period_calendar = drf_serializers.ChoiceField(
            choices=['gregorian', 'jalali', 'hijri'],
        ).run_validation(request.query_params.get('period_calendar', 'gregorian'))
        return Response(employee_yearly_payroll_summary(
            employee,
            year=year,
            target_currency_id=target_currency_id,
            period_calendar=period_calendar,
        ))

    @action(detail=True, methods=['get'])
    def payroll_history(self, request, pk=None):
        from api.serializers.data.payroll import PayrollSerializer
        employee = self.get_object()
        payrolls = employee.payrolls.select_related('employee').order_by('-payment_date', '-id')
        page = self.paginate_queryset(payrolls)
        serializer = PayrollSerializer(page if page is not None else payrolls, many=True, context=self.get_serializer_context())
        return self.get_paginated_response(serializer.data) if page is not None else Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='create-account')
    def create_account(self, request, pk=None):
        employee = self.get_object()
        password = request.data.get('account_password') or request.data.get('password') or ''
        email = request.data.get('account_email') or request.data.get('email') or employee.email or ''
        try:
            create_user_for_employee(
                employee,
                email=email,
                password=password,
                actor=request.user,
            )
        except drf_serializers.ValidationError as exc:
            return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
        employee.refresh_from_db()
        return Response(self.get_serializer(employee).data, status=status.HTTP_201_CREATED)
