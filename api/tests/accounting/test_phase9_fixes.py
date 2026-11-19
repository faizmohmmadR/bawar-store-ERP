"""Coverage for critical journal fixes: loans, withdrawals, FX exchange, payroll, depreciation."""
from datetime import date
from decimal import Decimal

from django.test import TestCase

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.employee import Employee
from api.models.data.equipment import Equipment
from api.models.data.payroll import Payroll
from api.services.accounting.amounts import d
from api.services.accounting.coa import get_gl_account
from api.services.accounting.depreciation import (
    run_monthly_depreciation,
    sync_equipment_depreciation_journal,
)
from api.services.currency_conversion import populate_base_amounts
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    USD_RATE_9000,
    create_currency_exchange,
    create_exchange_rate,
    create_loan,
    create_withdrawal,
    journal_for_source,
    native_totals,
    seed_cash,
)


class Phase9JournalFixTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)

    def test_loan_out_posts_receivable_and_cash(self):
        loan = create_loan(
            amount=Decimal('500.00'),
            currency=USD,
            loan_type='loan_out',
            payment_method='cash',
        )
        journal = journal_for_source(loan)
        self.assertIsNotNone(journal)
        debit, credit = native_totals(journal)
        self.assertEqual(debit, credit)
        self.assertEqual(debit, Decimal('500.00'))
        by_code = {
            line.gl_account.code: line
            for line in journal.lines.select_related('gl_account')
        }
        self.assertEqual(d(by_code['1310'].debit), Decimal('500.00'))
        self.assertEqual(d(by_code['1000'].credit), Decimal('500.00'))
        self.assertEqual(by_code['1000'].gl_account.currency, USD)

    def test_withdrawal_posts_owner_draw(self):
        withdrawal = create_withdrawal(
            amount=Decimal('100.00'),
            currency=AFN,
            payment_method='cash',
        )
        journal = journal_for_source(withdrawal)
        self.assertIsNotNone(journal)
        debit, credit = native_totals(journal)
        self.assertEqual(debit, credit)
        by_code = {
            line.gl_account.code: line
            for line in journal.lines.select_related('gl_account')
        }
        self.assertIn('3100', by_code)
        self.assertEqual(d(by_code['3100'].debit), Decimal('100.00'))
        self.assertEqual(d(by_code['1000'].credit), Decimal('100.00'))

    def test_currency_exchange_with_carrying_posts_realized_gain(self):
        seed_cash(amount=Decimal('1000.00'), currency=USD, when=TXN_WHEN)
        exchange = create_currency_exchange(
            from_currency=USD,
            from_amount=Decimal('1000.00'),
            to_currency=AFN,
            to_amount=Decimal('90000.00'),
            rate=USD_RATE_9000,
        )
        journal = journal_for_source(exchange)
        self.assertIsNotNone(journal)
        lines = list(journal.lines.select_related('gl_account'))
        gain = next(line for line in lines if line.gl_account.code == '4300')
        self.assertEqual(d(gain.credit), Decimal('2800.00'))
        base_debit = sum((d(line.base_debit) for line in lines), Decimal('0'))
        base_credit = sum((d(line.base_credit) for line in lines), Decimal('0'))
        self.assertEqual(base_debit, base_credit)

    def test_payroll_bank_credits_bank_gl(self):
        employee = Employee.objects.create(
            full_name='Phase9 Payroll',
            salary=Decimal('1000.00'),
            currency=AFN,
        )
        payroll = Payroll(
            employee=employee,
            payroll_type=Payroll.PAYROLL_TYPE_SALARY,
            month='august',
            year=2026,
            amount=Decimal('1000.00'),
            net_salary=Decimal('1000.00'),
            basic_salary=Decimal('1000.00'),
            currency=AFN,
            payment_method='bank',
            payment_date=TXN_WHEN,
            manual_net=True,
        )
        populate_base_amounts(
            payroll,
            amount_fields=['amount', 'net_salary', 'basic_salary'],
            at_datetime=TXN_WHEN,
            raise_if_missing=True,
        )
        payroll.save()

        journal = journal_for_source(payroll)
        self.assertIsNotNone(journal)
        bank_line = next(
            line
            for line in journal.lines.select_related('gl_account')
            if line.gl_account.code == '1050'
        )
        self.assertEqual(d(bank_line.credit), Decimal('1000.00'))
        self.assertEqual(bank_line.gl_account.currency, AFN)

    def test_monthly_depreciation_posts_and_is_idempotent(self):
        equipment = Equipment.objects.create(
            name='Depreciable Mixer',
            quantity=Decimal('1'),
            unit_cost=Decimal('12000.00'),
            currency=AFN,
            acquired_date=date(2026, 1, 1),
            depreciation_start_date=date(2026, 1, 1),
            useful_life_months=12,
            residual_value=Decimal('0'),
            acquisition_type='new_purchase',
            payment_method='cash',
        )
        period_end = date(2026, 8, 31)
        first = sync_equipment_depreciation_journal(equipment, period_end=period_end)
        self.assertIsNotNone(first)
        equipment.refresh_from_db()
        self.assertEqual(d(equipment.accumulated_depreciation), Decimal('1000.00'))

        expense = get_gl_account('5150', currency_id=BASE_CURRENCY_ID)
        accum = get_gl_account('1410', currency_id=BASE_CURRENCY_ID)
        self.assertEqual(
            d(first.lines.get(gl_account=expense).debit),
            Decimal('1000.00'),
        )
        self.assertEqual(
            d(first.lines.get(gl_account=accum).credit),
            Decimal('1000.00'),
        )

        second = sync_equipment_depreciation_journal(equipment, period_end=period_end)
        self.assertEqual(first.pk, second.pk)
        equipment.refresh_from_db()
        self.assertEqual(d(equipment.accumulated_depreciation), Decimal('1000.00'))

        result = run_monthly_depreciation(as_of_date=period_end)
        self.assertEqual(result['posted'], 0)
        self.assertGreaterEqual(result['skipped'], 1)
