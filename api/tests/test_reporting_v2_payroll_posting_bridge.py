from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.employee import Employee
from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.models.data.payroll import Payroll
from api.models.data.returns import Return
from api.models.data.sales import Sales
from api.services.reporting.contracts import ReportScope
from api.services.reporting.payroll_posting_bridge import payroll_posting_bridge
from api.tests.accounting.helpers import create_staff_user


class PayrollPostingBridgeV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='paybridgeadmin', email='paybridge@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.employee = Employee.objects.create(full_name='Payroll Bridge', salary=1200, currency=1)
        self.when = datetime(2026, 8, 1, 12, tzinfo=dt_timezone.utc)

    def account(self, code, category):
        account, _ = GLAccount.objects.get_or_create(code=code, currency=1,
            defaults={'name': code, 'category': category})
        return account

    def journal(self, source, postings):
        entry = JournalEntry.objects.create(entry_date=self.when,
            content_type=ContentType.objects.get_for_model(source), object_id=source.pk)
        JournalLine.objects.bulk_create([
            JournalLine(journal_entry=entry, gl_account=self.account(code, category), currency=1,
                        debit=debit, credit=credit, base_debit=debit, base_credit=credit,
                        exchange_rate=1)
            for code, category, debit, credit in postings
        ])
        return entry

    def payroll(self, amount, kind='salary', when=None):
        return Payroll.objects.create(employee=self.employee, month='august', year=2026,
            currency=1, payroll_type=kind, payment_method='cash', amount=amount,
            net_salary=amount, amount_base=amount, net_salary_base=amount,
            manual_net=True, payment_date=when or self.when)

    def test_money_salary_and_advance_match_distinct_accounts(self):
        salary = self.payroll(100)
        advance = self.payroll(30, kind='advance')
        row = payroll_posting_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['salary_paid_money'], row['salary_gl_posted'],
                          row['salary_posting_difference'], row['advance_paid_money'],
                          row['advance_gl_posted'], row['advance_posting_difference']),
                         ('100.00', '100.00', '0.00', '30.00', '30.00', '0.00'))
        self.assertEqual((row['salary_line_count'], row['advance_line_count']), (1, 1))

    def test_goods_sale_and_return_have_one_net_salary_posting(self):
        sale = Sales.objects.bulk_create([Sales(employee=self.employee, invoice_number='PAY-GOODS-BRIDGE',
            sale_date=self.when, currency=1, status='confirmed', total_amount=100)])[0]
        Payroll.objects.bulk_create([Payroll(employee=self.employee, source_sale=sale,
            month='august', year=2026, currency=1, amount=80, net_salary=80,
            payment_method='goods', payment_date=self.when) ])
        self.journal(sale, [('5100', 'expense', 100, 0), ('4000', 'revenue', 0, 100)])
        returned = Return.objects.bulk_create([Return(sales=sale, return_number='PAY-GOODS-RETURN',
            return_date=self.when, currency=1, total_amount=20)])[0]
        self.journal(returned, [('4100', 'revenue', 20, 0), ('5100', 'expense', 0, 20)])
        row = payroll_posting_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['salary_paid_goods'], row['salary_gl_posted'],
                          row['salary_posting_difference'], row['salary_paid_money']),
                         ('80.00', '80.00', '0.00', '0.00'))
        self.assertEqual(row['salary_line_count'], 2)

    def test_missing_posting_and_manual_expense_are_distinct(self):
        salary = self.payroll(100)
        JournalLine.objects.filter(journal_entry__content_type__model='payroll',
            journal_entry__object_id=salary.pk, gl_account__code='5100').update(deleted_at=self.when)
        entry = JournalEntry.objects.create(entry_date=self.when, is_auto=False)
        JournalLine.objects.bulk_create([
            JournalLine(journal_entry=entry, gl_account=self.account('5100', 'expense'),
                        currency=1, debit=25, credit=0, base_debit=25, base_credit=0, exchange_rate=1),
            JournalLine(journal_entry=entry, gl_account=self.account('1000', 'asset'),
                        currency=1, debit=0, credit=25, base_debit=0, base_credit=25, exchange_rate=1),
        ])
        row = payroll_posting_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['salary_posting_difference'], row['other_salary_gl']), ('100.00', '25.00'))
        self.assertEqual(row['other_journal_ids'], [entry.pk])

    def test_cutoff_and_invalid_filters(self):
        self.payroll(100, when=self.when + timedelta(days=2))
        url = '/api/reports/v2/payroll-posting-bridge/'
        response = self.client.get(url, {'end_date': self.when.date().isoformat()})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rows'], [])
        self.assertEqual(response.data['status'], 'comparison_only')
        self.assertEqual(self.client.get(url, {'start_date': self.when.date().isoformat()}).status_code, 400)
        self.assertEqual(self.client.get(url, {'account_id': 1}).status_code, 400)
