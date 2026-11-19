from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.services.reporting.balance_sheet import balance_sheet_review
from api.services.reporting.contracts import ReportScope
from api.tests.accounting.helpers import create_staff_user


class BalanceSheetReviewV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='balancesheetadmin', email='balancesheet@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.cash = self.account('1000', 'asset')
        self.revenue = self.account('4000', 'revenue')
        self.expense = self.account('5000', 'expense')
        self.retained = self.account('3200', 'equity')

    def account(self, code, category):
        account, _ = GLAccount.objects.get_or_create(code=code, currency=1,
            defaults={'name': code, 'category': category})
        return account

    def journal(self, day, postings):
        entry = JournalEntry.objects.create(
            entry_date=datetime.fromisoformat(day).replace(tzinfo=dt_timezone.utc))
        return JournalLine.objects.bulk_create([
            JournalLine(journal_entry=entry, gl_account=account, currency=1,
                        debit=Decimal(str(debit)), credit=Decimal(str(credit)),
                        base_debit=Decimal(str(debit)), base_credit=Decimal(str(credit)),
                        exchange_rate=1)
            for account, debit, credit in postings
        ])

    def test_unclosed_result_balances_the_recorded_equation(self):
        self.journal('2026-11-01T12:00:00', [(self.cash, 100, 0), (self.revenue, 0, 100)])
        self.journal('2026-11-02T12:00:00', [(self.expense, 30, 0), (self.cash, 0, 30)])
        report = balance_sheet_review(ReportScope())
        self.assertEqual(report['status'], 'recorded_balance_sheet_balanced')
        self.assertEqual(report['totals'], {
            'assets': '70.00', 'liabilities': '0.00', 'equity': '0.00',
            'unclosed_earnings': '70.00', 'equity_including_unclosed_earnings': '70.00',
            'difference': '0.00',
        })

    def test_closing_moves_result_into_equity_without_double_counting(self):
        self.journal('2026-11-01T12:00:00', [(self.cash, 100, 0), (self.revenue, 0, 100)])
        self.journal('2026-11-02T12:00:00', [(self.expense, 30, 0), (self.cash, 0, 30)])
        self.journal('2026-11-03T12:00:00', [
            (self.revenue, 100, 0), (self.expense, 0, 30), (self.retained, 0, 70),
        ])
        before = balance_sheet_review(ReportScope.from_params({'end_date': '2026-11-02'}))
        after = balance_sheet_review(ReportScope.from_params({'end_date': '2026-11-03'}))
        self.assertEqual(before['totals']['unclosed_earnings'], '70.00')
        self.assertEqual(after['totals']['unclosed_earnings'], '0.00')
        self.assertEqual(after['totals']['equity'], '70.00')
        self.assertEqual(after['totals']['difference'], '0.00')

    def test_contra_asset_and_owner_draw_reduce_their_sections(self):
        fixed = self.account('1400', 'asset')
        accumulated = self.account('1410', 'asset')
        owner_draw = self.account('3100', 'equity')
        capital = self.account('3000', 'equity')
        self.journal('2026-11-01T12:00:00', [(fixed, 100, 0), (capital, 0, 100)])
        self.journal('2026-11-02T12:00:00', [(self.expense, 10, 0), (accumulated, 0, 10)])
        self.journal('2026-11-03T12:00:00', [(owner_draw, 20, 0), (fixed, 0, 20)])
        report = balance_sheet_review(ReportScope())
        self.assertEqual(report['totals']['assets'], '70.00')
        self.assertEqual(report['totals']['equity'], '80.00')
        self.assertEqual(report['totals']['unclosed_earnings'], '-10.00')
        self.assertEqual(report['totals']['difference'], '0.00')

    def test_unknown_base_does_not_become_zero_or_certified(self):
        lines = self.journal('2026-11-01T12:00:00', [(self.cash, 100, 0), (self.revenue, 0, 100)])
        JournalLine.objects.filter(pk=lines[0].pk).update(base_debit=None, needs_rate_review=True)
        report = balance_sheet_review(ReportScope())
        self.assertEqual(report['status'], 'review_required')
        self.assertIsNone(report['totals']['assets'])
        self.assertIsNone(report['totals']['difference'])
        self.assertEqual(report['totals']['unclosed_earnings'], '100.00')

    def test_endpoint_cutoff_and_filter_rejection(self):
        self.journal('2026-11-01T12:00:00', [(self.cash, 10, 0), (self.retained, 0, 10)])
        self.journal('2026-11-03T12:00:00', [(self.cash, 20, 0), (self.retained, 0, 20)])
        url = '/api/reports/v2/balance-sheet-review/'
        response = self.client.get(url, {'end_date': '2026-11-02'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['totals']['assets'], '10.00')
        for params in ({'start_date': '2026-11-01'}, {'currency': 1},
                       {'account_id': self.cash.pk}):
            self.assertEqual(self.client.get(url, params).status_code, 400)

    def test_offsetting_bad_journals_still_require_review(self):
        first = self.journal('2026-11-01T12:00:00', [(self.cash, 20, 0), (self.retained, 0, 20)])
        second = self.journal('2026-11-02T12:00:00', [(self.cash, 20, 0), (self.retained, 0, 20)])
        JournalLine.objects.filter(pk=first[0].pk).update(base_debit=21)
        JournalLine.objects.filter(pk=second[0].pk).update(base_debit=19)
        report = balance_sheet_review(ReportScope())
        self.assertEqual(report['totals']['difference'], '0.00')
        self.assertEqual(report['journal_health_issue_count'], 2)
        self.assertEqual(report['status'], 'review_required')
