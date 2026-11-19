"""Phase 0 posting and reporting contracts against the current architecture."""
from decimal import Decimal

from django.test import TestCase

from api.services.accounting.amounts import d
from api.services.accounting.reports import get_profit_and_loss, get_trial_balance
from api.services.financial_reports import get_base_currency_report
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    USD_RATE_9000,
    cash_native_net,
    create_confirmed_sale,
    create_exchange_rate,
    create_expense,
    gl_native_net,
    journal_for_source,
    journal_line_has_functional_fields,
    native_totals,
)


class Phase0PostingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)

    def test_usd_expense_hits_cash_usd_not_cash_afn(self):
        """$100 USD @ 87.20 → Cash USD -100; Cash AFN unchanged; AFN equivalent 8,720."""
        expense = create_expense(
            amount=Decimal('100.00'),
            currency=USD,
            description='USD fuel',
        )

        self.assertEqual(d(expense.exchange_rate), USD_RATE_8720)
        self.assertEqual(d(expense.amount_base), Decimal('8720.00'))

        journal = journal_for_source(expense)
        self.assertIsNotNone(journal)
        lines = list(journal.lines.select_related('gl_account'))
        self.assertEqual(len(lines), 2)
        by_code = {line.gl_account.code: line for line in lines}
        self.assertEqual(d(by_code['5000'].debit), Decimal('100.00'))
        self.assertEqual(d(by_code['5000'].credit), Decimal('0'))
        # Phase 5: expense is a generic (home) GL; currency lives on the journal line.
        self.assertEqual(by_code['5000'].currency, USD)
        self.assertNotEqual(by_code['5000'].gl_account.currency, USD)
        self.assertEqual(d(by_code['1000'].credit), Decimal('100.00'))
        self.assertEqual(d(by_code['1000'].debit), Decimal('0'))
        self.assertEqual(by_code['1000'].gl_account.currency, USD)
        self.assertEqual(by_code['1000'].currency, USD)

        if journal_line_has_functional_fields():
            expense_line = by_code['5000']
            rate = d(getattr(expense_line, 'exchange_rate'))
            base_debit = d(
                getattr(expense_line, 'base_debit', None)
                or getattr(expense_line, 'debit_base', 0)
            )
            self.assertEqual(rate, USD_RATE_8720)
            self.assertEqual(base_debit, Decimal('8720.00'))

    def test_afn_expense_hits_cash_afn(self):
        expense = create_expense(
            amount=Decimal('5000.00'),
            currency=AFN,
            description='AFN rent',
        )
        self.assertEqual(d(expense.exchange_rate), Decimal('1'))
        self.assertEqual(d(expense.amount_base), Decimal('5000.00'))

        journal = journal_for_source(expense)
        debit, credit = native_totals(journal)
        self.assertEqual(debit, Decimal('5000.00'))
        self.assertEqual(credit, Decimal('5000.00'))

    def test_usd_sale_increases_ar_usd_and_stores_afn_equivalent(self):
        sale = create_confirmed_sale(
            amount=Decimal('100.00'),
            currency=USD,
        )
        self.assertEqual(d(sale.total_amount), Decimal('100.00'))
        self.assertEqual(d(sale.exchange_rate), USD_RATE_8720)
        self.assertEqual(d(sale.total_amount_base), Decimal('8720.00'))


        journal = journal_for_source(sale)
        self.assertIsNotNone(journal)
        debit, credit = native_totals(journal)
        self.assertEqual(debit, credit)
        self.assertEqual(debit, Decimal('100.00'))

    def test_historical_rate_survives_later_rate_change(self):
        from datetime import timedelta

        expense = create_expense(
            amount=Decimal('100.00'),
            currency=USD,
            description='historical USD',
        )
        later = TXN_WHEN + timedelta(days=1)
        create_exchange_rate(from_currency=USD, rate=USD_RATE_9000, when=later)

        expense.refresh_from_db()
        self.assertEqual(d(expense.exchange_rate), USD_RATE_8720)
        self.assertEqual(d(expense.amount_base), Decimal('8720.00'))

        journal = journal_for_source(expense)
        self.assertIsNotNone(journal)
        debit, credit = native_totals(journal)
        self.assertEqual(debit, Decimal('100.00'))
        self.assertEqual(credit, Decimal('100.00'))

        if journal_line_has_functional_fields():
            for line in journal.lines.all():
                self.assertEqual(d(line.exchange_rate), USD_RATE_8720)
                base_debit = d(getattr(line, 'base_debit', None) or getattr(line, 'debit_base', 0))
                base_credit = d(getattr(line, 'base_credit', None) or getattr(line, 'credit_base', 0))
                if d(line.debit) > 0:
                    self.assertEqual(base_debit, Decimal('8720.00'))
                    self.assertEqual(base_credit, Decimal('0'))
                if d(line.credit) > 0:
                    self.assertEqual(base_credit, Decimal('8720.00'))
                    self.assertEqual(base_debit, Decimal('0'))

    def test_normal_usd_journal_native_debits_equal_credits(self):
        expense = create_expense(
            amount=Decimal('100.00'),
            currency=USD,
        )
        journal = journal_for_source(expense)
        debit, credit = native_totals(journal)
        self.assertEqual(debit, credit)
        self.assertEqual(debit, Decimal('100.00'))
        # Phase 5: cash GL is currency-specific; expense GL is generic (AFN).
        # Native journal currency lives on JournalLine.
        currencies = {line.currency for line in journal.lines.all()}
        self.assertEqual(currencies, {USD})
        gl_currencies = {line.gl_account.currency for line in journal.lines.all()}
        self.assertEqual(gl_currencies, {USD, AFN})

    def test_afn_consolidated_report_uses_stored_equivalent(self):
        """Phase 0: operational *_base. Phase 2 will switch this to journal base_debit."""
        create_expense(
            amount=Decimal('100.00'),
            currency=USD,
            description='USD for AFN report',
        )
        start = TXN_WHEN
        end = TXN_WHEN
        report = get_base_currency_report(
            start_date=start,
            end_date=end,
        )
        summary = report['summary']
        self.assertEqual(report['base_currency']['code'], 'AFN')
        self.assertEqual(d(summary['operating_expenses']), Decimal('8720.00'))

        usd_tb = get_trial_balance(currency_id=USD)
        expense_row = next(row for row in usd_tb['rows'] if row['code'] == '5000')
        self.assertEqual(d(expense_row['total_debit']), Decimal('100.00'))

        afn_tb = get_trial_balance(currency_id=AFN)
        afn_expense = next((row for row in afn_tb['rows'] if row['code'] == '5000'), None)
        self.assertTrue(
            afn_expense is None or d(afn_expense['total_debit']) == Decimal('0'),
            'USD expense must not post into the AFN book / Cash AFN',
        )

        usd_pl = get_profit_and_loss(currency_id=USD)
        self.assertEqual(d(usd_pl['expenses']), Decimal('100.00'))
