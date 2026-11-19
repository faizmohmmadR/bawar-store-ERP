"""Phase 1: JournalLine stores currency, historical rate, and AFN base amounts."""
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from api.models.data.journal import JournalLine
from api.services.accounting.journal_fx import (
    backfill_existing_journal_lines,
    prepare_posted_line,
)
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    USD_RATE_9000,
    create_exchange_rate,
    create_expense,
    journal_for_source,
    journal_line_has_functional_fields,
)


class Phase1JournalLineTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)

    def test_functional_fields_exist(self):
        self.assertTrue(journal_line_has_functional_fields())

    def test_usd_expense_line_stores_historical_afn(self):
        expense = create_expense(
            amount=Decimal('100.00'),
            currency=USD,
            description='USD fuel',
        )
        journal = journal_for_source(expense)
        self.assertIsNotNone(journal)
        self.assertEqual(journal.total_base_debit, Decimal('8720.00'))
        self.assertEqual(journal.total_base_credit, Decimal('8720.00'))

        for line in journal.lines.all():
            self.assertEqual(line.currency, USD)
            self.assertEqual(line.exchange_rate, USD_RATE_8720)
            self.assertFalse(line.needs_rate_review)
            if line.debit > 0:
                self.assertEqual(line.base_debit, Decimal('8720.00'))
                self.assertEqual(line.base_credit or Decimal('0'), Decimal('0'))
            else:
                self.assertEqual(line.base_credit, Decimal('8720.00'))
                self.assertEqual(line.base_debit or Decimal('0'), Decimal('0'))

    def test_afn_expense_rate_is_one(self):
        expense = create_expense(
            amount=Decimal('5000.00'),
            currency=AFN,
        )
        journal = journal_for_source(expense)
        for line in journal.lines.all():
            self.assertEqual(line.currency, AFN)
            self.assertEqual(line.exchange_rate, Decimal('1'))
            native = line.debit if line.debit > 0 else line.credit
            base = line.base_debit if line.debit > 0 else line.base_credit
            self.assertEqual(native, Decimal('5000.00'))
            self.assertEqual(base, Decimal('5000.00'))

    def test_line_rate_unchanged_when_today_rate_changes(self):
        expense = create_expense(
            amount=Decimal('100.00'),
            currency=USD,
        )
        create_exchange_rate(
            from_currency=USD,
            rate=USD_RATE_9000,
            when=TXN_WHEN + timedelta(days=1),
        )
        journal = journal_for_source(expense)
        for line in journal.lines.all():
            self.assertEqual(line.exchange_rate, USD_RATE_8720)
            base = line.base_debit if line.debit > 0 else line.base_credit
            self.assertEqual(base, Decimal('8720.00'))

        expense.refresh_from_db()
        self.assertEqual(expense.exchange_rate, USD_RATE_8720)
        self.assertEqual(expense.amount_base, Decimal('8720.00'))

    def test_prepare_rejects_both_debit_and_credit(self):
        from api.services.accounting.coa import get_gl_account

        gl = get_gl_account('1000', currency_id=AFN)
        with self.assertRaises(ValidationError):
            prepare_posted_line(
                {'gl_account': gl, 'debit': Decimal('10'), 'credit': Decimal('10')},
                entry_date=TXN_WHEN,
            )

    def test_backfill_restores_rate_from_source_without_inventing(self):
        expense = create_expense(
            amount=Decimal('100.00'),
            currency=USD,
        )
        journal = journal_for_source(expense)
        JournalLine.objects.filter(journal_entry=journal).update(
            exchange_rate=None,
            base_debit=None,
            base_credit=None,
            needs_rate_review=True,
        )
        result = backfill_existing_journal_lines()
        self.assertGreaterEqual(result['filled'], 2)
        for line in journal.lines.all():
            line.refresh_from_db()
            self.assertEqual(line.exchange_rate, USD_RATE_8720)
            self.assertFalse(line.needs_rate_review)
            base = line.base_debit if line.debit > 0 else line.base_credit
            self.assertEqual(base, Decimal('8720.00'))

    def test_backfill_does_not_invent_rate_without_source_or_history(self):
        from api.models.data.journal import JournalEntry
        from api.services.accounting.coa import get_gl_account
        from api.services.fiscal_year import get_fiscal_year_for_date

        entry = JournalEntry.objects.create(
            entry_date=TXN_WHEN,
            reference_number='P1-ORPHAN',
            description='manual foreign line with no source and no usable rate',
            is_auto=False,
            fiscal_year=get_fiscal_year_for_date(TXN_WHEN),
        )
        # Strip the USD rate that setUpTestData created so lookup cannot fill.
        from api.models.data.currency import ExchangeRate
        ExchangeRate.objects.all().delete()

        gl = get_gl_account('5000', currency_id=AFN)
        line = JournalLine.objects.create(
            journal_entry=entry,
            gl_account=gl,
            currency=USD,
            debit=Decimal('0'),
            credit=Decimal('100.00'),
            exchange_rate=None,
            base_debit=None,
            base_credit=None,
            needs_rate_review=True,
        )
        result = backfill_existing_journal_lines()
        line.refresh_from_db()
        self.assertTrue(line.needs_rate_review)
        self.assertIsNone(line.exchange_rate)
        self.assertIsNone(line.base_credit)
        self.assertGreaterEqual(result['needs_review'], 1)
