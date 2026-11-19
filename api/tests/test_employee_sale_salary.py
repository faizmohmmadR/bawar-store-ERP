"""Employee product sales settle as paid salary (goods) on the sale date."""
from decimal import Decimal

from django.test import TestCase

from api.models.data.employee import Employee
from api.models.data.payroll import Payroll
from api.models.data.returns import Return
from api.models.data.sales import Sales
from api.tests import test_raw_material_sales as fixtures
from api.tests.accounting.helpers import journal_for_source
from api.utils.calendar_period import payroll_period_from_datetime


class EmployeeSaleSalaryTests(TestCase):
    setUp = fixtures.RawMaterialSalesTests.setUp

    def employee(self, **overrides):
        data = dict(
            full_name='Salary Worker',
            phone='0700111222',
            salary=Decimal('15000'),
            currency=1,
            salary_type='monthly',
        )
        data.update(overrides)
        return Employee.objects.create(**data)

    def employee_sale(self, employee, price=80, quantity=5, **overrides):
        data = {
            'employee': employee.pk,
            'customer': None,
            'vendor': None,
            'currency': 1,
            'status': 'confirmed',
            'sale_date': '2026-03-15T10:00:00Z',
            'period_calendar': 'jalali',
            'sales_items': [{
                'sale_source': 'raw_material',
                'raw_material_stock': self.stock.pk,
                'quantity': quantity,
                'unit': 'kg',
                'sell_price': price,
            }],
        }
        data.update(overrides)
        return self.client.post('/api/raw-material-sales/', data, format='json')

    def test_employee_sale_creates_goods_payroll_for_sale_date_period(self):
        employee = self.employee()
        response = self.employee_sale(employee)
        self.assertEqual(response.status_code, 201, response.data)

        sale = Sales.objects.get(pk=response.data['id'])
        self.assertEqual(sale.employee_id, employee.pk)
        self.assertIsNone(sale.customer_id)
        self.assertEqual(sale.total_amount, Decimal('400.0000'))
        self.assertEqual(sale.paid_amount, Decimal('400.0000'))
        self.assertEqual(response.data.get('remaining_amount'), 0)
        self.assertIsNotNone(response.data.get('salary_settlement_id'))
        self.assertEqual(response.data['employee_details']['full_name'], 'Salary Worker')

        payroll = Payroll.objects.get(source_sale=sale)
        period = payroll_period_from_datetime(sale.sale_date, 'jalali')
        self.assertEqual(payroll.employee_id, employee.pk)
        self.assertEqual(payroll.payroll_type, Payroll.PAYROLL_TYPE_SALARY)
        self.assertEqual(payroll.payment_method, Payroll.PAYMENT_GOODS)
        self.assertEqual(payroll.amount, Decimal('400.00'))
        self.assertEqual(payroll.net_salary, Decimal('400.00'))
        self.assertEqual(payroll.month, period['month'])
        self.assertEqual(payroll.year, period['year'])
        self.assertEqual(payroll.period_calendar, 'jalali')
        self.assertEqual(payroll.payment_date, sale.sale_date)
        self.assertEqual(payroll.reference_number, sale.invoice_number)

        # Sale journal: payroll expense ↔ revenue (no AR / cash). No separate payroll journal.
        codes = set(journal_for_source(sale).lines.values_list('gl_account__code', flat=True))
        self.assertIn('4000', codes)  # sales revenue
        self.assertIn('5100', codes)  # payroll expense (salary in goods)
        self.assertNotIn('1200', codes)  # AR
        self.assertNotIn('1000', codes)  # cash
        self.assertIsNone(journal_for_source(payroll))

        # The new read-only reconciliation must accept the real API workflow,
        # including its COGS lines, without treating goods as cash payroll.
        from api.services.reporting.contracts import ReportScope
        from api.services.reporting.reconciliation import reconcile_documents
        reconciliation = reconcile_documents(ReportScope())
        payroll_findings = [row for row in reconciliation['findings']
                            if row['source_model'] == 'payroll' and row['source_id'] == payroll.pk]
        self.assertEqual(payroll_findings, [])

        from api.services.employee_payroll import employee_payroll_summary
        summary = employee_payroll_summary(
            employee,
            month=period['month'],
            year=period['year'],
            period_calendar='jalali',
        )
        # Goods settlement counts as paid salary and reduces period balance.
        self.assertEqual(Decimal(str(summary['paid_salary'])), Decimal('400'))
        self.assertEqual(Decimal(str(summary['total_paid'])), Decimal('400'))
        self.assertEqual(
            Decimal(str(summary['balance'])),
            Decimal(str(summary['net_salary'])) - Decimal('400'),
        )

    def test_future_dated_goods_settlement_still_reduces_period_balance(self):
        """Sale datetime slightly ahead of 'today' must still affect Paid / Balance."""
        from datetime import timedelta
        from django.utils import timezone
        from api.services.employee_payroll import employee_payroll_summary

        employee = self.employee(salary=Decimal('10000'))
        future = timezone.now() + timedelta(days=1)
        response = self.employee_sale(
            employee,
            sale_date=future.isoformat().replace('+00:00', 'Z'),
        )
        self.assertEqual(response.status_code, 201, response.data)
        sale = Sales.objects.get(pk=response.data['id'])
        period = payroll_period_from_datetime(sale.sale_date, 'jalali')
        summary = employee_payroll_summary(
            employee,
            month=period['month'],
            year=period['year'],
            period_calendar='jalali',
            today=timezone.localdate(),
        )
        self.assertEqual(Decimal(str(summary['total_paid'])), Decimal('400'))
        self.assertEqual(
            Decimal(str(summary['balance'])),
            Decimal(str(summary['net_salary'])) - Decimal('400'),
        )

    def test_updating_employee_sale_amount_updates_payroll(self):
        employee = self.employee()
        created = self.employee_sale(employee, price=60, quantity=5)
        sale_id = created.data['id']
        response = self.client.patch(
            f'/api/raw-material-sales/{sale_id}/',
            {
                'sales_items': [{
                    'sale_source': 'raw_material',
                    'raw_material_stock': self.stock.pk,
                    'quantity': 10,
                    'unit': 'kg',
                    'sell_price': 50,
                }],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        sale = Sales.objects.get(pk=sale_id)
        payroll = Payroll.objects.get(source_sale=sale)
        self.assertEqual(sale.total_amount, Decimal('500.0000'))
        self.assertEqual(sale.paid_amount, Decimal('500.0000'))
        self.assertEqual(payroll.amount, Decimal('500.00'))
        self.assertEqual(Payroll.objects.filter(source_sale=sale).count(), 1)

    def test_cancelling_employee_sale_removes_payroll_settlement(self):
        employee = self.employee()
        created = self.employee_sale(employee)
        sale_id = created.data['id']
        self.assertTrue(Payroll.objects.filter(source_sale_id=sale_id).exists())

        response = self.client.patch(
            f'/api/raw-material-sales/{sale_id}/',
            {'status': 'cancelled'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(Payroll.objects.filter(source_sale_id=sale_id).exists())
        sale = Sales.objects.get(pk=sale_id)
        self.assertEqual(sale.paid_amount, 0)
        self.assertIsNone(journal_for_source(sale))

    def test_free_employee_sale_is_rejected(self):
        employee = self.employee()
        response = self.employee_sale(employee, transaction_type='free')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Payroll.objects.exists())

    def test_employee_and_customer_together_rejected(self):
        employee = self.employee()
        response = self.employee_sale(employee, customer=self.customer.pk)
        self.assertEqual(response.status_code, 400)

    def test_employee_goods_return_reduces_salary_settlement_without_cash_or_receivable(self):
        employee = self.employee()
        created = self.employee_sale(employee, price=80, quantity=5)
        self.assertEqual(created.status_code, 201, created.data)
        sale = Sales.objects.get(pk=created.data['id'])

        response = self.client.post('/api/returns/', {
            'sales': sale.pk,
            'currency': 1,
            'return_items': [{
                'sales_item': sale.sales_items.get().pk,
                'quantity_kg': 2,
                'return_price': 80,
            }],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)

        sale.refresh_from_db()
        payroll = Payroll.objects.get(source_sale=sale)
        self.assertEqual(Decimal(str(response.data['total_amount'])), Decimal('160'))
        self.assertEqual(sale.paid_amount, Decimal('240.0000'))
        self.assertEqual(payroll.amount, Decimal('240.00'))

        returned = Return.objects.get(pk=response.data['id'])
        codes = set(journal_for_source(returned).lines.values_list('gl_account__code', flat=True))
        self.assertEqual(codes, {'4100', '5100', '1100', '5200'})
        self.assertNotIn('1200', codes)
        self.assertNotIn('1000', codes)

        from api.services.reporting.contracts import ReportScope
        from api.services.reporting.reconciliation import reconcile_documents
        result = reconcile_documents(ReportScope())
        findings = [row for row in result['findings']
                    if row['source_model'] == 'payroll' and row['source_id'] == payroll.pk]
        self.assertEqual(findings, [])

    def test_employee_goods_return_rejects_cash_refund(self):
        employee = self.employee()
        created = self.employee_sale(employee)
        sale = Sales.objects.get(pk=created.data['id'])
        response = self.client.post('/api/returns/', {
            'sales': sale.pk, 'currency': 1, 'refund_amount': 1,
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('refund_amount', response.data)
