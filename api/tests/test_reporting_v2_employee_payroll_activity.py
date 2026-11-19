from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.employee import Employee
from api.models.data.employee_pay_entries import EmployeeAbsenceEntry, EmployeeOvertimeEntry
from api.models.data.payroll import Payroll
from api.models.data.sales import Sales
from api.services.reporting.contracts import ReportScope
from api.services.reporting.employee_payroll_activity import employee_payroll_activity
from api.tests.accounting.helpers import create_staff_user


class EmployeePayrollActivityV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='payactivityadmin', email='payactivity@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.employee = Employee.objects.create(full_name='Review worker', salary=1200, currency=1)
        self.when = datetime(2026, 2, 15, 12, tzinfo=dt_timezone.utc)

    def entries(self):
        EmployeeOvertimeEntry.objects.bulk_create([EmployeeOvertimeEntry(employee=self.employee,
            work_date=date(2026, 2, 10), amount=200, hours=4,
            month='february', year=2026, currency=1)])
        EmployeeAbsenceEntry.objects.create(employee=self.employee, entry_type='absence',
            absence_date=date(2026, 2, 11), days=1, month='february', year=2026, currency=1)
        EmployeeAbsenceEntry.objects.create(employee=self.employee, entry_type='food',
            absence_date=date(2026, 2, 12), amount=50, month='february', year=2026, currency=1)

    def payments(self):
        sale = Sales.objects.bulk_create([Sales(employee=self.employee, invoice_number='PAY-ACT-GOODS',
            sale_date=self.when, currency=1, status='confirmed', total_amount=200)])[0]
        Payroll.objects.bulk_create([
            Payroll(employee=self.employee, month='february', year=2026, currency=1,
                    amount=500, basic_salary=1200, overtime=200, deductions=90,
                    payment_method='cash', payment_date=self.when),
            Payroll(employee=self.employee, month='february', year=2026, currency=1,
                    amount=200, basic_salary=1200, payment_method='goods', source_sale=sale,
                    payment_date=self.when),
            Payroll(employee=self.employee, month='february', year=2026, currency=1,
                    payroll_type='advance', amount=100, payment_method='bank', payment_date=self.when),
        ])

    def test_absence_food_overtime_and_goods_are_distinct(self):
        self.entries()
        self.payments()
        result = employee_payroll_activity(ReportScope())
        self.assertEqual(len(result['rows']), 1)
        row = result['rows'][0]
        self.assertEqual({key: row[key] for key in ('overtime', 'absence_deductions', 'food_deductions',
            'total_deductions', 'net_adjustments', 'salary_paid_money', 'salary_paid_goods',
            'advances_paid_money', 'total_settled', 'pay_rate_snapshot')}, {
            'overtime': '200.00', 'absence_deductions': '40.00', 'food_deductions': '50.00',
            'total_deductions': '90.00', 'net_adjustments': '110.00',
            'salary_paid_money': '500.00', 'salary_paid_goods': '200.00',
            'advances_paid_money': '100.00', 'total_settled': '800.00',
            'pay_rate_snapshot': '1200.00',
        })
        self.assertEqual(row['absence_days'], '1.00')
        self.assertEqual((row['estimated_monthly_net'], row['estimated_remaining']), ('1310.00', '510.00'))
        self.assertEqual(row['balance_review_reasons'], [])
        self.assertEqual(row['event_count'], 6)
        self.assertEqual(sum(event['kind'] == 'food_deduction' for event in result['events']), 1)
        self.assertEqual(next(event for event in result['events'] if event['kind'] == 'salary_payment')['payment_line_deductions'], '90.00')

    def test_date_currency_and_calendar_are_respected_without_recomputing_history(self):
        self.entries()
        self.payments()
        EmployeeAbsenceEntry.objects.bulk_create([EmployeeAbsenceEntry(employee=self.employee,
            entry_type='food', absence_date=date(2026, 2, 12), days=0, amount=25,
            month='dalwa', year=1404, period_calendar='jalali', currency=2)])
        result = employee_payroll_activity(ReportScope.from_params({
            'start_date': '2026-02-11', 'end_date': '2026-02-12', 'currency': 1,
        }))
        self.assertEqual(len(result['rows']), 1)
        self.assertEqual(result['rows'][0]['overtime'], '0.00')
        self.assertEqual(result['rows'][0]['total_deductions'], '90.00')
        self.assertIsNone(result['rows'][0]['estimated_remaining'])
        self.assertIn('partial_event_date_filter', result['rows'][0]['balance_review_reasons'])
        self.assertEqual(len(result['events']), 2)
        separate = employee_payroll_activity(ReportScope.from_params({'currency': 2}))
        self.assertEqual((separate['rows'][0]['month'], separate['rows'][0]['food_deductions']), ('dalwa', '25.00'))
        self.assertIn('currency_filter_may_hide_other_entries', separate['rows'][0]['balance_review_reasons'])
        self.employee.salary = Decimal('9000')
        self.employee.save(update_fields=['salary'])
        self.assertEqual(employee_payroll_activity(ReportScope())['rows'][0]['pay_rate_snapshot'], '1200.00')

    def test_endpoint_paginates_events_and_rejects_gl_account_filter(self):
        self.entries()
        response = self.client.get('/api/reports/v2/employee-payroll-activity/', {'page_size': 1})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data['count'], len(response.data['results'])), (3, 1))
        self.assertEqual(response.data['rows'][0]['food_deductions'], '50.00')
        self.assertEqual(self.client.get('/api/reports/v2/employee-payroll-activity/', {'account_id': 1}).status_code, 400)

    def test_deleted_entries_and_payments_do_not_enter_report(self):
        self.entries()
        self.payments()
        EmployeeAbsenceEntry.objects.filter(entry_type='food').update(deleted_at=self.when)
        Payroll.objects.filter(payment_method='goods').update(deleted_at=self.when)
        result = employee_payroll_activity(ReportScope())
        row = result['rows'][0]
        self.assertEqual((row['food_deductions'], row['salary_paid_goods']), ('0.00', '0.00'))
        self.assertEqual(row['event_count'], 4)
        self.assertIsNone(row['estimated_remaining'])
        self.assertIn('payment_deductions_differ_from_day_entries', row['balance_review_reasons'])

    def test_conflicting_rate_or_unmatched_payment_adjustment_never_fabricates_balance(self):
        self.entries()
        self.payments()
        Payroll.objects.filter(payment_method='goods').update(basic_salary=1300)
        row = employee_payroll_activity(ReportScope())['rows'][0]
        self.assertTrue(row['pay_rate_conflict'])
        self.assertIsNone(row['estimated_monthly_net'])
        self.assertIn('monthly_salary_snapshot_missing_or_conflicting', row['balance_review_reasons'])

        Payroll.objects.filter(payment_method='goods').update(basic_salary=1200)
        Payroll.objects.filter(payment_method='cash').update(deductions=100)
        row = employee_payroll_activity(ReportScope())['rows'][0]
        self.assertIsNone(row['estimated_remaining'])
        self.assertIn('payment_deductions_differ_from_day_entries', row['balance_review_reasons'])

    def test_bonus_and_daily_rate_are_not_misrepresented_as_monthly_net(self):
        self.entries()
        self.payments()
        Payroll.objects.filter(payment_method='cash').update(bonus=30)
        row = employee_payroll_activity(ReportScope())['rows'][0]
        self.assertIsNone(row['estimated_monthly_net'])
        self.assertIn('payment_bonus_has_no_independent_entitlement', row['balance_review_reasons'])

        Payroll.objects.filter(payment_method='cash').update(bonus=0)
        Payroll.objects.filter(payroll_type='salary').update(salary_type='daily')
        row = employee_payroll_activity(ReportScope())['rows'][0]
        self.assertIsNone(row['estimated_monthly_net'])
        self.assertIn('daily_or_manual_entitlement_not_supported', row['balance_review_reasons'])

    def test_mixed_currency_in_same_pay_period_blocks_monthly_estimate(self):
        self.entries()
        self.payments()
        EmployeeAbsenceEntry.objects.bulk_create([EmployeeAbsenceEntry(employee=self.employee,
            entry_type='food', absence_date=date(2026, 2, 13), days=0, amount=25,
            month='february', year=2026, currency=2)])
        rows = employee_payroll_activity(ReportScope())['rows']
        self.assertEqual(len(rows), 2)
        afn = next(row for row in rows if row['currency_id'] == 1)
        self.assertIsNone(afn['estimated_remaining'])
        self.assertIn('multiple_currencies_in_pay_period', afn['balance_review_reasons'])
