"""Phase 8: Decimal math, atomic posting, no silent journal rewrite."""
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import transaction
from django.test import TestCase

from api.models.data.expenses import Expense
from api.models.data.journal import JournalEntry, JournalLine
from api.services.contact_ledger import prepare_transaction_history
from api.services.daily_ledger import build_journal_daily_ledger
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    create_exchange_rate,
    create_expense,
    journal_for_source,
    native_totals,
)


class Phase8StabilizationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)

    def test_no_rebuild_journals_management_command(self):
        root = Path(__file__).resolve().parents[2] / 'management' / 'commands'
        rebuild = list(root.glob('*rebuild*journal*'))
        self.assertEqual(rebuild, [], 'Silent journal rebuild commands must not ship for production.')

    def test_accounting_services_have_no_float_calls(self):
        """Posting/FX/report core must not call float() for math."""
        accounting_dir = Path(__file__).resolve().parents[2] / 'services' / 'accounting'
        offenders = []
        for path in accounting_dir.glob('*.py'):
            text = path.read_text()
            if 'float(' in text:
                offenders.append(path.name)
        self.assertEqual(offenders, [])

    def test_expense_journal_failure_rolls_back_source(self):
        before_expenses = Expense.objects.count()
        before_journals = JournalEntry.objects.count()

        with patch(
            'api.services.accounting.sync_expense_journal',
            side_effect=ValidationError('forced posting failure'),
        ):
            with self.assertRaises(ValidationError):
                with transaction.atomic():
                    create_expense(
                        amount=Decimal('100.00'),
                        currency=USD,
                        description='must roll back',
                    )

        self.assertEqual(Expense.objects.count(), before_expenses)
        self.assertEqual(JournalEntry.objects.count(), before_journals)

    def test_usd_expense_still_posts_decimal_balanced_journal(self):
        expense = create_expense(
            amount=Decimal('100.00'),
            currency=USD,
            description='phase8 ok',
        )
        journal = journal_for_source(expense)
        self.assertIsNotNone(journal)
        debit, credit = native_totals(journal)
        self.assertEqual(debit, credit)
        self.assertEqual(debit, Decimal('100.00'))
        for line in journal.lines.all():
            self.assertIsInstance(line.debit, Decimal)
            self.assertIsInstance(line.credit, Decimal)
            self.assertIsInstance(line.base_debit, Decimal)
            self.assertIsInstance(line.base_credit, Decimal)
            self.assertEqual(line.exchange_rate, USD_RATE_8720)

    def test_contact_history_totals_accumulate_as_decimal(self):
        rows = []
        for i in range(10):
            rows.append({
                'id': f'tx-{i}',
                'entry_date': TXN_WHEN,
                'entry_type_name': 'Sale',
                'entry_type_key': 'sale',
                'reference_number': str(i),
                'debit_amount': 0.1,  # float-dangerous input; history must still be exact
                'credit_amount': 0,
                'notes': '',
                'account_currency': 'USD',
            })
        prepared, totals = prepare_transaction_history(rows)
        self.assertEqual(len(prepared), 10)
        # 10 * 0.1 exact Decimal path → 1.00 (not 0.999... float noise)
        self.assertEqual(Decimal(str(totals['USD']['total_debit'])), Decimal('1.0'))
        self.assertEqual(Decimal(str(totals['USD']['balance'])), Decimal('1.0'))

    def test_journal_daily_ledger_cash_totals_are_exact(self):
        create_expense(
            amount=Decimal('10.00'),
            currency=AFN,
            description='afn cash out',
        )
        payload, error = build_journal_daily_ledger(
            start_date=TXN_WHEN,
            end_date=TXN_WHEN,
            currency_id=AFN,
        )
        self.assertIsNone(error)
        totals = payload['totals']
        # Float only at boundary; values must match Decimal money.
        self.assertEqual(Decimal(str(totals['cash_out_base'])), Decimal('10.0'))
        self.assertEqual(
            JournalLine.objects.filter(
                gl_account__code='1000',
                credit__gt=0,
            ).count(),
            1,
        )
