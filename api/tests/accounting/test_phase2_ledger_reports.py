"""Phase 2: Trial Balance / P&L / Daily Book from journal lines."""
from decimal import Decimal

from django.test import TestCase

from api.services.accounting.amounts import d
from api.services.accounting.reports import (
    REPORT_MODE_BASE,
    REPORT_MODE_NATIVE,
    get_account_code_balance,
    get_balance_sheet,
    get_profit_and_loss,
    get_trial_balance,
)
from api.services.daily_ledger import build_journal_daily_ledger
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    create_currency_exchange,
    create_exchange_rate,
    create_expense,
)


class Phase2LedgerReportingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)
        create_expense(
            amount=Decimal('100.00'),
            currency=USD,
            description='USD fuel',
        )
        create_expense(
            amount=Decimal('5000.00'),
            currency=AFN,
            description='AFN rent',
        )

    def test_native_usd_trial_balance_uses_debit_credit(self):
        tb = get_trial_balance(currency_id=USD, mode=REPORT_MODE_NATIVE)
        self.assertEqual(tb['mode'], 'native')
        self.assertEqual(tb['amount_kind'], 'native')
        expense = next(row for row in tb['rows'] if row['code'] == '5000')
        self.assertEqual(d(expense['total_debit']), Decimal('100.00'))
        cash = next(row for row in tb['rows'] if row['code'] == '1000')
        self.assertEqual(d(cash['total_credit']), Decimal('100.00'))

    def test_native_afn_trial_balance_excludes_usd_expense(self):
        tb = get_trial_balance(currency_id=AFN, mode=REPORT_MODE_NATIVE)
        expense = next((row for row in tb['rows'] if row['code'] == '5000'), None)
        self.assertIsNotNone(expense)
        self.assertEqual(d(expense['total_debit']), Decimal('5000.00'))

    def test_afn_consolidated_groups_by_account_code(self):
        tb = get_trial_balance(mode=REPORT_MODE_BASE)
        self.assertEqual(tb['mode'], 'base')
        self.assertEqual(tb['currency'], AFN)
        expense = next(row for row in tb['rows'] if row['code'] == '5000')
        # 100 USD * 87.20 + 5,000 AFN
        self.assertEqual(d(expense['total_debit']), Decimal('13720.00'))
        cash = next(row for row in tb['rows'] if row['code'] == '1000')
        self.assertEqual(d(cash['total_credit']), Decimal('13720.00'))
        self.assertTrue(tb['totals']['is_balanced'])

    def test_afn_consolidated_pnl(self):
        pl = get_profit_and_loss(mode=REPORT_MODE_BASE)
        self.assertEqual(d(pl['expenses']), Decimal('13720.00'))
        self.assertEqual(d(pl['net_income']), Decimal('-13720.00'))

    def test_cash_usd_native_unchanged_by_afn_expense(self):
        usd_cash = get_account_code_balance(
            '1000',
            currency_id=USD,
            mode=REPORT_MODE_NATIVE,
        )
        afn_cash = get_account_code_balance(
            '1000',
            currency_id=AFN,
            mode=REPORT_MODE_NATIVE,
        )
        self.assertEqual(usd_cash, Decimal('-100.00'))
        self.assertEqual(afn_cash, Decimal('-5000.00'))

    def test_journal_daily_book_has_native_and_afn_columns(self):
        payload, error = build_journal_daily_ledger(
            start_date=TXN_WHEN,
            end_date=TXN_WHEN,
        )
        self.assertIsNone(error)
        self.assertGreaterEqual(len(payload['rows']), 4)
        usd_expense = next(
            row
            for row in payload['rows']
            if row['account_code'] == '5000' and row['currency'] == 'USD'
        )
        self.assertEqual(usd_expense['native_amount'], 100.0)
        self.assertEqual(usd_expense['afn_equivalent'], 8720.0)
        self.assertEqual(usd_expense['side'], 'debit')
        self.assertIn('87.2', str(usd_expense['exchange_rate']))

    def test_native_afn_unbalanced_after_fx_exchange_but_base_balances(self):
        create_currency_exchange(
            from_currency=USD,
            from_amount=Decimal('100.00'),
            to_currency=AFN,
            to_amount=Decimal('8720.00'),
            rate=USD_RATE_8720,
        )
        native_tb = get_trial_balance(currency_id=AFN, mode=REPORT_MODE_NATIVE)
        self.assertFalse(native_tb['totals']['is_balanced'])
        self.assertFalse(native_tb['expects_balance'])
        self.assertIsNotNone(native_tb['balance_note'])

        base_tb = get_trial_balance(mode=REPORT_MODE_BASE)
        self.assertTrue(base_tb['totals']['is_balanced'])
        self.assertTrue(base_tb['expects_balance'])

        base_bs = get_balance_sheet(mode=REPORT_MODE_BASE)
        self.assertTrue(base_bs['is_balanced'])

        native_bs = get_balance_sheet(currency_id=AFN, mode=REPORT_MODE_NATIVE)
        self.assertFalse(native_bs['is_balanced'])
        self.assertIsNotNone(native_bs['balance_note'])
