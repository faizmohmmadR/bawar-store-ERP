"""Independent numeric expectations for the new reporting contract."""
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.services.reporting.contracts import ReportScope
from api.services.reporting.ledger import build_balances, ledger_health
from api.tests.accounting.helpers import create_staff_user


class ReportingV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='v2admin', email='v2@example.com', as_admin=True)
        cls.cash, _ = GLAccount.objects.get_or_create(code='1000', currency=1, defaults={'name': 'Cash', 'category': 'asset'})
        cls.usd, _ = GLAccount.objects.get_or_create(code='1000', currency=2, defaults={'name': 'Cash USD', 'category': 'asset'})
        cls.equity, _ = GLAccount.objects.get_or_create(code='3000', currency=1, defaults={'name': 'Equity', 'category': 'equity'})

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def entry(self, day, amount, *, cash=None, outgoing=False, base=None):
        when = datetime.fromisoformat(day).replace(tzinfo=dt_timezone.utc)
        journal = JournalEntry.objects.create(entry_date=when, is_auto=False)
        native = Decimal(amount)
        base_amount = Decimal(base) if base is not None else native
        account = cash or self.cash
        dr, cr = (Decimal('0'), native) if outgoing else (native, Decimal('0'))
        bd, bc = (Decimal('0'), base_amount) if outgoing else (base_amount, Decimal('0'))
        for gl, debit, credit, base_dr, base_cr in (
            (account, dr, cr, bd, bc), (self.equity, cr, dr, bc, bd),
        ):
            JournalLine.objects.create(journal_entry=journal, gl_account=gl, currency=account.currency,
                debit=debit, credit=credit, base_debit=base_dr, base_credit=base_cr,
                exchange_rate=base_amount / native if native else Decimal('1'))
        return journal

    def cash_row(self, scope):
        return build_balances(scope, cash_only=True)['rows'][0]

    def test_opening_and_period_movements_have_independent_cutoffs(self):
        self.entry('2026-10-01T12:00:00', '100')
        self.entry('2026-11-02T12:00:00', '30')
        self.entry('2026-11-03T12:00:00', '20', outgoing=True)
        self.entry('2026-12-01T12:00:00', '999')
        row = self.cash_row(ReportScope.from_params({'start_date': '2026-11-01', 'end_date': '2026-11-04'}))
        self.assertEqual([row[k] for k in ('opening_balance', 'debits', 'credits', 'closing_balance')], ['100.00', '30.00', '20.00', '110.00'])

    def test_no_start_means_zero_opening_and_all_activity_through_cutoff(self):
        self.entry('2026-10-01T12:00:00', '100.10')
        row = self.cash_row(ReportScope.from_params({'end_date': '2026-11-04'}))
        self.assertEqual(row['opening_balance'], '0.00')
        self.assertEqual(row['closing_balance'], '100.10')

    def test_kabul_midnight_and_inclusive_end(self):
        # Kabul Nov 4 starts on Nov 3 at 19:30 UTC.
        self.entry('2026-11-03T19:29:59', '10')
        self.entry('2026-11-03T19:30:00', '20')
        self.entry('2026-11-04T19:29:59', '30')
        self.entry('2026-11-04T19:30:00', '40')
        row = self.cash_row(ReportScope.from_params({'start_date': '2026-11-04', 'end_date': '2026-11-04'}))
        self.assertEqual((row['opening_balance'], row['debits'], row['closing_balance']), ('10.00', '50.00', '60.00'))

    def test_native_currencies_are_never_added_together(self):
        self.entry('2026-11-01T12:00:00', '100')
        self.entry('2026-11-01T12:00:00', '2', cash=self.usd, base='180')
        report = build_balances(ReportScope(), cash_only=True)
        self.assertEqual([r['closing_balance'] for r in report['totals_by_currency']], ['100.00', '2.00'])
        self.assertNotIn('grand_total', report)

    def test_base_only_revaluation_is_not_native_cash(self):
        journal = self.entry('2026-11-01T12:00:00', '2', cash=self.usd, base='180')
        JournalLine.objects.filter(journal_entry=journal).update(debit=0, credit=0)
        self.assertEqual(self.cash_row(ReportScope(currency=2))['closing_balance'], '0.00')

    def test_deleted_journals_and_lines_are_excluded(self):
        first = self.entry('2026-11-01T12:00:00', '20')
        first.soft_delete()
        second = self.entry('2026-11-01T12:00:00', '30')
        JournalLine.objects.filter(journal_entry=second).update(deleted_at=second.entry_date)
        self.assertEqual(build_balances(ReportScope())['rows'], [])

    def test_inactive_account_with_history_remains_visible(self):
        self.entry('2026-11-01T12:00:00', '20')
        GLAccount.objects.filter(pk=self.cash.pk).update(is_active=False)
        self.assertEqual(self.cash_row(ReportScope())['closing_balance'], '20.00')

    def test_deleted_account_history_remains_traceable_across_v2_reports(self):
        self.entry('2026-11-01T12:00:00', '20')
        deleted_at = datetime(2026, 11, 3, tzinfo=dt_timezone.utc)
        GLAccount.objects.filter(pk__in=[self.cash.pk, self.equity.pk]).update(deleted_at=deleted_at)
        scope = ReportScope(account_id=self.cash.pk)
        row = build_balances(scope, cash_only=True)['rows'][0]
        self.assertEqual((row['closing_balance'], row['deleted_account']), ('20.00', True))
        self.assertEqual(ledger_health(scope)['issue_count'], 0)
        cash = self.client.get('/api/reports/v2/cash-activity/', {'account_id': self.cash.pk}).data
        self.assertEqual(cash['rows'][0]['closing_balance'], '20.00')
        self.assertTrue(cash['rows'][0]['deleted_account'])
        self.assertTrue(cash['results'][0]['deleted_account'])
        entries = self.client.get('/api/reports/v2/ledger-entries/', {'account_id': self.cash.pk}).data
        self.assertEqual(entries['count'], 1)
        self.assertTrue(entries['results'][0]['deleted_account'])
        opening = self.client.get('/api/reports/v2/opening-review/', {'start_date': '2026-11-02'}).data
        self.assertEqual(opening['equity_evidence_journal_count'], 1)
        self.assertTrue(any(r['account_id'] == self.cash.pk and r['deleted_account'] for r in opening['rows']))
        trial = self.client.get('/api/reports/v2/trial-balance-review/').data
        self.assertEqual(trial['deleted_account_count'], 2)
        sheet = self.client.get('/api/reports/v2/balance-sheet-review/').data
        self.assertEqual(sheet['deleted_account_count'], 2)

    def test_unknown_base_amount_is_not_reported_as_zero_or_certified(self):
        journal = self.entry('2026-11-01T12:00:00', '20')
        JournalLine.objects.filter(journal_entry=journal, gl_account=self.cash).update(base_debit=None, needs_rate_review=True)
        health = ledger_health(ReportScope())
        self.assertEqual(health['status'], 'issues_found')
        self.assertEqual(health['issues'][0]['kind'], 'unknown_base_amount')
        response = self.client.get('/api/reports/v2/ledger-entries/')
        unknown = next(row for row in response.data['results'] if row['account_id'] == self.cash.pk)
        self.assertIsNone(unknown['base_debit'])

    def test_health_checks_complete_journal_when_account_filtered(self):
        self.entry('2026-11-01T12:00:00', '20')
        self.assertEqual(ledger_health(ReportScope(account_id=self.cash.pk))['issue_count'], 0)

    def test_unbalanced_base_journal_has_explicit_issue(self):
        journal = self.entry('2026-11-01T12:00:00', '20')
        JournalLine.objects.filter(journal_entry=journal, gl_account=self.cash).update(base_debit=21)
        health = ledger_health(ReportScope())
        self.assertEqual(health['issues'], [{'journal_id': journal.pk, 'kind': 'unbalanced_base', 'difference': '1.00'}])

    def test_new_endpoints_do_not_call_old_reporting(self):
        self.entry('2026-11-01T12:00:00', '20')
        with patch('api.services.financial_reports._build_base_summary', side_effect=AssertionError('legacy called')):
            response = self.client.get('/api/reports/v2/cash-balances/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['rows'][0]['closing_balance'], '20.00')
        self.assertEqual(response.data['meta']['source_reconciliation'], 'not_verified')

    def test_entries_pagination_and_balance_drilldown_agree(self):
        self.entry('2026-11-01T12:00:00', '20.10')
        self.entry('2026-11-02T12:00:00', '5.05', outgoing=True)
        params = {'account_id': self.cash.pk, 'currency': 1, 'start_date': '2026-11-01', 'end_date': '2026-11-04'}
        balances = self.client.get('/api/reports/v2/cash-balances/', params).data
        entries = self.client.get('/api/reports/v2/ledger-entries/', {**params, 'page_size': 1}).data
        self.assertEqual(entries['count'], 2)
        self.assertIsNotNone(entries['next'])
        all_rows = self.client.get('/api/reports/v2/ledger-entries/', params).data['results']
        net = sum((Decimal(row['debit']) - Decimal(row['credit']) for row in all_rows), Decimal('0'))
        self.assertEqual(net, Decimal(balances['rows'][0]['closing_balance']))

    def test_invalid_filters_are_rejected(self):
        for params in ({'period': 'monthly'}, {'currency': 999}, {'account_id': -1}, {'start_date': 'wrong'}, {'start_date': '2026-11-05', 'end_date': '2026-11-04'}):
            with self.subTest(params=params):
                self.assertEqual(self.client.get('/api/reports/v2/cash-balances/', params).status_code, 400)

    def test_unauthenticated_and_unprivileged_requests_cannot_read_reports(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get('/api/reports/v2/cash-balances/').status_code, (401, 403))
        staff = create_staff_user(username='v2staff', email='staffv2@example.com')
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get('/api/reports/v2/cash-balances/').status_code, 403)

    def test_empty_journal_is_not_certified(self):
        journal = JournalEntry.objects.create(entry_date=datetime(2026, 11, 1, tzinfo=dt_timezone.utc))
        self.assertIn({'journal_id': journal.pk, 'kind': 'empty_journal'}, ledger_health(ReportScope())['issues'])

    def test_native_imbalance_and_invalid_rate_cannot_hide_behind_balanced_base(self):
        journal = self.entry('2026-11-01T12:00:00', '20')
        JournalLine.objects.filter(journal_entry=journal, gl_account=self.cash).update(debit=21, exchange_rate=2)
        kinds = {issue['kind'] for issue in ledger_health(ReportScope())['issues']}
        self.assertEqual(kinds, {'unbalanced_native', 'invalid_exchange_rate'})

    def test_mixed_currency_journal_is_checked_in_base_not_native_sum(self):
        journal = self.entry('2026-11-01T12:00:00', '20')
        JournalLine.objects.filter(journal_entry=journal, gl_account=self.cash).update(
            gl_account=self.usd, currency=2, debit=1, exchange_rate=20,
        )
        self.assertEqual(ledger_health(ReportScope())['issue_count'], 0)
