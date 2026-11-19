"""Phase 4: period-end FX revaluation / unrealized FX."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import Sum
from django.test import TestCase

from api.models.data.fx_revaluation import FxRevaluation
from api.models.data.journal import JournalEntry, JournalLine
from api.services.accounting.amounts import d
from api.services.accounting.coa import get_gl_account
from api.services.accounting.revaluation import run_fx_revaluation
from api.services.fiscal_year import ensure_current_fiscal_year
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    USD_RATE_9000,
    create_exchange_rate,
    journal_for_source,
    seed_cash,
)


class Phase4RevaluationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)
        cls.as_of = (TXN_WHEN + timedelta(days=5)).date()
        create_exchange_rate(
            from_currency=USD,
            rate=USD_RATE_9000,
            when=TXN_WHEN + timedelta(days=5),
        )

    def test_cash_usd_revaluation_posts_unrealized_fx_gain(self):
        """
        Cash USD 10,000; historical carrying 872,000 AFN; closing 90.00.
        Unrealized FX gain = 28,000 AFN. Original transactions unchanged.
        """
        seed_cash(
            amount=Decimal('10000.00'),
            currency=USD,
            when=TXN_WHEN,
        )

        reval = run_fx_revaluation(as_of_date=self.as_of)
        reval.refresh_from_db()

        self.assertEqual(d(reval.total_gain), Decimal('28000.00'))

        journal = journal_for_source(reval)
        self.assertIsNotNone(journal)
        lines = list(journal.lines.select_related('gl_account'))
        self.assertEqual(len(lines), 2)

        cash_line = next(line for line in lines if line.gl_account.code == '1000')
        gain_line = next(line for line in lines if line.gl_account.code == '4400')
        self.assertEqual(d(cash_line.debit), Decimal('0'))
        self.assertEqual(d(cash_line.credit), Decimal('0'))
        self.assertEqual(d(cash_line.base_debit), Decimal('28000.00'))
        self.assertEqual(cash_line.currency, USD)
        self.assertEqual(d(cash_line.exchange_rate), USD_RATE_9000)
        self.assertEqual(gain_line.currency, AFN)
        self.assertEqual(d(gain_line.credit), Decimal('28000.00'))

        base_debit = sum((d(line.base_debit) for line in lines), Decimal('0'))
        base_credit = sum((d(line.base_credit) for line in lines), Decimal('0'))
        self.assertEqual(base_debit, base_credit)

    def test_revaluation_is_idempotent(self):
        seed_cash(
            amount=Decimal('10000.00'),
            currency=USD,
            when=TXN_WHEN,
        )
        first = run_fx_revaluation(as_of_date=self.as_of)
        second = run_fx_revaluation(as_of_date=self.as_of)
        self.assertEqual(first.pk, second.pk)

        ct = ContentType.objects.get_for_model(FxRevaluation)
        journals = JournalEntry.objects.filter(
            content_type=ct,
            object_id=first.pk,
            is_auto=True,
        )
        self.assertEqual(journals.count(), 1)

        gain_lines = JournalLine.objects.filter(
            journal_entry__content_type=ct,
            journal_entry__object_id=first.pk,
            gl_account__code='4400',
        )
        self.assertEqual(gain_lines.count(), 1)
        self.assertEqual(d(gain_lines.first().credit), Decimal('28000.00'))

    def test_inventory_is_not_revalued(self):
        ensure_current_fiscal_year()
        inv = get_gl_account('1100', currency_id=AFN)
        je = JournalEntry.objects.create(
            entry_date=TXN_WHEN,
            reference_number='INV-TEST',
            description='manual inventory USD',
            is_auto=False,
        )
        JournalLine.objects.create(
            journal_entry=je,
            gl_account=inv,
            debit=Decimal('1000.00'),
            credit=Decimal('0'),
            currency=USD,
            exchange_rate=USD_RATE_8720,
            base_debit=Decimal('87200.00'),
            base_credit=Decimal('0'),
            description='inventory stock',
        )

        run_fx_revaluation(as_of_date=self.as_of)

        agg = JournalLine.objects.filter(gl_account=inv).aggregate(
            total_debit=Sum('debit'),
            total_credit=Sum('credit'),
            total_base_debit=Sum('base_debit'),
            total_base_credit=Sum('base_credit'),
        )
        self.assertEqual(d(agg['total_debit']) - d(agg['total_credit']), Decimal('1000.00'))
        self.assertEqual(d(agg['total_base_debit']) - d(agg['total_base_credit']), Decimal('87200.00'))
