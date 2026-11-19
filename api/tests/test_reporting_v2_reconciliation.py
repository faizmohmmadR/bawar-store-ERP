from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.expenses import Expense
from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.services.reporting.contracts import ReportScope
from api.services.reporting.reconciliation import reconcile_documents
from api.tests.accounting.helpers import (
    create_expense, create_withdrawal, create_exchange_rate, create_staff_user, TXN_WHEN,
)


class DocumentReconciliationTests(TestCase):
    def report(self, **params):
        return reconcile_documents(ReportScope.from_params(params))

    def lines(self, source):
        return JournalLine.objects.filter(journal_entry__content_type=ContentType.objects.get_for_model(source), journal_entry__object_id=source.pk)

    def test_correct_expense_and_withdrawal_match_separate_roles(self):
        create_expense(amount=Decimal('100.25'))
        create_withdrawal(amount=Decimal('25.50'), payment_method='bank')
        self.assertEqual(self.report()['counts'], {'checked': 2, 'matched': 2, 'mismatched': 0, 'requires_review': 0})

    def test_balanced_but_wrong_amount_is_detected(self):
        source = create_expense(amount=Decimal('100'))
        self.lines(source).filter(debit__gt=0).update(debit=90, base_debit=90)
        self.lines(source).filter(credit__gt=0).update(credit=90, base_credit=90)
        self.assertEqual(self.report()['findings'][0]['errors'], ['credit_amount_mismatch', 'debit_amount_mismatch'])

    def test_balanced_wrong_account_is_detected(self):
        source = create_expense(amount=Decimal('100'))
        wrong = GLAccount.objects.get(code='3100', currency=1)
        self.lines(source).filter(debit__gt=0).update(gl_account=wrong)
        self.assertIn('unexpected_account', self.report()['findings'][0]['errors'])

    def test_wrong_cash_method_is_detected(self):
        source = create_expense(amount=Decimal('100'))
        bank = GLAccount.objects.get(code='1050', currency=1)
        self.lines(source).filter(credit__gt=0).update(gl_account=bank)
        self.assertIn('unexpected_account', self.report()['findings'][0]['errors'])

    def test_foreign_currency_uses_saved_historical_rate(self):
        create_exchange_rate(from_currency=2, rate=Decimal('80'), when=TXN_WHEN)
        create_expense(amount=Decimal('10'), currency=2)
        self.assertEqual(self.report(currency=2)['counts']['matched'], 1)
        JournalLine.objects.filter(currency=2).update(exchange_rate=90)
        self.assertIn('line_rate_mismatch', self.report()['findings'][0]['errors'])

    def test_missing_and_deleted_lines_are_not_treated_as_paid(self):
        source = create_expense(amount=Decimal('100'))
        self.lines(source).update(deleted_at=TXN_WHEN)
        self.assertIn('missing_posting', self.report()['findings'][0]['errors'])

    def test_unknown_base_is_not_silently_zero(self):
        source = create_expense(amount=Decimal('100'))
        self.lines(source).filter(debit__gt=0).update(base_debit=None)
        self.assertIn('unknown_base_amount', self.report()['findings'][0]['errors'])

    def test_source_snapshot_error_is_detected(self):
        source = create_expense(amount=Decimal('100'))
        Expense.objects.filter(pk=source.pk).update(amount_base=99)
        self.assertIn('source_base_amount_mismatch', self.report()['findings'][0]['errors'])

    def test_read_only_and_currency_filter(self):
        create_expense(amount=Decimal('100'))
        before = (JournalEntry.objects.count(), JournalLine.objects.count())
        self.assertEqual(self.report(currency=2)['counts']['checked'], 0)
        self.report()
        self.assertEqual(before, (JournalEntry.objects.count(), JournalLine.objects.count()))

    def test_api_permissions_pagination_and_filter_validation(self):
        source = create_expense(amount=Decimal('100'))
        self.lines(source).delete()
        client = APIClient()
        self.assertIn(client.get('/api/reports/v2/document-reconciliation/').status_code, (401, 403))
        user = create_staff_user(username='reconcile', email='reconcile@example.com', as_admin=True)
        client.force_authenticate(user)
        response = client.get('/api/reports/v2/document-reconciliation/', {'page_size': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['meta']['source_reconciliation'], 'not_verified')
        self.assertEqual(client.get('/api/reports/v2/document-reconciliation/', {'account_id': 1}).status_code, 400)
