"""Phase 6: manual journal + CoA posting_currency filter after Phase 5 merge."""
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.journal import JournalEntry
from api.serializers.data.journal import JournalEntryWriteSerializer
from api.services.accounting.coa import get_gl_account
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    create_exchange_rate,
    create_staff_user,
)
from api.views.data.journal import GLAccountViewSet


class Phase6FrontendSupportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)
        cls.user = create_staff_user(
            username='p6-staff',
            email='p6@example.com',
            as_admin=True,
        )

    def test_posting_currency_filter_returns_usd_cash_and_afn_expense(self):
        factory = APIRequestFactory()
        request = factory.get('/api/gl-accounts/', {'posting_currency': USD})
        force_authenticate(request, user=self.user)
        view = GLAccountViewSet.as_view({'get': 'list'})
        response = view(request)
        self.assertEqual(response.status_code, 200)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        by_code = {}
        for row in rows:
            by_code.setdefault(row['code'], []).append(row)

        cash = by_code.get('1000', [])
        self.assertEqual(len(cash), 1)
        self.assertEqual(int(cash[0]['currency']), USD)

        expense = by_code.get('5000', [])
        self.assertEqual(len(expense), 1)
        self.assertEqual(int(expense[0]['currency']), AFN)

    def test_manual_usd_journal_allows_cash_usd_plus_generic_expense(self):
        cash = get_gl_account('1000', currency_id=USD)
        expense = get_gl_account('5000', currency_id=AFN)
        self.assertEqual(cash.currency, USD)
        self.assertEqual(expense.currency, BASE_CURRENCY_ID)

        ser = JournalEntryWriteSerializer(
            data={
                'entry_date': TXN_WHEN.isoformat(),
                'reference_number': 'P6-MANUAL',
                'description': 'USD expense via generic GL',
                'lines': [
                    {
                        'gl_account': expense.id,
                        'currency': USD,
                        'debit': '100.00',
                        'credit': '0',
                        'description': 'expense',
                    },
                    {
                        'gl_account': cash.id,
                        'currency': USD,
                        'debit': '0',
                        'credit': '100.00',
                        'description': 'cash',
                    },
                ],
            }
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        entry = ser.save()
        self.assertIsInstance(entry, JournalEntry)
        lines = list(entry.lines.select_related('gl_account').order_by('id'))
        self.assertEqual(len(lines), 2)
        for line in lines:
            self.assertEqual(line.currency, USD)
            self.assertEqual(line.exchange_rate, USD_RATE_8720)
        expense_line = next(l for l in lines if l.gl_account.code == '5000')
        self.assertEqual(expense_line.base_debit, Decimal('8720.00'))
        self.assertEqual(expense_line.gl_account.currency, AFN)

    def test_manual_journal_rejects_mixed_line_currencies(self):
        expense = get_gl_account('5000', currency_id=AFN)
        cash_usd = get_gl_account('1000', currency_id=USD)
        ser = JournalEntryWriteSerializer(
            data={
                'entry_date': TXN_WHEN.isoformat(),
                'description': 'mixed',
                'lines': [
                    {
                        'gl_account': expense.id,
                        'currency': AFN,
                        'debit': '100.00',
                        'credit': '0',
                    },
                    {
                        'gl_account': cash_usd.id,
                        'currency': USD,
                        'debit': '0',
                        'credit': '100.00',
                    },
                ],
            }
        )
        self.assertFalse(ser.is_valid())
        self.assertIn('lines', ser.errors)
