from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.currency_exchange import CurrencyExchange
from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.services.reporting.cash_activity import cash_activity
from api.services.reporting.contracts import ReportScope
from api.tests.accounting.helpers import create_staff_user


class CashActivityV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='cashflowadmin', email='cashflow@example.com', as_admin=True)
        cls.cash, _ = GLAccount.objects.get_or_create(
            code='1000', currency=1, defaults={'name': 'Cash', 'category': 'asset'},
        )
        cls.equity, _ = GLAccount.objects.get_or_create(
            code='3000', currency=1, defaults={'name': 'Equity', 'category': 'equity'},
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def entry(self, day, amount, *, outgoing=False, source_model=None):
        fields = {}
        if source_model:
            fields = {'content_type': ContentType.objects.get_for_model(source_model), 'object_id': 999}
        entry = JournalEntry.objects.create(entry_date=datetime.fromisoformat(day).replace(tzinfo=dt_timezone.utc),
                                            is_auto=bool(source_model), **fields)
        debit, credit = (Decimal('0'), Decimal(amount)) if outgoing else (Decimal(amount), Decimal('0'))
        JournalLine.objects.create(journal_entry=entry, gl_account=self.cash, currency=1,
                                   debit=debit, credit=credit, base_debit=debit, base_credit=credit,
                                   exchange_rate=1)
        JournalLine.objects.create(journal_entry=entry, gl_account=self.equity, currency=1,
                                   debit=credit, credit=debit, base_debit=credit, base_credit=debit,
                                   exchange_rate=1)

    def test_external_and_internal_cash_activity_are_separate(self):
        self.entry('2026-10-31T12:00:00', '100')
        self.entry('2026-11-02T12:00:00', '30')
        self.entry('2026-11-03T12:00:00', '20', outgoing=True)
        self.entry('2026-11-04T12:00:00', '10', outgoing=True, source_model=CurrencyExchange)
        result = cash_activity(ReportScope.from_params({'start_date': '2026-11-01', 'end_date': '2026-11-04'}))
        row = result['rows'][0]
        self.assertEqual({key: row[key] for key in ('opening_balance', 'external_inflow', 'external_outflow',
                         'internal_outflow', 'closing_balance')},
                         {'opening_balance': '100.00', 'external_inflow': '30.00', 'external_outflow': '20.00',
                          'internal_outflow': '10.00', 'closing_balance': '100.00'})
        self.assertEqual(result['movements'][-1]['activity_kind'], 'internal_currency_exchange')
        self.assertTrue(result['movements'][-1]['is_internal'])

    def test_endpoint_paginates_movements_and_keeps_summary(self):
        self.entry('2026-11-02T12:00:00', '20')
        response = self.client.get('/api/reports/v2/cash-activity/', {'page_size': 1})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['rows'][0]['closing_balance'], '20.00')
        self.assertEqual(response.data['status'], 'recorded_cash_activity_unverified')

    def test_account_filter_is_applied_to_cash_summary_and_movements(self):
        self.entry('2026-11-02T12:00:00', '20')
        result = cash_activity(ReportScope(account_id=self.cash.pk))
        self.assertEqual(result['rows'][0]['account_id'], self.cash.pk)
        self.assertEqual(result['movements'][0]['account_id'], self.cash.pk)
