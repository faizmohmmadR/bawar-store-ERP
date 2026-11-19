"""Phase 3B: realized FX on AR / AP / loan settlement."""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase

from api.services.accounting.amounts import d
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    USD_RATE_9000,
    create_confirmed_sale,
    create_exchange_rate,
    create_loan,
    create_loan_payment,
    create_order_payment,
    journal_for_source,
)


class Phase3BSettlementFxTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)
        cls.settle_when = TXN_WHEN + timedelta(days=1)
        create_exchange_rate(from_currency=USD, rate=USD_RATE_9000, when=cls.settle_when)

    def test_usd_ar_settlement_posts_realized_fx_gain(self):
        """
        Invoice 1,000 USD @ 87.20 (book 87,200 AFN).
        Payment 1,000 USD @ 90.00 (cash 90,000 AFN).
        Realized FX gain = 2,800 AFN. Original invoice rate unchanged.
        """
        sale = create_confirmed_sale(
            amount=Decimal('1000.00'),
            currency=USD,
            when=TXN_WHEN,
        )
        self.assertEqual(d(sale.exchange_rate), USD_RATE_8720)
        self.assertEqual(d(sale.total_amount_base), Decimal('87200.00'))

        payment = create_order_payment(
            order=sale,
            amount=Decimal('1000.00'),
            payment_type='sale',
            when=self.settle_when,
        )
        self.assertEqual(d(payment.exchange_rate), USD_RATE_9000)
        self.assertEqual(d(payment.amount_base), Decimal('90000.00'))

        sale.refresh_from_db()
        self.assertEqual(d(sale.exchange_rate), USD_RATE_8720)
        self.assertEqual(d(sale.total_amount_base), Decimal('87200.00'))


        journal = journal_for_source(payment)
        self.assertIsNotNone(journal)
        lines = list(journal.lines.select_related('gl_account'))
        self.assertEqual(len(lines), 3)

        by_code = {}
        for line in lines:
            by_code[line.gl_account.code] = line

        cash = by_code['1000']
        ar = by_code['1200']
        gain = by_code['4300']
        self.assertEqual(cash.currency, USD)
        self.assertEqual(d(cash.debit), Decimal('1000.00'))
        self.assertEqual(d(cash.exchange_rate), USD_RATE_9000)
        self.assertEqual(d(cash.base_debit), Decimal('90000.00'))

        self.assertEqual(ar.currency, USD)
        self.assertEqual(d(ar.credit), Decimal('1000.00'))
        self.assertEqual(d(ar.exchange_rate), USD_RATE_8720)
        self.assertEqual(d(ar.base_credit), Decimal('87200.00'))

        self.assertEqual(gain.currency, AFN)
        self.assertEqual(d(gain.credit), Decimal('2800.00'))
        self.assertEqual(d(gain.base_credit), Decimal('2800.00'))

        base_debit = sum((d(line.base_debit) for line in lines), Decimal('0'))
        base_credit = sum((d(line.base_credit) for line in lines), Decimal('0'))
        self.assertEqual(base_debit, base_credit)

    def test_usd_ap_settlement_posts_realized_fx_loss(self):
        """Finished-goods purchase AP settlement removed with Purchase module."""
        self.skipTest('Finished-goods Purchase module removed')

    def test_loan_receivable_collection_posts_realized_fx_gain(self):
        loan = create_loan(
            amount=Decimal('1000.00'),
            currency=USD,
            loan_type='loan_out',
            when=TXN_WHEN,
        )
        self.assertEqual(d(loan.exchange_rate), USD_RATE_8720)
        # Opening loan_out: Dr loan receivable / Cr cash

        payment = create_loan_payment(
            loan=loan,
            amount=Decimal('1000.00'),
            when=self.settle_when,
        )
        self.assertEqual(d(payment.exchange_rate), USD_RATE_9000)

        loan.refresh_from_db()
        self.assertEqual(d(loan.exchange_rate), USD_RATE_8720)

        # Cash back to zero net after collection; FX gain 2800

        journal = journal_for_source(payment)
        lines = list(journal.lines.select_related('gl_account'))
        self.assertEqual(len(lines), 3)
        base_debit = sum((d(line.base_debit) for line in lines), Decimal('0'))
        base_credit = sum((d(line.base_credit) for line in lines), Decimal('0'))
        self.assertEqual(base_debit, base_credit)

    def test_same_rate_settlement_has_no_fx_line(self):
        sale = create_confirmed_sale(
            amount=Decimal('500.00'),
            currency=USD,
            when=TXN_WHEN,
        )
        payment = create_order_payment(
            order=sale,
            amount=Decimal('500.00'),
            payment_type='sale',
            when=TXN_WHEN,
        )
        self.assertEqual(d(payment.exchange_rate), USD_RATE_8720)
        journal = journal_for_source(payment)
        lines = list(journal.lines.select_related('gl_account'))
        self.assertEqual(len(lines), 2)
        codes = {line.gl_account.code for line in lines}
        self.assertNotIn('4300', codes)
        self.assertNotIn('5350', codes)
