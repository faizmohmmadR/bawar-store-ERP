"""Phase 0 architecture audit — documents current ledger/CoA/report gaps."""
from django.test import TestCase

from api.models.data.currency import BASE_CURRENCY_ID, SUPPORTED_CURRENCY_CODES
from api.models.data.journal import GLAccount, JournalLine
from api.tests.accounting.helpers import (
    AFN,
    USD,
    has_accounting_module,
    has_api_model,
    has_gl_role,
    journal_line_field_names,
    journal_line_has_functional_fields,
)


class Phase0ArchitectureAuditTests(TestCase):
    """Facts about the current system. Failures here mean the audit is stale."""

    def test_supported_currencies_and_functional_afn(self):
        self.assertEqual(SUPPORTED_CURRENCY_CODES, ('AFN', 'USD', 'KDR'))
        self.assertEqual(BASE_CURRENCY_ID, AFN)
        from api.models.data.currency import CURRENCY_DEFINITIONS

        self.assertNotIn(4, CURRENCY_DEFINITIONS)
        self.assertEqual(AFN, 1)
        self.assertEqual(USD, 2)

    def test_journal_line_has_functional_fields(self):
        """Phase 1 added currency / rate / base on JournalLine."""
        names = journal_line_field_names()
        self.assertIn('gl_account', names)
        self.assertIn('debit', names)
        self.assertIn('credit', names)
        self.assertTrue(journal_line_has_functional_fields())
        self.assertIn('currency', names)
        self.assertIn('exchange_rate', names)
        self.assertIn('base_debit', names)
        self.assertIn('base_credit', names)
        self.assertIn('needs_rate_review', names)

        constraint_names = {c.name for c in GLAccount._meta.constraints}

        from api.constants.gl_roles import CURRENCY_SPECIFIC_GL_CODES
        from api.models.data.currency import CURRENCY_DEFINITIONS, BASE_CURRENCY_ID
        from api.models.data.journal import DEFAULT_GL_ACCOUNTS

        all_codes = {code for code, _, _ in DEFAULT_GL_ACCOUNTS}
        generic_codes = all_codes - CURRENCY_SPECIFIC_GL_CODES

        for currency_id in CURRENCY_DEFINITIONS:
            specific = set(
                GLAccount.objects.filter(
                    currency=currency_id,
                    code__in=CURRENCY_SPECIFIC_GL_CODES,
                    is_active=True,
                ).values_list('code', flat=True)
            )
            self.assertEqual(specific, CURRENCY_SPECIFIC_GL_CODES)

        home_generics = set(
            GLAccount.objects.filter(
                currency=BASE_CURRENCY_ID,
                code__in=generic_codes,
                is_active=True,
            ).values_list('code', flat=True)
        )
        self.assertTrue(generic_codes <= home_generics)

        # No active foreign-currency Operating Expense after Phase 5 provisioning
        self.assertFalse(
            GLAccount.objects.filter(
                currency=USD,
                code='5000',
                is_active=True,
            ).exists()
        )

    def test_deferred_later_phases_note(self):
        """Phases 0–8 multi-currency plumbing is in place."""
        self.assertTrue(has_api_model('CurrencyExchange'))
        self.assertTrue(has_api_model('FxRevaluation'))
        self.assertTrue(has_accounting_module('fx'))
        self.assertTrue(has_accounting_module('revaluation'))
        self.assertTrue(has_accounting_module('coa_merge'))
        self.assertTrue(has_gl_role(
            'unrealized_fx_gain', 'unrealized_fx_loss'))
        self.assertFalse(has_gl_role('unrealized_fx', 'fx_unrealized'))

    def test_journal_line_amounts_are_decimal_not_float(self):
        debit = JournalLine._meta.get_field('debit')
        credit = JournalLine._meta.get_field('credit')
        self.assertEqual(debit.get_internal_type(), 'DecimalField')
        self.assertEqual(credit.get_internal_type(), 'DecimalField')
