"""Coverage checks must find broken links without changing the books."""
from datetime import datetime, timezone as dt_timezone

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.customers import Customer
from api.models.data.employee import Employee
from api.models.data.expenses import Expense, ExpenseCategory
from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.models.data.payroll import Payroll
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.sales import Sales
from api.models.data.vendors import Vendor
from api.services.reporting.contracts import ReportScope
from api.services.reporting.opening import opening_review
from api.services.reporting.source_audit import source_coverage
from api.tests.accounting.helpers import create_staff_user

WHEN = datetime(2026, 11, 2, 12, tzinfo=dt_timezone.utc)


class SourceCoverageTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.category = ExpenseCategory.objects.create(name='Audit fixture')
        cls.customer = Customer.objects.create(name='Customer')
        cls.vendor = Vendor.objects.create(name='Vendor')
        cls.employee = Employee.objects.create(full_name='Employee', currency=1)
        cls.user = create_staff_user(username='coverage-admin', email='coverage@example.com', as_admin=True)

    def expense(self, when=WHEN):
        # Bulk insertion deliberately simulates an imported document whose
        # posting signal never ran. No posting service is called by the audit.
        return Expense.objects.bulk_create([Expense(category=self.category, amount=100, currency=1, expense_date=when)])[0]

    def journal(self, source=None, *, reference='DOC-1', when=WHEN, auto=True, object_id=None, content_type=None):
        return JournalEntry.objects.create(
            content_type=content_type or (ContentType.objects.get_for_model(source) if source else None),
            object_id=object_id if object_id is not None else (source.pk if source else None),
            entry_date=when, reference_number=reference, is_auto=auto,
        )

    def findings(self, scope=None):
        return source_coverage(scope or ReportScope())['findings']

    def test_missing_postable_document_is_found_without_writing(self):
        source = self.expense()
        before = (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count())
        result = self.findings()
        self.assertEqual(result, [{'kind': 'missing_journal', 'source_model': 'expense', 'source_id': source.pk, 'journal_ids': [], 'reason': 'positive_postable_document'}])
        self.assertEqual(before, (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count()))

    def test_correct_link_is_not_missing(self):
        source = self.expense()
        self.journal(source)
        self.assertEqual(self.findings(), [])

    def test_generic_id_collision_cannot_settle_another_model(self):
        expense = self.expense()
        sale = Sales.objects.bulk_create([Sales(customer=self.customer, invoice_number='SALE-COLLISION', total_amount=100, currency=1, status='confirmed', sale_date=WHEN)])[0]
        self.journal(sale)
        missing = [row for row in self.findings() if row['kind'] == 'missing_journal']
        self.assertEqual([(row['source_model'], row['source_id']) for row in missing], [('expense', expense.pk)])

    def test_deleted_source_with_live_journal_is_flagged(self):
        source = self.expense()
        self.journal(source)
        Expense.objects.filter(pk=source.pk).update(deleted_at=WHEN)
        self.assertEqual(self.findings()[0]['reason'], 'deleted_source')

    def test_hard_missing_source_is_flagged(self):
        self.journal(content_type=ContentType.objects.get_for_model(Expense), object_id=99999)
        self.assertEqual(self.findings()[0]['kind'], 'missing_source')

    def test_unlinked_manual_entry_is_allowed_but_automatic_requires_source(self):
        self.journal(auto=False)
        automatic = self.journal(reference='AUTO')
        self.assertEqual(self.findings(), [{'kind': 'automatic_journal_without_source', 'source_model': None, 'source_id': None, 'journal_ids': [automatic.pk], 'reason': None}])

    def test_closing_entry_without_source_is_not_reported_as_orphan(self):
        journal = self.journal()
        JournalEntry.objects.filter(pk=journal.pk).update(is_closing_entry=True)
        self.assertEqual(self.findings(), [])

    def test_duplicate_same_reference_is_flagged(self):
        source = self.expense()
        first, second = self.journal(source), self.journal(source)
        self.assertEqual(self.findings()[0]['journal_ids'], [second.pk, first.pk])
        self.assertEqual(self.findings()[0]['kind'], 'possible_duplicate_journal')

    def test_different_references_for_same_source_are_not_assumed_duplicate(self):
        source = self.expense()
        self.journal(source)
        self.journal(source, reference='DOC-COMMISSION')
        self.assertEqual(self.findings(), [])

    def test_multiple_blank_references_require_review(self):
        source = self.expense()
        self.journal(source, reference=None)
        self.journal(source, reference='')
        self.assertEqual(self.findings()[0]['reason'], 'multiple_unreferenced_journals')

    def test_uncovered_source_type_is_explicitly_reported(self):
        self.journal(self.customer)
        self.assertEqual(self.findings()[0]['kind'], 'unsupported_source_rule')

    def test_non_api_source_is_not_mistaken_for_a_supported_document(self):
        self.journal(self.user)
        self.assertEqual(self.findings()[0]['kind'], 'unsupported_source_rule')

    def test_goods_payroll_does_not_require_second_journal(self):
        row = Payroll.objects.bulk_create([Payroll(employee=self.employee, month='november', year=2026, amount=100, currency=1, payment_method='goods', payment_date=WHEN)])[0]
        self.assertEqual(self.findings(), [])
        self.journal(row)
        self.assertEqual(self.findings()[0]['reason'], 'goods_settled_on_sale')

    def test_pending_purchase_does_not_require_inventory_journal(self):
        source = RawMaterialPurchase.objects.bulk_create([RawMaterialPurchase(vendor=self.vendor, invoice_number='PENDING', purchase_date=WHEN, currency=1, total_amount=100, status='pending')])[0]
        self.assertEqual(self.findings(), [])
        self.journal(source)
        self.assertEqual(self.findings()[0]['reason'], 'unposted_status')

    def test_old_source_status_is_checked_when_journal_is_in_period(self):
        source = RawMaterialPurchase.objects.bulk_create([RawMaterialPurchase(vendor=self.vendor, invoice_number='OLD-PENDING', purchase_date=datetime(2026, 10, 1, tzinfo=dt_timezone.utc), currency=1, total_amount=100, status='pending')])[0]
        self.journal(source)
        rows = self.findings(ReportScope.from_params({'start_date': '2026-11-01', 'end_date': '2026-11-04'}))
        self.assertEqual(rows[0]['kind'], 'unexpected_journal')

    def test_journal_after_cutoff_does_not_hide_missing_at_cutoff(self):
        source = self.expense()
        self.journal(source, when=datetime(2026, 12, 1, tzinfo=dt_timezone.utc))
        self.assertEqual(self.findings(ReportScope.from_params({'end_date': '2026-11-04'}))[0]['kind'], 'missing_journal')

    def test_pre_period_journal_prevents_false_missing_and_flags_wrong_date(self):
        source = self.expense()
        self.journal(source, when=datetime(2026, 10, 1, tzinfo=dt_timezone.utc))
        rows = self.findings(ReportScope.from_params({'start_date': '2026-11-01', 'end_date': '2026-11-04'}))
        self.assertEqual([row['kind'] for row in rows], ['source_journal_date_mismatch'])

    def test_source_after_cutoff_is_not_accepted_for_earlier_journal(self):
        source = self.expense(when=datetime(2026, 12, 1, tzinfo=dt_timezone.utc))
        self.journal(source)
        rows = self.findings(ReportScope.from_params({'end_date': '2026-11-04'}))
        self.assertEqual(rows[0]['kind'], 'source_after_cutoff')

    def test_api_is_paginated_and_rejects_filters_that_hide_missing_sources(self):
        self.expense()
        self.expense()
        client = APIClient()
        client.force_authenticate(self.user)
        response = client.get('/api/reports/v2/source-coverage/', {'page_size': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['count'], len(response.data['results'])), (2, 1))
        self.assertIsNotNone(response.data['next'])
        self.assertEqual(response.data['meta']['source_reconciliation'], 'not_verified')
        self.assertEqual(client.get('/api/reports/v2/source-coverage/', {'currency': 1}).status_code, 400)
        client.force_authenticate(user=None)
        self.assertIn(client.get('/api/reports/v2/source-coverage/').status_code, (401, 403))


