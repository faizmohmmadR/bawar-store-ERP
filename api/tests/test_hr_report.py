"""Section report for HR — headcount, payroll, attendance, OT/deductions."""
from datetime import date, datetime
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from api.models.data.attendance import Attendance
from api.models.data.employee import Employee
from api.models.data.employee_pay_entries import EmployeeAbsenceEntry, EmployeeOvertimeEntry
from api.models.data.payroll import Payroll
from api.services.currency_conversion import populate_base_amounts
from api.services.hr_report import get_hr_report
from api.tests.accounting.helpers import TXN_WHEN


class HrReportTests(TestCase):
    def setUp(self):
        self.employee = Employee.objects.create(
            full_name='HR Report Worker',
            phone='0700111222',
            salary=Decimal('1000'),
            currency=1,
            is_active=True,
            contract_start_date=date(2026, 1, 1),
        )
        Employee.objects.create(
            full_name='Inactive Worker',
            phone='0700333444',
            salary=Decimal('500'),
            currency=1,
            is_active=False,
            contract_start_date=date(2025, 1, 1),
        )

    def _payroll(self, **overrides):
        values = dict(
            employee=self.employee,
            month='february',
            year=2026,
            currency=1,
            payroll_type='salary',
            payment_date=TXN_WHEN,
            basic_salary=Decimal('1000'),
            manual_net=True,
            gross_amount=Decimal('1000'),
            net_salary=Decimal('1000'),
            amount=Decimal('1000'),
            payment_method='cash',
        )
        values.update(overrides)
        row = Payroll(**values)
        populate_base_amounts(row, amount_fields=['amount', 'net_salary', 'gross_amount', 'basic_salary'], at_datetime=TXN_WHEN)
        row.save()
        return row

    def test_hr_report_headcount_and_payroll(self):
        self._payroll()
        self._payroll(
            payroll_type='advance',
            amount=Decimal('200'),
            net_salary=Decimal('200'),
            gross_amount=Decimal('200'),
            basic_salary=Decimal('0'),
        )
        EmployeeOvertimeEntry.objects.create(
            employee=self.employee,
            work_date=TXN_WHEN.date() if hasattr(TXN_WHEN, 'date') else TXN_WHEN,
            amount=Decimal('50'),
            hours=Decimal('2'),
            month='february',
            year=2026,
            period_calendar='gregorian',
            currency=1,
        )
        EmployeeAbsenceEntry.objects.create(
            employee=self.employee,
            absence_date=TXN_WHEN.date() if hasattr(TXN_WHEN, 'date') else TXN_WHEN,
            days=Decimal('0'),
            amount=Decimal('30'),
            entry_type=EmployeeAbsenceEntry.TYPE_FOOD,
            month='february',
            year=2026,
            period_calendar='gregorian',
            currency=1,
        )
        Attendance.objects.create(
            employee=self.employee,
            date=TXN_WHEN.date() if hasattr(TXN_WHEN, 'date') else TXN_WHEN,
            status='present',
        )

        report = get_hr_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        self.assertEqual(report['report_type'], 'hr')
        self.assertEqual(report['kpis']['active_headcount'], 1)
        self.assertEqual(report['kpis']['inactive_headcount'], 1)
        self.assertEqual(report['kpis']['salary_paid_afn'], 1000.0)
        self.assertEqual(report['kpis']['advances_paid_afn'], 200.0)
        self.assertEqual(report['kpis']['overtime_afn'], 50.0)
        self.assertEqual(report['kpis']['deductions_afn'], 30.0)
        self.assertEqual(report['kpis']['attendance_present'], 1)
        self.assertEqual(len(report['employees']), 1)
        self.assertEqual(report['employees'][0]['full_name'], 'HR Report Worker')
