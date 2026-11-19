from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.services.reporting.contracts import ReportScope
from api.services.reporting.trial_balance import trial_balance_review
from api.tests.accounting.helpers import create_staff_user


class TrialBalanceReviewV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='trialreviewadmin', email='trialreview@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.cash, _ = GLAccount.objects.get_or_create(code='1000', currency=1,
            defaults={'name': 'Cash', 'category': 'asset'})
        self.equity, _ = GLAccount.objects.get_or_create(code='3000', currency=1,
            defaults={'name': 'Equity', 'category': 'equity'})

    def entry(self, day, amount, *, currency=1, rate=1, cash=None, equity=None):
        when = datetime.fromisoformat(day).replace(tzinfo=dt_timezone.utc)
        journal = JournalEntry.objects.create(entry_date=when)
        base = Decimal(str(amount)) * Decimal(str(rate))
        lines = JournalLine.objects.bulk_create([
            JournalLine(journal_entry=journal, gl_account=cash or self.cash, currency=currency,
                        debit=amount, credit=0, base_debit=base, base_credit=0, exchange_rate=rate),
            JournalLine(journal_entry=journal, gl_account=equity or self.equity, currency=currency,
                        debit=0, credit=amount, base_debit=0, base_credit=base, exchange_rate=rate),
        ])
        return journal, lines

    def test_opening_period_and_cross_currency_base_balance(self):
        self.entry('2026-10-31T12:00:00', 100)
        usd_cash, _ = GLAccount.objects.get_or_create(code='1000', currency=2,
            defaults={'name': 'USD Cash', 'category': 'asset'})
        usd_equity, _ = GLAccount.objects.get_or_create(code='3000', currency=2,
            defaults={'name': 'USD Equity', 'category': 'equity'})
        self.entry('2026-11-02T12:00:00', 2, currency=2, rate=80,
                   cash=usd_cash, equity=usd_equity)
        report = trial_balance_review(ReportScope.from_params({
            'start_date': '2026-11-01', 'end_date': '2026-11-04',
        }))
        self.assertEqual(report['status'], 'recorded_trial_balance_balanced')
        self.assertEqual(report['totals']['opening_debits'], '100.00')
        self.assertEqual(report['totals']['period_debits'], '160.00')
        self.assertEqual(report['totals']['closing_debits'], '260.00')
        self.assertEqual(report['totals']['closing_difference'], '0.00')
        usd_row = next(row for row in report['rows'] if row['account_id'] == usd_cash.pk)
        self.assertEqual((usd_row['period_debits'], usd_row['closing_balance']), ('160.00', '160.00'))

    def test_unknown_base_keeps_account_and_total_unknown(self):
        _, lines = self.entry('2026-11-02T12:00:00', 20)
        JournalLine.objects.filter(pk=lines[0].pk).update(base_debit=None, needs_rate_review=True)
        report = trial_balance_review(ReportScope())
        self.assertEqual(report['status'], 'review_required')
        self.assertEqual(report['unknown_base_count'], 1)
        row = next(row for row in report['rows'] if row['account_id'] == self.cash.pk)
        self.assertIsNone(row['closing_balance'])
        self.assertIsNone(report['totals']['closing_debits'])
        self.assertIsNone(report['totals']['closing_difference'])

    def test_unbalanced_and_deleted_account_are_not_certified(self):
        _, lines = self.entry('2026-11-02T12:00:00', 20)
        JournalLine.objects.filter(pk=lines[1].pk).update(base_credit=19)
        report = trial_balance_review(ReportScope())
        self.assertEqual((report['status'], report['totals']['closing_difference']), ('review_required', '1.00'))
        JournalLine.objects.filter(pk=lines[1].pk).update(base_credit=20)
        GLAccount.objects.filter(pk=self.cash.pk).update(deleted_at=datetime(2026, 11, 5, tzinfo=dt_timezone.utc))
        report = trial_balance_review(ReportScope())
        self.assertEqual(report['status'], 'review_required')
        self.assertEqual(report['deleted_account_count'], 1)

    def test_offsetting_bad_journals_do_not_make_trial_balance_healthy(self):
        _, first = self.entry('2026-11-02T12:00:00', 20)
        _, second = self.entry('2026-11-03T12:00:00', 20)
        JournalLine.objects.filter(pk=first[0].pk).update(base_debit=21)
        JournalLine.objects.filter(pk=second[0].pk).update(base_debit=19)
        report = trial_balance_review(ReportScope())
        self.assertEqual(report['totals']['closing_difference'], '0.00')
        self.assertEqual(report['journal_health_issue_count'], 2)
        self.assertEqual(report['status'], 'review_required')

    def test_endpoint_rejects_filters_that_hide_other_sides(self):
        self.entry('2026-11-02T12:00:00', 20)
        response = self.client.get('/api/reports/v2/trial-balance-review/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['totals']['closing_credits'], '20.00')
        self.assertEqual(self.client.get('/api/reports/v2/trial-balance-review/', {'currency': 1}).status_code, 400)
        self.assertEqual(self.client.get('/api/reports/v2/trial-balance-review/', {'account_id': self.cash.pk}).status_code, 400)