class OpeningReviewTests(TestCase):
    def test_opening_requires_start_date(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            opening_review(ReportScope())

    def test_opening_excludes_period_activity_and_reports_equity_as_evidence(self):
        cash = GLAccount.objects.get(code='1000', currency=1)
        equity = GLAccount.objects.get(code='3000', currency=1)
        for when, amount in ((datetime(2026, 10, 1, tzinfo=dt_timezone.utc), 100), (WHEN, 30)):
            journal = JournalEntry.objects.create(entry_date=when, is_auto=False)
            JournalLine.objects.bulk_create([
                JournalLine(journal_entry=journal, gl_account=cash, currency=1, debit=amount, credit=0, base_debit=amount, base_credit=0, exchange_rate=1),
                JournalLine(journal_entry=journal, gl_account=equity, currency=1, debit=0, credit=amount, base_debit=0, base_credit=amount, exchange_rate=1),
            ])
        result = opening_review(ReportScope.from_params({'start_date': '2026-11-01', 'account_id': cash.pk}))
        self.assertEqual(result['rows'][0]['recorded_opening_balance'], '100.00')
        self.assertEqual(result['equity_evidence_journal_count'], 1)
        self.assertEqual(result['status'], 'requires_opening_reconciliation')

    def test_no_recorded_history_does_not_certify_zero_opening(self):
        report = opening_review(ReportScope.from_params({'start_date': '2026-11-01'}))
        self.assertEqual(report['rows'], [])
        self.assertEqual(report['status'], 'requires_opening_reconciliation')
