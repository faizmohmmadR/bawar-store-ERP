from datetime import datetime, timezone as dt_timezone

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from api.models.data.customers import Customer
from api.models.data.employee import Employee
from api.models.data.expenses import Expense, ExpenseCategory
from api.models.data.journal import JournalEntry
from api.models.data.payment import Payment
from api.models.data.payroll import Payroll
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.sales import Sales
from api.models.data.salesman_commission_payment import SalesmanCommissionPayment
from api.models.data.salesmen import Salesman
from api.models.data.vendors import Vendor

WHEN = datetime(2026, 11, 1, 12, tzinfo=dt_timezone.utc)


class SoftDeletedSourceJournalTests(TestCase):
    def linked_journal(self, source):
        return JournalEntry.objects.create(
            content_type=ContentType.objects.get_for_model(source), object_id=source.pk,
            entry_date=WHEN, is_auto=True,
        )

    def test_soft_deleted_sale_and_purchase_remove_auto_journals(self):
        customer = Customer.objects.create(name='Soft delete customer')
        vendor = Vendor.objects.create(name='Soft delete vendor')
        sale = Sales.objects.bulk_create([Sales(customer=customer, invoice_number='SOFT-SALE',
            total_amount=10, currency=1, status='confirmed', sale_date=WHEN)])[0]
        purchase = RawMaterialPurchase.objects.bulk_create([RawMaterialPurchase(
            vendor=vendor, invoice_number='SOFT-PURCHASE', purchase_date=WHEN,
            currency=1, total_amount=10, status='received')])[0]
        journals = [self.linked_journal(sale), self.linked_journal(purchase)]
        sale.soft_delete()
        purchase.soft_delete()
        self.assertFalse(JournalEntry.objects.filter(pk__in=[row.pk for row in journals]).exists())

    def test_soft_deleted_payment_and_commission_remove_auto_journals(self):
        customer = Customer.objects.create(name='Soft delete customer')
        salesman = Salesman.objects.create(name='Soft delete salesman')
        sale = Sales.objects.bulk_create([Sales(customer=customer, invoice_number='SOFT-PAY-SALE',
            total_amount=10, currency=1, status='confirmed', sale_date=WHEN)])[0]
        payment = Payment.objects.bulk_create([Payment(content_type=ContentType.objects.get_for_model(sale),
            object_id=sale.pk, payment_type='sale', amount=5, currency=1,
            payment_date=WHEN)])[0]
        commission = SalesmanCommissionPayment.objects.bulk_create([SalesmanCommissionPayment(
            salesman=salesman, amount=2, currency=1, payment_date=WHEN)])[0]
        journals = [self.linked_journal(payment), self.linked_journal(commission)]
        payment.soft_delete()
        commission.soft_delete()
        self.assertFalse(JournalEntry.objects.filter(pk__in=[row.pk for row in journals]).exists())

    def test_soft_deleted_payroll_and_expense_remove_auto_journals(self):
        employee = Employee.objects.create(
            full_name='Soft delete payroll', phone='0700111222', salary=1000, currency=1,
        )
        category = ExpenseCategory.objects.create(name='Soft delete category')
        payroll = Payroll.objects.bulk_create([Payroll(
            employee=employee, month='november', year=2026, currency=1,
            payment_date=WHEN, basic_salary=1000, manual_net=True,
            gross_amount=1000, amount=1000, net_salary=1000,
        )])[0]
        expense = Expense.objects.bulk_create([Expense(
            category=category, amount=50, currency=1, expense_date=WHEN,
            description='Soft delete expense', payment_method='cash',
        )])[0]
        journals = [self.linked_journal(payroll), self.linked_journal(expense)]
        payroll.soft_delete()
        expense.soft_delete()
        self.assertFalse(JournalEntry.objects.filter(pk__in=[row.pk for row in journals]).exists())
