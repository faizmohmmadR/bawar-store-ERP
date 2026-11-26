"""Section reports must match list totals when AFN *_base fields are missing."""
from datetime import datetime
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework.test import APITestCase

from api.models.data.expenses import Expense, ExpenseCategory
from api.models.data.loan import Loan, LoanPayment
from api.models.data.payment import Payment
from api.models.data.payroll import Payroll
from api.models.data.purchases import Purchase
from api.models.data.vendors import Vendor
from api.models.data.warehouse import Warehouse
from api.services.accounting.coa import ensure_accounting_ready
from api.services.expense_report import get_expense_report
from api.services.hr_report import get_hr_report
from api.services.loan_report import get_loan_report
from api.services.purchase_report import get_purchase_report
from api.tests.accounting.helpers import AFN, create_staff_user


WHEN = timezone.make_aware(datetime(2026, 11, 26, 12, 0, 0))
DAY = WHEN.date()


class SectionReportAfnFallbackTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        ensure_accounting_ready(currency_id=AFN)
        cls.user = create_staff_user(
            username='afn-fallback', email='afn-fallback@test.local', as_admin=True,
        )

    def test_expense_hr_loan_purchase_match_with_zero_amount_base(self):
        category = ExpenseCategory.objects.create(name='Ops')
        Expense.objects.create(
            category=category,
            amount=Decimal('250'),
            amount_base=Decimal('0'),
            currency=AFN,
            payment_method='cash',
            expense_date=WHEN,
            description='seed expense',
        )
        expense_report = get_expense_report(start_date=DAY, end_date=DAY)
        self.assertEqual(expense_report['kpis']['total_afn'], 250.0)
        self.assertEqual(expense_report['kpis']['expense_count'], 1)

        from api.models.data.employee import Employee
        employee = Employee.objects.create(
            full_name='Fallback Emp',
            phone='0700111222',
            salary=Decimal('5000'),
            currency=AFN,
            contract_start_date=DAY.replace(month=1, day=1),
            is_active=True,
        )
        Payroll.objects.create(
            employee=employee,
            payroll_type='salary',
            month='november',
            year=2026,
            currency=AFN,
            payment_method='cash',
            payment_date=WHEN,
            manual_net=True,
            amount=Decimal('1200'),
            amount_base=Decimal('0'),
            net_salary=Decimal('1200'),
            net_salary_base=Decimal('0'),
        )
        hr_report = get_hr_report(start_date=DAY, end_date=DAY)
        self.assertEqual(hr_report['kpis']['salary_paid_afn'], 1200.0)
        self.assertEqual(hr_report['kpis']['active_headcount'], 1)

        from api.models.data.customers import Customer
        customer = Customer.objects.create(name='Loan Cust', is_active=True)
        loan = Loan.objects.create(
            loaner_type='customer',
            customer=customer,
            amount=Decimal('800'),
            amount_base=Decimal('0'),
            currency=AFN,
            loan_type='loan_out',
            payment_method='cash',
            loan_date=WHEN,
        )
        payment = LoanPayment.objects.create(
            loan=loan,
            amount=Decimal('200'),
            payment_method='cash',
            payment_date=WHEN,
        )
        # Force missing base to prove report falls back to native AFN amount.
        LoanPayment.objects.filter(pk=payment.pk).update(amount_base=Decimal('0'))
        Loan.objects.filter(pk=loan.pk).update(amount_base=Decimal('0'), amount_paid_base=Decimal('0'))
        loan_report = get_loan_report(start_date=DAY, end_date=DAY)
        self.assertEqual(loan_report['kpis']['owed_to_me_total_afn'], 800.0)
        self.assertEqual(loan_report['kpis']['owed_to_me_paid_afn'], 200.0)
        self.assertEqual(loan_report['kpis']['owed_to_me_balance_afn'], 600.0)

        warehouse = Warehouse.objects.create(code='WH1', name='WH1', is_default=True, is_active=True)
        vendor = Vendor.objects.create(name='Pay Vendor', is_active=True)
        purchase = Purchase.objects.create(
            vendor=vendor,
            warehouse=warehouse,
            purchase_date=WHEN,
            status='received',
            currency=AFN,
            total_amount=Decimal('1000'),
            total_amount_base=Decimal('1000'),
            paid_amount=Decimal('0'),
        )
        Payment.objects.create(
            content_type=ContentType.objects.get_for_model(purchase),
            object_id=purchase.pk,
            payment_type='purchase',
            payment_method='cash',
            payment_date=WHEN,
            amount=Decimal('400'),
            amount_base=Decimal('0'),
            currency=AFN,
        )
        purchase.paid_amount = Decimal('400')
        purchase.save(update_fields=['paid_amount'])

        purchase_report = get_purchase_report(start_date=DAY, end_date=DAY)
        self.assertEqual(purchase_report['kpis']['billed_afn'], 1000.0)
        self.assertEqual(purchase_report['kpis']['paid_afn'], 400.0)
        self.assertEqual(purchase_report['kpis']['unpaid_afn'], 600.0)
        self.assertEqual(purchase_report['kpis']['invoice_count'], 1)
