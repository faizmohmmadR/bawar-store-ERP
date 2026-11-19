from datetime import date, datetime
from decimal import Decimal

from django.test import TestCase
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework.test import APIClient

from api.models.data.employee import Employee
from api.models.data.payroll import Payroll
from api.models.data.journal import JournalEntry
from api.services.employee_payroll import completed_contract_months, employee_payroll_summary
from api.tests.accounting.helpers import create_staff_user


class EmployeePayrollBalanceTests(TestCase):
    def setUp(self):
        self.employee = Employee.objects.create(
            full_name='Contract worker', phone='0700000000', salary=1000,
            currency=1, contract_start_date=date(2026, 1, 15),
        )

    def payment(self, **overrides):
        values = dict(
            employee=self.employee, month='february', year=2026, currency=1,
            payment_date=timezone.make_aware(datetime(2026, 2, 15, 12)),
            basic_salary=1000, manual_net=True, gross_amount=1000,
        )
        values.update(overrides)
        return Payroll.objects.create(**values)

    def test_anniversary_accrual_handles_partial_months_and_month_ends(self):
        for start, end, expected in (
            (date(2026, 1, 15), date(2026, 4, 14), 2),
            (date(2026, 1, 15), date(2026, 4, 15), 3),
            (date(2026, 1, 31), date(2026, 2, 28), 1),
            (date(2024, 1, 31), date(2024, 2, 29), 1),
            (date(2026, 5, 1), date(2026, 4, 30), 0),
        ):
            with self.subTest(start=start, end=end):
                self.assertEqual(completed_contract_months(start, end), expected)

    def test_balance_includes_adjustments_and_advances(self):
        # Payroll-line overtime/deduction no longer change open balance; day entries do.
        self.payment(overtime=200, salary_deduction=50)
        self.payment(month='march', payroll_type='advance', gross_amount=None, amount=300, net_salary=300)
        summary = employee_payroll_summary(self.employee, today=date(2026, 4, 15))
        self.assertEqual(summary['elapsed_months'], 3)
        self.assertEqual(summary['elapsed_days'], 91)
        self.assertEqual(summary['accrued_salary'], 3033.33)
        self.assertEqual(summary['total_payable'], 3033.33)
        self.assertEqual(summary['lifetime_paid'], 1450)
        self.assertEqual(summary['lifetime_remaining'], 1583.33)

    def test_period_net_uses_overtime_and_absence_entries(self):
        from api.models.data.employee_pay_entries import EmployeeAbsenceEntry, EmployeeOvertimeEntry

        EmployeeOvertimeEntry.objects.create(
            employee=self.employee, work_date=date(2026, 2, 10), amount=200,
            month='february', year=2026, period_calendar='gregorian', currency=1,
        )
        EmployeeAbsenceEntry.objects.create(
            employee=self.employee, absence_date=date(2026, 2, 11), days=1,
            entry_type=EmployeeAbsenceEntry.TYPE_ABSENCE,
            month='february', year=2026, period_calendar='gregorian', currency=1,
        )
        EmployeeAbsenceEntry.objects.create(
            employee=self.employee, absence_date=date(2026, 2, 12), days=0, amount=50,
            entry_type=EmployeeAbsenceEntry.TYPE_FOOD,
            month='february', year=2026, period_calendar='gregorian', currency=1,
        )
        summary = employee_payroll_summary(
            self.employee, month='february', year=2026, today=date(2026, 2, 28),
        )
        # monthly 1000 + OT 200 − absence (~33.33) − food 50 → net 1116.67
        self.assertEqual(summary['total_overtime'], 200.0)
        self.assertEqual(summary['total_absence_deductions'], 33.33)
        self.assertEqual(summary['total_food_deductions'], 50.0)
        self.assertEqual(summary['total_deductions'], 83.33)
        self.assertEqual(summary['absence_days'], 1.0)
        self.assertEqual(summary['net_salary'], 1116.67)
        self.assertEqual(summary['balance'], 1116.67)

    def test_accrual_stops_at_contract_end_and_excludes_future_and_deleted_payments(self):
        self.employee.contract_end_date = date(2026, 3, 14)
        self.employee.save()
        self.payment(payment_date=timezone.make_aware(datetime(2027, 1, 1, 12)))
        removed = self.payment(month='march')
        removed.soft_delete()
        summary = employee_payroll_summary(self.employee, today=date(2026, 6, 1))
        self.assertEqual(summary['elapsed_months'], 1)
        self.assertEqual(summary['elapsed_days'], 59)
        self.assertEqual(summary['accrued_salary'], 1966.67)
        self.assertEqual(summary['lifetime_paid'], 0)

    def test_period_filter_does_not_change_lifetime_totals(self):
        self.payment()
        self.payment(month='march')
        summary = employee_payroll_summary(self.employee, month='march', year=2026, today=date(2026, 4, 15))
        self.assertEqual(summary['total_paid'], 1000)
        self.assertEqual(summary['lifetime_paid'], 2000)
        self.assertEqual(summary['lifetime_remaining'], 1033.33)

    def test_missing_start_date_prevents_total_for_monthly_and_daily_pay(self):
        self.employee.contract_start_date = None
        summary = employee_payroll_summary(self.employee, today=date(2026, 4, 15))
        self.assertFalse(summary['accrual_available'])
        self.employee.salary_type = 'daily'
        summary = employee_payroll_summary(self.employee, today=date(2026, 4, 15))
        self.assertIsNone(summary['accrued_salary'])
        self.assertIsNone(summary['lifetime_remaining'])

    def test_future_end_date_uses_entire_contract_instead_of_today(self):
        self.employee.contract_end_date = date(2026, 4, 15)
        summary = employee_payroll_summary(self.employee, today=date(2026, 2, 1))
        self.assertEqual(summary['accrual_through'], '2026-04-15')
        self.assertEqual(summary['elapsed_days'], 91)
        self.assertEqual(summary['accrued_salary'], 3033.33)

    def test_without_end_date_uses_today_and_counts_both_endpoints(self):
        summary = employee_payroll_summary(self.employee, today=date(2026, 1, 20))
        self.assertEqual(summary['accrual_through'], '2026-01-20')
        self.assertEqual(summary['elapsed_days'], 6)
        self.assertEqual(summary['accrued_salary'], 200)
        same_day = employee_payroll_summary(self.employee, today=date(2026, 1, 15))
        self.assertEqual(same_day['elapsed_days'], 1)
        self.assertEqual(same_day['accrued_salary'], 33.33)
        before_start = employee_payroll_summary(self.employee, today=date(2026, 1, 14))
        self.assertEqual(before_start['elapsed_days'], 0)
        self.assertEqual(before_start['accrued_salary'], 0)

    def test_daily_salary_multiplies_all_days_including_leap_day(self):
        self.employee.salary_type = 'daily'
        self.employee.salary = Decimal('100')
        self.employee.contract_start_date = date(2024, 2, 28)
        self.employee.contract_end_date = date(2024, 3, 1)
        summary = employee_payroll_summary(self.employee, today=date(2024, 2, 28))
        self.assertTrue(summary['accrual_available'])
        self.assertEqual(summary['elapsed_days'], 3)
        self.assertEqual(summary['accrued_salary'], 300)
        self.assertEqual(summary['lifetime_remaining'], 300)

    def test_other_agreed_pay_is_not_treated_as_a_daily_rate(self):
        self.employee.salary_type = 'other'
        summary = employee_payroll_summary(self.employee, today=date(2026, 4, 15))
        self.assertFalse(summary['accrual_available'])
        self.assertIsNone(summary['accrued_salary'])

    def test_daily_period_net_includes_calendar_days_times_rate(self):
        from api.models.data.employee_pay_entries import EmployeeAbsenceEntry, EmployeeOvertimeEntry

        self.employee.salary_type = 'daily'
        self.employee.salary = Decimal('100')
        self.employee.contract_start_date = date(2026, 2, 1)
        self.employee.save()
        EmployeeOvertimeEntry.objects.create(
            employee=self.employee, work_date=date(2026, 2, 10), amount=50,
            month='february', year=2026, period_calendar='gregorian', currency=1,
        )
        EmployeeAbsenceEntry.objects.create(
            employee=self.employee, absence_date=date(2026, 2, 11), days=1,
            entry_type=EmployeeAbsenceEntry.TYPE_ABSENCE,
            month='february', year=2026, period_calendar='gregorian', currency=1,
        )
        summary = employee_payroll_summary(
            self.employee, month='february', year=2026, today=date(2026, 2, 28),
        )
        # 28 days × 100 + OT 50 − absence 100 = 2750
        self.assertEqual(summary['net_salary'], 2750.0)
        self.assertEqual(summary['total_overtime'], 50.0)
        self.assertEqual(summary['total_deductions'], 100.0)


class PayrollAdjustmentsAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(create_staff_user(
            username='adjustments', email='adjustments@example.com', as_admin=True,
        ))
        self.employee = Employee.objects.create(
            full_name='Payroll employee', phone='0700000001', salary=1000,
            currency=1, contract_start_date=date(2026, 1, 1),
        )

    def create_payment(self, **overrides):
        data = dict(
            employee=self.employee.pk, month='february', year=2026, currency=1,
            gross_amount='1000', manual_net=True, overtime='200', bonus='100', salary_deduction='50',
            payment_date='2026-02-01T12:00:00Z',
        )
        data.update(overrides)
        response = self.client.post('/api/payrolls/', data, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_create_edit_and_notes_only_patch_do_not_double_apply_adjustments(self):
        data = self.create_payment()
        self.assertEqual(Decimal(data['net_salary']), Decimal('1250'))
        self.assertEqual(Decimal(data['net_salary_base']), Decimal('1250'))
        url = f"/api/payrolls/{data['id']}/"
        changed = self.client.patch(url, {'salary_deduction': '100'}, format='json')
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(Decimal(changed.data['amount']), Decimal('1200'))
        notes = self.client.patch(url, {'notes': 'no recalculation drift'}, format='json')
        self.assertEqual(Decimal(notes.data['amount']), Decimal('1200'))
        self.assertEqual(Decimal(notes.data['deductions_base']), Decimal('100'))
        journal = JournalEntry.objects.get(
            content_type=ContentType.objects.get_for_model(Payroll), object_id=data['id'],
        )
        self.assertEqual(journal.total_debit, Decimal('1200'))
        self.assertEqual(journal.total_credit, Decimal('1200'))

    def test_editing_legacy_manual_adjustments_infers_gross_once(self):
        payroll = Payroll.objects.create(
            employee=self.employee, month='march', year=2026, currency=1,
            manual_net=True, amount=800, net_salary=800,
        )
        url = f'/api/payrolls/{payroll.pk}/'
        response = self.client.patch(url, {'overtime': 100, 'salary_deduction': 50}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(response.data['gross_amount']), Decimal('800'))
        self.assertEqual(Decimal(response.data['amount']), Decimal('850'))
        response = self.client.patch(url, {'notes': 'preserve calculation'}, format='json')
        self.assertEqual(Decimal(response.data['amount']), Decimal('850'))

    def test_daily_adjustments_and_absence_are_calculated_on_server(self):
        self.employee.salary_type = 'daily'
        self.employee.salary = 100
        self.employee.save()
        data = self.create_payment(manual_net=False, working_days=10, deduction_days=2, net_salary=1)
        self.assertEqual(Decimal(data['net_salary']), Decimal('1050'))
        self.assertEqual(Decimal(data['deductions']), Decimal('250'))
        self.assertEqual(Decimal(data['net_salary_base']), Decimal('1050'))

    def test_monthly_manual_payment_preserves_absence_and_monetary_deductions(self):
        data = self.create_payment(working_days=20, deduction_days=2)
        self.assertEqual(Decimal(data['deductions']), Decimal('150'))
        self.assertEqual(Decimal(data['net_salary']), Decimal('1150'))
        self.employee.salary_type = 'daily'
        self.employee.salary = 500
        self.employee.save()
        response = self.client.patch(
            f"/api/payrolls/{data['id']}/", {'notes': 'preserve historical salary basis'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['salary_type'], 'monthly')
        self.assertEqual(Decimal(response.data['basic_salary']), Decimal('1000'))
        self.assertEqual(Decimal(response.data['amount']), Decimal('1150'))

    def test_invalid_adjustments_are_rejected_without_payment(self):
        for overrides in ({'overtime': '-1'}, {'salary_deduction': '5000'}, {'deduction_days': 31, 'working_days': 30}, {'payroll_type': 'advance'}):
            with self.subTest(overrides=overrides):
                payload = dict(employee=self.employee.pk, month='february', year=2026, currency=1,
                               gross_amount=1000, manual_net=True, overtime=10)
                payload.update(overrides)
                response = self.client.post('/api/payrolls/', payload, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(Payroll.objects.count(), 0)

    def test_history_is_paginated_scoped_and_excludes_deleted_records(self):
        first = self.create_payment()
        self.create_payment(month='march')
        other = Employee.objects.create(full_name='Other worker', phone='07000', salary=10, currency=1)
        self.create_payment(employee=other.pk)
        url = f'/api/employees/{self.employee.pk}/payroll_history/'
        page1 = self.client.get(url, {'page_size': 1})
        page2 = self.client.get(url, {'page_size': 1, 'page': 2})
        self.assertEqual(page1.status_code, 200, page1.data)
        self.assertEqual(page1.data['count'], 2)
        self.assertNotEqual(page1.data['results'][0]['id'], page2.data['results'][0]['id'])
        Payroll.objects.get(pk=first['id']).soft_delete()
        self.assertEqual(self.client.get(url, {'page_size': 10}).data['count'], 1)
        filtered = self.client.get('/api/payrolls/', {'employee': other.pk, 'month': 'february', 'page_size': 10})
        self.assertEqual(filtered.data['count'], 1)

    def test_employee_list_and_summary_agree_on_cumulative_balance(self):
        self.create_payment()
        summary = self.client.get(f'/api/employees/{self.employee.pk}/financial_summary/').data
        listing = self.client.get('/api/employees/', {'page_size': 10}).data['results'][0]
        self.assertEqual(listing['payment_summary']['lifetime_remaining'], summary['lifetime_remaining'])
        self.assertEqual(summary['lifetime_paid'], 1250)

    def test_employee_list_uses_all_contract_days_for_total_and_remaining(self):
        self.employee.salary = 3000
        self.employee.contract_end_date = date(2026, 1, 31)
        self.employee.save()
        listing = self.client.get('/api/employees/', {'page_size': 10}).data['results'][0]
        summary = listing['payment_summary']
        self.assertEqual(summary['elapsed_days'], 31)
        self.assertEqual(summary['daily_rate'], 100)
        self.assertEqual(summary['accrued_salary'], 3100)
        self.assertEqual(summary['lifetime_remaining'], 3100)

    def test_payroll_period_calendar_is_saved_filtered_and_used_for_period_balances(self):
        legacy = self.create_payment(month='january', year=1405)
        solar = self.create_payment(month='january', year=1405, period_calendar='jalali')
        self.assertEqual(legacy['period_calendar'], 'gregorian')
        self.assertEqual(solar['period_calendar'], 'jalali')
        filtered = self.client.get('/api/payrolls/', {
            'period_calendar': 'jalali', 'year': 1405, 'month': 'january', 'page_size': 10,
        })
        self.assertEqual(filtered.data['count'], 1)
        self.assertEqual(filtered.data['results'][0]['id'], solar['id'])
        summary = self.client.get(f'/api/employees/{self.employee.pk}/financial_summary/', {
            'period_calendar': 'jalali', 'year': 1405, 'month': 'january',
        })
        self.assertEqual(summary.status_code, 200, summary.data)
        self.assertEqual(summary.data['total_paid'], 1250)
        self.assertEqual(summary.data['lifetime_paid'], 2500)
        # Multiple salary settlements in the same period are allowed.
        second_salary = self.client.post('/api/payrolls/', {
            'employee': self.employee.pk, 'month': 'january', 'year': 1405,
            'period_calendar': 'jalali', 'payroll_type': 'salary',
            'currency': 1, 'gross_amount': '500', 'amount': '500',
            'net_salary': '500', 'manual_net': True,
            'bonus': '0', 'overtime': '0', 'salary_deduction': '0',
        }, format='json')
        self.assertEqual(second_salary.status_code, 201, second_salary.data)
        summary2 = self.client.get(f'/api/employees/{self.employee.pk}/financial_summary/', {
            'period_calendar': 'jalali', 'year': 1405, 'month': 'january',
        })
        self.assertEqual(summary2.data['total_paid'], 1750)

    def test_multiple_salary_and_advance_payments_same_period_including_overpay(self):
        first = self.create_payment(
            payroll_type='advance', month='july', year=1405,
            period_calendar='jalali', gross_amount=None, overtime='0',
            bonus='0', salary_deduction='0', amount='200', net_salary='200',
            manual_net=True,
        )
        second = self.client.post('/api/payrolls/', {
            'employee': self.employee.pk, 'month': 'july', 'year': 1405,
            'period_calendar': 'jalali', 'payroll_type': 'advance',
            'currency': 1, 'amount': '150', 'net_salary': '150', 'manual_net': True,
        }, format='json')
        self.assertEqual(second.status_code, 201, second.data)
        self.assertNotEqual(first['id'], second.data['id'])

        salary1 = self.create_payment(
            month='july', year=1405, period_calendar='jalali',
            overtime='0', bonus='0', salary_deduction='0',
            gross_amount='600', amount='600', net_salary='600',
        )
        salary2 = self.client.post('/api/payrolls/', {
            'employee': self.employee.pk, 'month': 'july', 'year': 1405,
            'period_calendar': 'jalali', 'payroll_type': 'salary',
            'currency': 1, 'gross_amount': '800', 'amount': '800',
            'net_salary': '800', 'manual_net': True,
            'bonus': '0', 'overtime': '0', 'salary_deduction': '0',
        }, format='json')
        self.assertEqual(salary2.status_code, 201, salary2.data)
        self.assertNotEqual(salary1['id'], salary2.data['id'])

        # Overpayment above monthly salary is allowed; balance goes negative.
        summary = self.client.get(f'/api/employees/{self.employee.pk}/financial_summary/', {
            'period_calendar': 'jalali', 'year': 1405, 'month': 'july',
        })
        self.assertEqual(summary.status_code, 200, summary.data)
        # paid: advance 200+150 + salary 600+800 = 1750; net = monthly salary (1000)
        self.assertEqual(summary.data['total_paid'], 1750)
        self.assertEqual(summary.data['net_salary'], 1000)
        self.assertEqual(summary.data['balance'], -750)

    def test_advance_allowed_when_salary_exists_for_same_shamsi_period(self):
        self.create_payment(
            month='august', year=1405, period_calendar='jalali',
            overtime='0', bonus='0', salary_deduction='0',
        )
        advance = self.client.post('/api/payrolls/', {
            'employee': self.employee.pk, 'payroll_type': 'advance',
            'month': 'august', 'year': 1405, 'period_calendar': 'jalali',
            'currency': 1, 'amount': '200', 'net_salary': '200', 'manual_net': True,
            'notes': 'test',
        }, format='json')
        self.assertEqual(advance.status_code, 201, advance.data)
        self.assertEqual(advance.data['payroll_type'], 'advance')
