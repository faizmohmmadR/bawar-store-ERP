from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.expenses import Expense, ExpenseCategory
from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.services.reporting.contracts import ReportScope
from api.services.reporting.expense_activity import expense_activity
from api.tests.accounting.helpers import create_staff_user


class ExpenseActivityV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='expenseactivityadmin', email='expenseactivity@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.category = ExpenseCategory.objects.create(name='Utilities')
        self.when = datetime(2026, 11, 3, 12, tzinfo=dt_timezone.utc)
        self.expense_account, _ = GLAccount.objects.get_or_create(code='5000', currency=1,
            defaults={'name': 'Operating expense', 'category': 'expense'})
        self.cash_account, _ = GLAccount.objects.get_or_create(code='1000', currency=1,
            defaults={'name': 'Cash', 'category': 'asset'})

    def expense(self, *, amount=100, amount_base=100, currency=1, rate=1, method='cash'):
        return Expense.objects.bulk_create([Expense(category=self.category, amount=amount,
            amount_base=amount_base, currency=currency, exchange_rate=rate,
            payment_method=method, expense_date=self.when)])[0]

    def post(self, expense, *, debit=100, credit=100, base=100, expense_gl=None, cash_gl=None):
        journal = JournalEntry.objects.create(content_type=ContentType.objects.get_for_model(expense),
            object_id=expense.pk, entry_date=expense.expense_date)
        JournalLine.objects.bulk_create([
            JournalLine(journal_entry=journal, gl_account=expense_gl or self.expense_account,
                currency=expense.currency, debit=debit, credit=0, base_debit=base, base_credit=0,
                exchange_rate=expense.exchange_rate),
            JournalLine(journal_entry=journal, gl_account=cash_gl or self.cash_account,
                currency=expense.currency, debit=0, credit=credit, base_debit=0, base_credit=base,
                exchange_rate=expense.exchange_rate),
        ])
        return journal

    def test_matched_expense_is_counted_once_by_category_and_currency(self):
        source = self.expense()
        journal = self.post(source)
        report = expense_activity(ReportScope())
        self.assertEqual(report['status'], 'supported_expenses_matched')
        self.assertEqual(report['review_count'], 0)
        self.assertEqual(report['summaries'][0]['recorded_amount'], '100.00')
        self.assertEqual(report['summaries'][0]['matched_amount'], '100.00')
        self.assertEqual(report['summaries'][0]['matched_base_afn'], '100.00')
        self.assertEqual(report['rows'][0]['journal_ids'], [journal.pk])

    def test_missing_and_wrong_postings_remain_visible_but_not_validated(self):
        missing = self.expense(amount=80, amount_base=80)
        wrong = self.expense(amount=50, amount_base=50)
        self.post(wrong, debit=40, credit=50, base=50)
        report = expense_activity(ReportScope())
        self.assertEqual(report['review_count'], 2)
        self.assertEqual(report['summaries'][0]['recorded_amount'], '130.00')
        self.assertEqual(report['summaries'][0]['matched_amount'], '0.00')
        issues = {row['expense_id']: row['issues'] for row in report['rows']}
        self.assertIn('missing_expense_posting', issues[missing.pk])
        self.assertIn('native_amount_mismatch', issues[wrong.pk])

    def test_historical_rate_and_base_snapshot_are_checked(self):
        source = self.expense(amount=10, amount_base=790, currency=2, rate=80)
        usd_expense, _ = GLAccount.objects.get_or_create(code='5000', currency=2,
            defaults={'name': 'USD expense', 'category': 'expense'})
        usd_cash, _ = GLAccount.objects.get_or_create(code='1000', currency=2,
            defaults={'name': 'USD cash', 'category': 'asset'})
        self.post(source, debit=10, credit=10, base=800, expense_gl=usd_expense, cash_gl=usd_cash)
        row = expense_activity(ReportScope())['rows'][0]
        self.assertEqual(row['amount_base_afn'], '790.00')
        self.assertIn('source_base_amount_mismatch', row['issues'])
        self.assertEqual(expense_activity(ReportScope())['summaries'][0]['matched_base_afn'], '0.00')

    def test_endpoint_paginates_and_filters_without_losing_totals(self):
        self.post(self.expense())
        self.expense(amount=50, amount_base=50)
        response = self.client.get('/api/reports/v2/expense-activity/', {'page_size': 1, 'currency': 1})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual((response.data['count'], len(response.data['results'])), (2, 1))
        self.assertEqual(response.data['summaries'][0]['recorded_amount'], '150.00')
        self.assertEqual(self.client.get('/api/reports/v2/expense-activity/', {'account_id': 1}).status_code, 400)
