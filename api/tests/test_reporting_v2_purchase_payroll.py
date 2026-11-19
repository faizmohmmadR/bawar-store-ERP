from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from api.models.data.employee import Employee
from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.models.data.payroll import Payroll
from api.models.data.payment import Payment
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.sales import Sales
from api.models.data.vendors import Vendor
from api.services.reporting.contracts import ReportScope
from api.services.reporting.reconciliation import reconcile_documents
from api.tests.accounting.helpers import TXN_WHEN


class PurchasePayrollReconciliationTests(TestCase):
    def setUp(self):
        self.employee = Employee.objects.create(full_name='Worker', currency=1, salary=1000)
        self.vendor = Vendor.objects.create(name='Supplier')

    def lines(self, source):
        return JournalLine.objects.filter(journal_entry__content_type=ContentType.objects.get_for_model(source), journal_entry__object_id=source.pk)

    def report(self, **params):
        return reconcile_documents(ReportScope.from_params(params))

    def purchase(self, status='received', free=False):
        return RawMaterialPurchase.objects.create(vendor=self.vendor, currency=1, total_amount=0 if free else 100,
            total_amount_base=0 if free else 100, purchase_date=TXN_WHEN,
            status=status, transaction_type='free' if free else 'paid')

    def payroll(self, kind='salary', method='cash'):
        return Payroll.objects.create(employee=self.employee, month='august', year=2026, currency=1,
            payroll_type=kind, payment_method=method, amount=100, net_salary=100,
            amount_base=100, net_salary_base=100, manual_net=True, payment_date=TXN_WHEN)

    def goods(self):
        # Build an imported goods settlement with explicit historical snapshots;
        # no reporting or posting helper computes the expected answer.
        sale = Sales.objects.bulk_create([Sales(employee=self.employee, invoice_number='GOODS', currency=1,
            total_amount=100, total_amount_base=100, paid_amount=100, paid_amount_base=100,
            status='confirmed', sale_date=TXN_WHEN)])[0]
        payroll = Payroll.objects.bulk_create([Payroll(employee=self.employee, source_sale=sale,
            month='august', year=2026, currency=1, amount=100, amount_base=100,
            net_salary=100, net_salary_base=100, payment_method='goods', payment_date=TXN_WHEN)])[0]
        journal = JournalEntry.objects.create(content_type=ContentType.objects.get_for_model(sale), object_id=sale.pk, entry_date=TXN_WHEN)
        for code, category, debit, credit in [('5100', 'expense', 100, 0), ('4000', 'revenue', 0, 100)]:
            gl, _ = GLAccount.objects.get_or_create(code=code, currency=1, defaults={'name': code, 'category': category})
            JournalLine.objects.create(journal_entry=journal, gl_account=gl, currency=1,
                debit=debit, credit=credit, base_debit=debit, base_credit=credit, exchange_rate=1)
        return payroll, sale, journal

    def test_received_purchase_matches_inventory_and_payable(self):
        self.purchase()
        self.assertEqual(self.report()['counts']['matched'], 1)

    def test_purchase_precision_difference_is_not_mislabelled_as_bad_source_rate(self):
        source = RawMaterialPurchase.objects.bulk_create([RawMaterialPurchase(vendor=self.vendor,
            invoice_number='PRECISE', currency=2, total_amount=Decimal('100.005'),
            total_amount_base=Decimal('8000.4'), exchange_rate=80, status='received', purchase_date=TXN_WHEN)])[0]
        journal = JournalEntry.objects.create(content_type=ContentType.objects.get_for_model(source),
            object_id=source.pk, entry_date=TXN_WHEN)
        for code, dr, cr in [('1100', Decimal('100.01'), Decimal('0')), ('2000', Decimal('0'), Decimal('100.01'))]:
            JournalLine.objects.create(journal_entry=journal, gl_account=GLAccount.objects.get(code=code, currency=1),
                currency=2, debit=dr, credit=cr, base_debit=dr * 80, base_credit=cr * 80, exchange_rate=80)
        self.assertEqual(self.report()['findings'][0]['errors'], ['source_ledger_rounding_difference'])

    def test_purchase_posted_to_expense_is_rejected(self):
        source = self.purchase()
        self.lines(source).filter(debit__gt=0).update(gl_account=GLAccount.objects.get(code='5000', currency=1))
        self.assertIn('unexpected_account', self.report()['findings'][0]['errors'])

    def test_pending_and_free_purchase_do_not_require_new_journal(self):
        self.purchase(status='pending')
        self.purchase(free=True)
        self.assertEqual(self.report()['counts']['matched'], 2)

    def test_stale_inventory_posting_for_pending_purchase_is_rejected(self):
        source = self.purchase()
        RawMaterialPurchase.objects.filter(pk=source.pk).update(status='pending')
        self.assertEqual(self.report()['findings'][0]['errors'], ['unexpected_purchase_posting'])

    def test_salary_and_advance_have_distinct_debit_roles(self):
        self.payroll()
        self.payroll(kind='advance', method='bank')
        self.assertEqual(self.report()['counts']['matched'], 2)

    def test_advance_recorded_as_salary_expense_is_rejected(self):
        source = self.payroll(kind='advance')
        self.lines(source).filter(debit__gt=0).update(gl_account=GLAccount.objects.get(code='5100', currency=1))
        self.assertIn('unexpected_account', self.report()['findings'][0]['errors'])

    def test_payroll_amount_cannot_disagree_with_net_snapshot(self):
        source = self.payroll()
        Payroll.objects.filter(pk=source.pk).update(net_salary=120)
        self.assertIn('payroll_amount_net_mismatch', self.report()['findings'][0]['errors'])

    def test_goods_matches_sale_wage_and_revenue_without_second_posting(self):
        self.goods()
        self.assertEqual(self.report()['counts']['matched'], 1)

    def test_goods_requires_sale_link(self):
        Payroll.objects.bulk_create([Payroll(employee=self.employee, month='august', year=2026, currency=1,
            amount=100, payment_method='goods', payment_date=TXN_WHEN)])
        self.assertIn('invalid_goods_sale_link', self.report()['findings'][0]['errors'])

    def test_goods_net_base_snapshot_must_match_settlement(self):
        payroll, _, _ = self.goods()
        Payroll.objects.filter(pk=payroll.pk).update(net_salary_base=101)
        self.assertIn('goods_settlement_snapshot_mismatch', self.report()['findings'][0]['errors'])

    def test_goods_cent_rounding_matches_payroll_precision(self):
        _, sale, _ = self.goods()
        Sales.objects.filter(pk=sale.pk).update(total_amount=Decimal('100.004'), total_amount_base=Decimal('100.004'))
        self.assertEqual(self.report()['counts']['matched'], 1)

    def test_goods_wrong_employee_and_value_are_detected(self):
        payroll, sale, _ = self.goods()
        other = Employee.objects.create(full_name='Other', currency=1)
        Payroll.objects.filter(pk=payroll.pk).update(employee=other, amount=99)
        errors = self.report()['findings'][0]['errors']
        self.assertIn('invalid_goods_sale_link', errors)
        self.assertIn('goods_settlement_snapshot_mismatch', errors)

    def test_goods_cannot_have_cash_line_or_payroll_posting(self):
        payroll, _, journal = self.goods()
        cash = GLAccount.objects.get(code='1000', currency=1)
        JournalLine.objects.create(journal_entry=journal, gl_account=cash, currency=1,
            debit=1, credit=0, base_debit=1, base_credit=0, exchange_rate=1)
        JournalEntry.objects.create(content_type=ContentType.objects.get_for_model(payroll), object_id=payroll.pk, entry_date=TXN_WHEN)
        # Even a separate empty journal is caught by ledger-health; a live
        # payroll line additionally violates goods reconciliation.
        extra = JournalEntry.objects.filter(content_type=ContentType.objects.get_for_model(payroll), object_id=payroll.pk).first()
        JournalLine.objects.create(journal_entry=extra, gl_account=cash, currency=1,
            debit=1, credit=0, base_debit=1, base_credit=0, exchange_rate=1)
        errors = self.report()['findings'][0]['errors']
        self.assertIn('cash_movement_on_goods_sale', errors)
        self.assertIn('unexpected_payroll_posting', errors)

    def test_goods_with_deleted_sale_or_missing_sale_posting_is_rejected(self):
        _, sale, _ = self.goods()
        Sales.objects.filter(pk=sale.pk).update(deleted_at=TXN_WHEN)
        self.lines(sale).delete()
        errors = self.report()['findings'][0]['errors']
        self.assertIn('invalid_goods_sale_link', errors)
        self.assertIn('missing_goods_sale_posting', errors)

    def test_cutoff_excludes_later_goods_sale_journal(self):
        _, _, journal = self.goods()
        JournalEntry.objects.filter(pk=journal.pk).update(entry_date=TXN_WHEN + timedelta(days=2))
        self.assertIn('missing_goods_sale_posting', self.report(end_date=TXN_WHEN.date().isoformat())['findings'][0]['errors'])

    def test_payment_on_goods_sale_is_flagged_without_double_counting(self):
        _, sale, _ = self.goods()
        Payment.objects.bulk_create([Payment(content_type=ContentType.objects.get_for_model(sale), object_id=sale.pk,
            payment_type='sale', amount=100, amount_base=100, currency=1, payment_date=TXN_WHEN)])
        self.assertIn('unexpected_goods_sale_payment', self.report()['findings'][0]['errors'])
