"""Phase 3: Currency Exchange document posts mixed-currency cash journals."""
from decimal import Decimal

from django.test import TestCase

from api.services.accounting.amounts import d
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    USD_RATE_9000,
    cash_base_net,
    cash_native_net,
    create_currency_exchange,
    create_exchange_rate,
    seed_cash,
    gl_native_net,
    journal_for_source,
    native_totals,
)


class Phase3CurrencyExchangeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)

    def test_usd_to_afn_moves_both_cash_accounts(self):
        """1,000 USD → 87,200 AFN: Cash USD -1,000; Cash AFN +87,200."""
        exchange = create_currency_exchange(
            from_currency=USD,
            from_amount=Decimal('1000.00'),
            to_currency=AFN,
            to_amount=Decimal('87200.00'),
            rate=USD_RATE_8720,
        )


        journal = journal_for_source(exchange)
        self.assertIsNotNone(journal)
        lines = list(journal.lines.select_related('gl_account'))
        self.assertEqual(len(lines), 2)

        usd_cash = next(
            line for line in lines
            if line.gl_account.code == '1000' and line.gl_account.currency == USD
        )
        afn_cash = next(
            line for line in lines
            if line.gl_account.code == '1000' and line.gl_account.currency == AFN
        )
        self.assertEqual(d(usd_cash.credit), Decimal('1000.00'))
        self.assertEqual(d(usd_cash.debit), Decimal('0'))
        self.assertEqual(d(usd_cash.base_credit), Decimal('87200.00'))
        self.assertEqual(d(afn_cash.debit), Decimal('87200.00'))
        self.assertEqual(d(afn_cash.credit), Decimal('0'))
        self.assertEqual(d(afn_cash.base_debit), Decimal('87200.00'))
        self.assertEqual(d(afn_cash.exchange_rate), Decimal('1'))

        base_debit = sum((d(line.base_debit) for line in lines), Decimal('0'))
        base_credit = sum((d(line.base_credit) for line in lines), Decimal('0'))
        self.assertEqual(base_debit, base_credit)
        native_debit, native_credit = native_totals(journal)
        self.assertNotEqual(native_debit, native_credit)

    def test_afn_to_usd_reverse_direction(self):
        exchange = create_currency_exchange(
            from_currency=AFN,
            from_amount=Decimal('87200.00'),
            to_currency=USD,
            to_amount=Decimal('1000.00'),
        )


        journal = journal_for_source(exchange)
        lines = list(journal.lines.select_related('gl_account'))
        self.assertEqual(len(lines), 2)
        base_debit = sum((d(line.base_debit) for line in lines), Decimal('0'))
        base_credit = sum((d(line.base_credit) for line in lines), Decimal('0'))
        self.assertEqual(base_debit, base_credit)
        self.assertEqual(base_debit, Decimal('87200.00'))

    def test_carrying_rate_difference_posts_realized_fx_gain(self):
        """USD cash booked at 87.20, exchanged at 90.00 → 2,800 AFN realized gain."""
        seed_cash(
            amount=Decimal('1000.00'),
            currency=USD,
        )

        exchange = create_currency_exchange(
            from_currency=USD,
            from_amount=Decimal('1000.00'),
            to_currency=AFN,
            to_amount=Decimal('90000.00'),
            rate=USD_RATE_9000,
        )


        journal = journal_for_source(exchange)
        lines = list(journal.lines.select_related('gl_account'))
        self.assertEqual(len(lines), 3)
        gain = next(line for line in lines if line.gl_account.code == '4300')
        self.assertEqual(gain.currency, AFN)
        self.assertEqual(d(gain.credit), Decimal('2800.00'))
        self.assertEqual(d(gain.base_credit), Decimal('2800.00'))

        base_debit = sum((d(line.base_debit) for line in lines), Decimal('0'))
        base_credit = sum((d(line.base_credit) for line in lines), Decimal('0'))
        self.assertEqual(base_debit, base_credit)

    def test_draft_does_not_post_and_reverse_removes_journal(self):
        exchange = create_currency_exchange(
            from_currency=USD,
            from_amount=Decimal('1000.00'),
            to_currency=AFN,
            to_amount=Decimal('87200.00'),
            status='draft',
        )
        self.assertIsNone(journal_for_source(exchange))

        exchange.status = 'posted'
        exchange.save()
        self.assertIsNotNone(journal_for_source(exchange))

        exchange.status = 'reversed'
        exchange.save()
        self.assertIsNone(journal_for_source(exchange))
