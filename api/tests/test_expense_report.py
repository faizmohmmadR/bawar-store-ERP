"""Section report for Expenses — native by currency, category, payment method."""
from decimal import Decimal

from django.test import TestCase

from api.models.data.expenses import Expense, ExpenseCategory
from api.services.currency_conversion import populate_base_amounts
from api.services.expense_report import get_expense_report
from api.tests.accounting.helpers import TXN_WHEN, USD, create_exchange_rate


class ExpenseReportTests(TestCase):
    def setUp(self):
        create_exchange_rate(from_currency=USD, rate=Decimal('80'), when=TXN_WHEN)
        self.utilities = ExpenseCategory.objects.create(name='Utilities')
        self.rent = ExpenseCategory.objects.create(name='Rent')

        cash = Expense(
            category=self.utilities,
            amount=Decimal('100.00'),
            currency=USD,
            payment_method=Expense.PAYMENT_CASH,
            expense_date=TXN_WHEN,
            description='USD power bill',
        )
        populate_base_amounts(cash, amount_fields=['amount'], at_datetime=TXN_WHEN)
        cash.save()

        bank = Expense(
            category=self.rent,
            amount=Decimal('5000.00'),
            currency=1,
            payment_method=Expense.PAYMENT_BANK,
            expense_date=TXN_WHEN,
            description='AFN rent',
        )
        populate_base_amounts(bank, amount_fields=['amount'], at_datetime=TXN_WHEN)
        bank.save()

        sarafi = Expense(
            category=self.utilities,
            amount=Decimal('50.00'),
            currency=USD,
            payment_method=Expense.PAYMENT_SARAFI,
            expense_date=TXN_WHEN,
            description='USD supplies',
        )
        populate_base_amounts(sarafi, amount_fields=['amount'], at_datetime=TXN_WHEN)
        sarafi.save()

    def test_expense_report_native_by_currency(self):
        report = get_expense_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        self.assertEqual(report['report_type'], 'expenses')
        kpis = report['kpis']
        self.assertEqual(kpis['expense_count'], 3)
        self.assertEqual(kpis['category_count'], 2)
        self.assertEqual(kpis['currency_count'], 2)
        # 100 USD + 50 USD at 80 = 12000 AFN, plus 5000 AFN
        self.assertEqual(kpis['total_afn'], 17000.0)
        self.assertEqual(kpis['cash_afn'], 8000.0)
        self.assertEqual(kpis['bank_afn'], 5000.0)
        self.assertEqual(kpis['sarafi_afn'], 4000.0)

        usd = report['by_currency']['USD']
        self.assertEqual(usd['count'], 2)
        self.assertEqual(usd['total_native'], 150.0)
        self.assertEqual(usd['cash_native'], 100.0)
        self.assertEqual(usd['sarafi_native'], 50.0)
        self.assertEqual(usd['total_afn'], 12000.0)

        afn = report['by_currency']['AFN']
        self.assertEqual(afn['count'], 1)
        self.assertEqual(afn['total_native'], 5000.0)
        self.assertEqual(afn['bank_native'], 5000.0)

        categories = {
            (row['name'], row['currency_code']): row
            for row in report['by_category']
        }
        self.assertEqual(categories[('Utilities', 'USD')]['total_native'], 150.0)
        self.assertEqual(categories[('Rent', 'AFN')]['total_native'], 5000.0)

        methods = {
            (row['payment_method'], row['currency_code']): row
            for row in report['by_payment_method']
        }
        self.assertEqual(methods[('cash', 'USD')]['total_native'], 100.0)
        self.assertEqual(methods[('bank', 'AFN')]['total_native'], 5000.0)
        self.assertEqual(len(report['expenses']), 3)
