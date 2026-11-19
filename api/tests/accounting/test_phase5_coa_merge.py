from decimal import Decimal

from django.test import TestCase

from api.constants.gl_roles import (
    CURRENCY_SPECIFIC_GL_CODES,
    is_currency_specific_gl_code,
)
from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS
from api.models.data.journal import DEFAULT_GL_ACCOUNTS, GLAccount
from api.services.accounting.amounts import d
from api.services.accounting.coa import (
    get_gl_account,
    get_gl_for_role,
)
from api.services.accounting.coa_merge import merge_generic_gl_accounts
from api.tests.accounting.helpers import (
    AFN,
    TXN_WHEN,
    USD,
    USD_RATE_8720,
    cash_native_net,
    create_exchange_rate,
    create_expense,
    gl_native_net,
    journal_for_source,
)


class Phase5CoaMergeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        create_exchange_rate(from_currency=USD, rate=USD_RATE_8720, when=TXN_WHEN)

    def test_cash_remains_currency_specific_expense_is_generic(self):
        cash_usd = get_gl_account('1000', currency_id=USD)
        cash_afn = get_gl_account('1000', currency_id=AFN)
        self.assertEqual(cash_usd.currency, USD)
        self.assertEqual(cash_afn.currency, AFN)
        self.assertNotEqual(cash_usd.pk, cash_afn.pk)

        exp_usd_ctx = get_gl_account('5000', currency_id=USD)
        exp_afn_ctx = get_gl_account('5000', currency_id=AFN)
        self.assertEqual(exp_usd_ctx.pk, exp_afn_ctx.pk)
        self.assertEqual(exp_usd_ctx.currency, AFN)
        self.assertFalse(is_currency_specific_gl_code('5000'))
        self.assertTrue(is_currency_specific_gl_code('1000'))

    def test_usd_expense_posts_to_generic_expense_and_cash_usd(self):
        expense = create_expense(
            amount=Decimal('100.00'),
            currency=USD,
            description='USD fuel phase5',
        )
        journal = journal_for_source(expense)
        by_code = {line.gl_account.code: line for line in journal.lines.select_related('gl_account')}

        self.assertEqual(by_code['5000'].currency, USD)
        self.assertEqual(by_code['5000'].gl_account.currency, AFN)
        self.assertEqual(d(by_code['5000'].debit), Decimal('100.00'))
        self.assertEqual(d(by_code['5000'].base_debit), Decimal('8720.00'))

        self.assertEqual(by_code['1000'].currency, USD)
        self.assertEqual(by_code['1000'].gl_account.currency, USD)

    def test_no_active_foreign_generic_duplicates_after_ensure(self):
        # Simulate legacy duplicates then merge
        for currency_id in CURRENCY_DEFINITIONS:
            if int(currency_id) == int(BASE_CURRENCY_ID):
                continue
            for code, name, category in DEFAULT_GL_ACCOUNTS:
                if code in CURRENCY_SPECIFIC_GL_CODES:
                    continue
                GLAccount.objects.get_or_create(
                    currency=currency_id,
                    code=code,
                    defaults={
                        'name': f'{name} (legacy)',
                        'category': category,
                        'is_system': True,
                        'is_active': True,
                    },
                )

        result = merge_generic_gl_accounts(dry_run=False)
        self.assertGreaterEqual(result['deactivated'], 1)

        active_generic_usd = GLAccount.objects.filter(
            currency=USD,
            code='5000',
            is_active=True,
        ).count()
        self.assertEqual(active_generic_usd, 0)

        active_generic_afn = GLAccount.objects.filter(
            currency=AFN,
            code='5000',
            is_active=True,
        ).count()
        self.assertEqual(active_generic_afn, 1)

    def test_ar_role_resolves_same_account_for_usd_and_afn_context(self):
        ar_usd = get_gl_for_role('accounts_receivable', currency_id=USD)
        ar_afn = get_gl_for_role('accounts_receivable', currency_id=AFN)
        self.assertEqual(ar_usd.pk, ar_afn.pk)
