from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.services.reporting.contracts import ReportScope
from api.services.reporting.profit_loss import profit_loss_review
from api.tests.accounting.helpers import create_staff_user


class ProfitLossReviewV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='pnlreviewadmin', email='pnlreview@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.when = datetime(2026, 11, 3, 12, tzinfo=dt_timezone.utc)
        self.cash, _ = GLAccount.objects.get_or_create(code='1000', currency=1,
            defaults={'name': 'Cash', 'category': 'asset'})

    def post(self, code, category, *, amount, debit=False, closing=False):
        account, _ = GLAccount.objects.get_or_create(code=code, currency=1,
            defaults={'name': code, 'category': category})
        journal = JournalEntry.objects.create(entry_date=self.when, is_closing_entry=closing)
        value = Decimal(str(amount))
        dr, cr = (value, Decimal('0')) if debit else (Decimal('0'), value)
        main, offset = JournalLine.objects.bulk_create([
            JournalLine(journal_entry=journal, gl_account=account, currency=1,
                debit=dr, credit=cr, base_debit=dr, base_credit=cr, exchange_rate=1),
            JournalLine(journal_entry=journal, gl_account=self.cash, currency=1,
                debit=cr, credit=dr, base_debit=cr, base_credit=dr, exchange_rate=1),
        ])
        return account, main, offset

    def test_gross_and_net_result_use_only_period_nonclosing_lines(self):
        self.post('4000', 'revenue', amount=1000)
        self.post('4100', 'revenue', amount=100, debit=True)
        self.post('5200', 'expense', amount=300, debit=True)
        self.post('5000', 'expense', amount=200, debit=True)
        self.post('4200', 'revenue', amount=50)
        self.post('4000', 'revenue', amount=1000, debit=True, closing=True)
        report = profit_loss_review(ReportScope.from_params({
            'start_date': '2026-11-01', 'end_date': '2026-11-04',
        }))
        self.assertEqual(report['status'], 'recorded_pnl_unverified')
        self.assertEqual(report['totals'], {
            'sales_revenue': '1000.00', 'sales_returns': '100.00',
            'net_sales': '900.00', 'cost_of_goods_sold': '300.00',
            'gross_profit': '600.00', 'other_revenue': '50.00',
            'other_expenses': '200.00', 'net_result': '450.00',
        })

    def test_unknown_cogs_blocks_gross_and_net_without_erasing_sales(self):
        self.post('4000', 'revenue', amount=1000)
        _, cogs, _ = self.post('5200', 'expense', amount=300, debit=True)
        JournalLine.objects.filter(pk=cogs.pk).update(base_debit=None, needs_rate_review=True)
        report = profit_loss_review(ReportScope())
        self.assertEqual(report['status'], 'review_required')
        self.assertEqual(report['totals']['net_sales'], '1000.00')
        self.assertIsNone(report['totals']['cost_of_goods_sold'])
        self.assertIsNone(report['totals']['gross_profit'])
        self.assertIsNone(report['totals']['net_result'])

    def test_wrong_account_category_never_produces_profit_number(self):
        account, _, _ = self.post('4000', 'revenue', amount=100)
        GLAccount.objects.filter(pk=account.pk).update(category='expense')
        report = profit_loss_review(ReportScope())
        self.assertEqual(report['wrong_category_line_count'], 1)
        self.assertEqual(report['status'], 'review_required')
        self.assertIsNone(report['totals']['net_result'])

    def test_endpoint_rejects_currency_and_account_filters(self):
        self.post('4000', 'revenue', amount=100)
        response = self.client.get('/api/reports/v2/profit-loss-review/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['totals']['net_result'], '100.00')
        self.assertEqual(self.client.get('/api/reports/v2/profit-loss-review/', {'currency': 1}).status_code, 400)
        self.assertEqual(self.client.get('/api/reports/v2/profit-loss-review/', {'account_id': self.cash.pk}).status_code, 400)
