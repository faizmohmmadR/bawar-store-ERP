"""Employee salary_type drives payroll calculation — model + UI-shaped API cases."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.employee import Employee
from api.models.data.payroll import Payroll
from api.tests.accounting.helpers import TXN_WHEN, create_staff_user

User = get_user_model()


class PayrollSalaryTypeModelTests(TestCase):
    def test_daily_payroll_is_rate_times_days(self):
        employee = Employee.objects.create(
            full_name='Daily Worker',
            phone='0700000001',
            salary=Decimal('500.00'),
            salary_type=Employee.SALARY_TYPE_DAILY,
            currency=BASE_CURRENCY_ID,
        )
        payroll = Payroll(
            employee=employee,
            payroll_type=Payroll.PAYROLL_TYPE_SALARY,
            month='august',
            year=2026,
            working_days=10,
            currency=BASE_CURRENCY_ID,
            payment_date=TXN_WHEN,
            manual_net=False,
        )
        payroll.save()
        self.assertEqual(payroll.salary_type, 'daily')
        self.assertEqual(payroll.basic_salary, Decimal('500.00'))
        self.assertEqual(payroll.net_salary, Decimal('5000.00'))
        self.assertEqual(payroll.amount, Decimal('5000.00'))
        self.assertEqual(payroll.amount_base, Decimal('5000.00'))
        self.assertEqual(payroll.net_salary_base, Decimal('5000.00'))

    def test_manual_net_save_refreshes_zeroed_amount_base(self):
        employee = Employee.objects.create(
            full_name='Base Repair Worker',
            phone='0700000099',
            salary=Decimal('2000.00'),
            salary_type=Employee.SALARY_TYPE_MONTHLY,
            currency=BASE_CURRENCY_ID,
        )
        payroll = Payroll.objects.create(
            employee=employee,
            payroll_type=Payroll.PAYROLL_TYPE_SALARY,
            month='october',
            year=2026,
            currency=BASE_CURRENCY_ID,
            payment_date=TXN_WHEN,
            amount=Decimal('1000.00'),
            net_salary=Decimal('1000.00'),
            manual_net=True,
        )
        Payroll.objects.filter(pk=payroll.pk).update(
            amount_base=Decimal('0'), net_salary_base=Decimal('0'), basic_salary_base=Decimal('0'),
        )
        payroll.refresh_from_db()
        self.assertEqual(payroll.amount_base, Decimal('0'))
        payroll.save()
        payroll.refresh_from_db()
        self.assertEqual(payroll.amount_base, Decimal('1000.00'))
        self.assertEqual(payroll.net_salary_base, Decimal('1000.00'))

    def test_daily_with_deduction_days(self):
        employee = Employee.objects.create(
            full_name='Daily Deduct',
            phone='0700000011',
            salary=Decimal('400.00'),
            salary_type=Employee.SALARY_TYPE_DAILY,
            currency=BASE_CURRENCY_ID,
        )
        payroll = Payroll(
            employee=employee,
            payroll_type=Payroll.PAYROLL_TYPE_SALARY,
            month='august',
            year=2026,
            working_days=20,
            deduction_days=2,
            currency=BASE_CURRENCY_ID,
            payment_date=TXN_WHEN,
            manual_net=False,
        )
        payroll.save()
        # 400 * (20-2) = 7200; deductions = 400*2 = 800
        self.assertEqual(payroll.deductions, Decimal('800.00'))
        self.assertEqual(payroll.net_salary, Decimal('7200.00'))

    def test_monthly_payroll_prorates_by_working_days(self):
        employee = Employee.objects.create(
            full_name='Monthly Staff',
            phone='0700000002',
            salary=Decimal('3000.00'),
            salary_type=Employee.SALARY_TYPE_MONTHLY,
            currency=BASE_CURRENCY_ID,
        )
        payroll = Payroll(
            employee=employee,
            payroll_type=Payroll.PAYROLL_TYPE_SALARY,
            month='august',
            year=2026,
            working_days=30,
            deduction_days=3,
            currency=BASE_CURRENCY_ID,
            payment_date=TXN_WHEN,
            manual_net=False,
        )
        payroll.save()
        self.assertEqual(payroll.salary_type, 'monthly')
        # 3000/30 * 27 = 2700
        self.assertEqual(payroll.net_salary, Decimal('2700.00'))

    def test_other_payroll_uses_posted_amount(self):
        employee = Employee.objects.create(
            full_name='Other Pay',
            phone='0700000003',
            salary=Decimal('1000.00'),
            salary_type=Employee.SALARY_TYPE_OTHER,
            currency=BASE_CURRENCY_ID,
        )
        payroll = Payroll(
            employee=employee,
            payroll_type=Payroll.PAYROLL_TYPE_SALARY,
            month='august',
            year=2026,
            amount=Decimal('750.00'),
            net_salary=Decimal('750.00'),
            currency=BASE_CURRENCY_ID,
            payment_date=TXN_WHEN,
            manual_net=True,
        )
        payroll.save()
        self.assertEqual(payroll.salary_type, 'other')
        self.assertEqual(payroll.amount, Decimal('750.00'))


class PayrollSalaryTypeAPITests(TestCase):
    """Insert employees + payrolls the same way the UI posts them."""

    def setUp(self):
        self.user = create_staff_user(
            username='payroll_ui_tester',
            email='payroll_ui_tester@example.com',
            as_admin=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _create_employee(self, **overrides):
        payload = {
            'full_name': 'Test Employee',
            'phone': '0700999000',
            'salary': '1000.00',
            'salary_type': 'monthly',
            'currency': BASE_CURRENCY_ID,
            'is_active': True,
            'contract_start_date': '2026-01-01',
        }
        payload.update(overrides)
        res = self.client.post('/api/employees/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        return res.data

    def _create_payroll(self, **payload):
        res = self.client.post('/api/payrolls/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        return res.data

    def test_employee_create_requires_a_nonempty_contract_start(self):
        for fields in ({}, {'contract_start_date': None}, {'contract_start_date': ''}):
            with self.subTest(fields=fields):
                response = self.client.post('/api/employees/', {
                    'full_name': 'Missing contract', 'phone': '0700999000', **fields,
                }, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn('contract_start_date', response.data)
                self.assertEqual(Employee.objects.count(), 0)

    def test_employee_patch_preserves_start_date_and_rejects_clearing_it(self):
        employee = self._create_employee()
        url = f"/api/employees/{employee['id']}/"
        response = self.client.patch(url, {'notes': 'Updated'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['contract_start_date'], '2026-01-01')
        for value in (None, ''):
            response = self.client.patch(url, {'contract_start_date': value}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('contract_start_date', response.data)
        self.assertEqual(Employee.objects.get(pk=employee['id']).contract_start_date.isoformat(), '2026-01-01')

    def test_legacy_employee_requires_start_date_when_edited(self):
        employee = Employee.objects.create(full_name='Legacy employee', phone='0700999001')
        url = f'/api/employees/{employee.pk}/'
        response = self.client.patch(url, {'notes': 'Updated'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('contract_start_date', response.data)
        response = self.client.patch(url, {'contract_start_date': '2026-01-01'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['contract_start_date'], '2026-01-01')

    def test_ui_monthly_employee_and_partial_salary_payment(self):
        emp = self._create_employee(
            full_name='UI Monthly Ahmad',
            phone='0700111001',
            salary='20000.00',
            salary_type='monthly',
        )
        self.assertEqual(emp['salary_type'], 'monthly')

        summary = self.client.get(
            f"/api/employees/{emp['id']}/financial_summary/",
            {'month': 'october', 'year': '2026'},
        )
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertEqual(summary.data['salary_type'], 'monthly')
        self.assertEqual(float(summary.data['salary']), 20000.0)
        self.assertEqual(float(summary.data['total_remaining']), 20000.0)

        # UI posts remaining amount with manual_net=True for monthly
        payroll = self._create_payroll(
            employee=emp['id'],
            payroll_type='salary',
            salary_type='monthly',
            month='october',
            year=2026,
            amount='12000.00',
            net_salary='12000.00',
            basic_salary='20000.00',
            working_days=30,
            currency=BASE_CURRENCY_ID,
            payment_method='cash',
            payment_date=TXN_WHEN.isoformat(),
            manual_net=True,
        )
        self.assertEqual(payroll['salary_type'], 'monthly')
        self.assertEqual(Decimal(str(payroll['amount'])), Decimal('12000.00'))

        summary2 = self.client.get(
            f"/api/employees/{emp['id']}/financial_summary/",
            {'month': 'october', 'year': '2026'},
        )
        self.assertEqual(float(summary2.data['paid_salary']), 12000.0)
        self.assertEqual(float(summary2.data['salary_remaining']), 8000.0)
        self.assertEqual(float(summary2.data['total_remaining']), 8000.0)
        self.assertEqual(float(summary2.data['balance']), 8000.0)

    def test_ui_daily_employee_rate_times_days(self):
        emp = self._create_employee(
            full_name='UI Daily Karim',
            phone='0700111002',
            salary='500.00',
            salary_type='daily',
        )
        self.assertEqual(emp['salary_type'], 'daily')

        summary = self.client.get(f"/api/employees/{emp['id']}/financial_summary/")
        self.assertEqual(summary.data['salary_type'], 'daily')
        # Remaining balance is not used for daily workers
        self.assertEqual(float(summary.data['total_remaining']), 0.0)

        # UI: working_days = days worked, manual_net=False → 500 * 12
        payroll = self._create_payroll(
            employee=emp['id'],
            payroll_type='salary',
            salary_type='daily',
            month='october',
            year=2026,
            amount='6000.00',  # client preview; server recalculates
            net_salary='6000.00',
            basic_salary='500.00',
            working_days=12,
            currency=BASE_CURRENCY_ID,
            payment_method='cash',
            payment_date=TXN_WHEN.isoformat(),
            manual_net=False,
        )
        self.assertEqual(payroll['salary_type'], 'daily')
        self.assertEqual(Decimal(str(payroll['basic_salary'])), Decimal('500.00'))
        self.assertEqual(Decimal(str(payroll['amount'])), Decimal('6000.00'))
        self.assertEqual(Decimal(str(payroll['net_salary'])), Decimal('6000.00'))

    def test_ui_other_employee_manual_agreed_amount(self):
        emp = self._create_employee(
            full_name='UI Other Nazir',
            phone='0700111003',
            salary='1500.00',
            salary_type='other',
        )
        self.assertEqual(emp['salary_type'], 'other')

        summary = self.client.get(f"/api/employees/{emp['id']}/financial_summary/")
        self.assertEqual(summary.data['salary_type'], 'other')
        self.assertEqual(float(summary.data['total_remaining']), 0.0)

        # UI posts agreed amount with manual_net (serializer forces it for other)
        payroll = self._create_payroll(
            employee=emp['id'],
            payroll_type='salary',
            salary_type='other',
            month='october',
            year=2026,
            amount='750.00',
            net_salary='750.00',
            basic_salary='1500.00',
            currency=BASE_CURRENCY_ID,
            payment_method='bank',
            payment_date=TXN_WHEN.isoformat(),
            manual_net=True,
        )
        self.assertEqual(payroll['salary_type'], 'other')
        self.assertEqual(Decimal(str(payroll['amount'])), Decimal('750.00'))

    def test_ui_daily_days_override_wrong_preview_amount(self):
        """Server must recompute from rate × days even if client sends a wrong amount."""
        emp = self._create_employee(
            full_name='UI Daily Recalc',
            phone='0700111004',
            salary='250.00',
            salary_type='daily',
        )
        payroll = self._create_payroll(
            employee=emp['id'],
            payroll_type='salary',
            salary_type='daily',
            month='october',
            year=2026,
            amount='1.00',  # wrong preview
            net_salary='1.00',
            basic_salary='250.00',
            working_days=8,
            currency=BASE_CURRENCY_ID,
            payment_method='cash',
            payment_date=TXN_WHEN.isoformat(),
            manual_net=False,
        )
        self.assertEqual(Decimal(str(payroll['amount'])), Decimal('2000.00'))

    def test_ui_advance_for_monthly_reduces_remaining(self):
        emp = self._create_employee(
            full_name='UI Monthly Advance',
            phone='0700111005',
            salary='10000.00',
            salary_type='monthly',
        )
        self._create_payroll(
            employee=emp['id'],
            payroll_type='advance',
            salary_type='monthly',
            month='october',
            year=2026,
            amount='2000.00',
            net_salary='2000.00',
            basic_salary='10000.00',
            currency=BASE_CURRENCY_ID,
            payment_method='cash',
            payment_date=TXN_WHEN.isoformat(),
            manual_net=True,
        )
        summary = self.client.get(
            f"/api/employees/{emp['id']}/financial_summary/",
            {'month': 'october', 'year': '2026'},
        )
        self.assertEqual(float(summary.data['paid_advance']), 2000.0)
        self.assertEqual(float(summary.data['total_remaining']), 8000.0)

    def test_employee_list_includes_salary_type(self):
        self._create_employee(
            full_name='List Daily',
            phone='0700111006',
            salary='300.00',
            salary_type='daily',
        )
        res = self.client.get('/api/employees/', {'search': 'List Daily'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = res.data
        if isinstance(payload, dict):
            rows = payload.get('results', payload)
        else:
            rows = list(payload)
        match = next(r for r in rows if r.get('full_name') == 'List Daily')
        self.assertEqual(match['salary_type'], 'daily')
        self.assertEqual(match['payment_summary']['salary_type'], 'daily')

    def test_yearly_summary_months_and_signed_balance(self):
        emp = self._create_employee(
            full_name='Yearly Balance',
            phone='0700111007',
            salary='10000.00',
            salary_type='monthly',
        )
        self._create_payroll(
            employee=emp['id'],
            payroll_type='salary',
            salary_type='monthly',
            month='january',
            year=2026,
            amount='12000.00',
            net_salary='12000.00',
            basic_salary='10000.00',
            working_days=30,
            currency=BASE_CURRENCY_ID,
            payment_method='cash',
            payment_date=TXN_WHEN.isoformat(),
            manual_net=True,
        )
        self._create_payroll(
            employee=emp['id'],
            payroll_type='salary',
            salary_type='monthly',
            month='february',
            year=2026,
            amount='4000.00',
            net_salary='4000.00',
            basic_salary='10000.00',
            working_days=30,
            currency=BASE_CURRENCY_ID,
            payment_method='cash',
            payment_date=TXN_WHEN.isoformat(),
            manual_net=True,
        )

        yearly = self.client.get(
            f"/api/employees/{emp['id']}/yearly_summary/",
            {'year': '2026', 'period_calendar': 'gregorian'},
        )
        self.assertEqual(yearly.status_code, status.HTTP_200_OK, yearly.data)
        self.assertEqual(yearly.data['year'], 2026)
        self.assertEqual(len(yearly.data['months']), 12)

        january = next(row for row in yearly.data['months'] if row['month'] == 'january')
        february = next(row for row in yearly.data['months'] if row['month'] == 'february')
        self.assertEqual(float(january['salary']), 10000.0)
        self.assertEqual(float(january['paid']), 12000.0)
        self.assertEqual(float(january['balance']), -2000.0)
        self.assertEqual(float(february['paid']), 4000.0)
        self.assertEqual(float(february['balance']), 6000.0)
        self.assertEqual(float(yearly.data['totals']['salary']), 120000.0)
        self.assertEqual(float(yearly.data['totals']['paid']), 16000.0)
        self.assertEqual(float(yearly.data['totals']['balance']), 104000.0)
