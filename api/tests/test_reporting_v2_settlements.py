from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.models.data.loan import Loan
from api.models.data.payment import Payment
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.sales import Sales
from api.models.data.vendors import Vendor
from api.services.general_payments import save_general_payment
from api.services.reporting.contracts import ReportScope
from api.services.reporting.settlements import reconcile_settlements
from api.tests.accounting.helpers import (
    TXN_WHEN, create_confirmed_sale, create_order_payment, create_exchange_rate,
    create_loan, create_loan_payment, create_staff_user,
)


class SettlementReconciliationTests(TestCase):
    def report(self, **params):
        return reconcile_settlements(ReportScope.from_params(params))

    def lines(self, source):
        return JournalLine.objects.filter(journal_entry__content_type=ContentType.objects.get_for_model(source), journal_entry__object_id=source.pk)

    def sale(self, amount='100', **kwargs):
        return create_confirmed_sale(amount=Decimal(amount), **kwargs)

    def purchase(self, currency=1, total=100, base=100, fx=1):
        return RawMaterialPurchase.objects.create(vendor=Vendor.objects.create(name='Supplier'),
            status='received', currency=currency, total_amount=total, total_amount_base=base,
            exchange_rate=fx, purchase_date=TXN_WHEN)

    def receipt(self, sale, amount='100', when=TXN_WHEN):
        return save_general_payment(dict(payment_type='sale', customer=sale.customer, currency=1,
            amount=Decimal(amount), amount_base=Decimal(amount), exchange_rate=Decimal('1'),
            payment_method='cash', payment_date=when))

    def test_customer_sale_and_partial_payment_match(self):
        sale = self.sale()
        create_order_payment(order=sale, amount=Decimal('40'), payment_type='sale')
        self.assertEqual(self.report()['findings'], [])

    def test_sale_wrong_receivable_role_is_detected_even_if_balanced(self):
        sale = self.sale()
        self.lines(sale).filter(gl_account__code='1200').update(gl_account=GLAccount.objects.get(code='1310', currency=1))
        self.assertIn('unexpected_account_or_currency', self.report()['findings'][0]['errors'])

    def test_unposted_sale_with_stale_journal_is_flagged(self):
        sale = self.sale()
        Sales.objects.filter(pk=sale.pk).update(status='cancelled')
        self.assertIn('unexpected_unposted_sale_journal', self.report()['findings'][0]['errors'])

    def test_receivable_fx_gain_uses_invoice_and_payment_rates(self):
        create_exchange_rate(from_currency=2, rate=Decimal('80'), when=TXN_WHEN)
        sale = self.sale(currency=2)
        later = TXN_WHEN + timedelta(days=1)
        create_exchange_rate(from_currency=2, rate=Decimal('90'), when=later)
        create_order_payment(order=sale, amount=Decimal('50'), payment_type='sale', when=later)
        self.assertEqual(self.report()['findings'], [])

    def test_payable_fx_loss_is_not_classified_as_gain(self):
        create_exchange_rate(from_currency=2, rate=Decimal('80'), when=TXN_WHEN)
        purchase = self.purchase(currency=2, base=8000, fx=80)
        later = TXN_WHEN + timedelta(days=1)
        create_exchange_rate(from_currency=2, rate=Decimal('90'), when=later)
        payment = create_order_payment(order=purchase, amount=Decimal('50'), payment_type='purchase', when=later)
        self.assertEqual(self.report()['findings'], [])
        self.lines(payment).filter(gl_account__code='5350').update(gl_account=GLAccount.objects.get(code='4300', currency=1))
        self.assertIn('unexpected_account_or_currency', self.report()['findings'][0]['errors'])

    def test_missing_fx_leg_is_detected(self):
        create_exchange_rate(from_currency=2, rate=Decimal('80'), when=TXN_WHEN)
        sale = self.sale(currency=2)
        later = TXN_WHEN + timedelta(days=1)
        create_exchange_rate(from_currency=2, rate=Decimal('90'), when=later)
        payment = create_order_payment(order=sale, amount=Decimal('50'), payment_type='sale', when=later)
        self.lines(payment).filter(gl_account__code='4300').delete()
        self.assertIn('posting_amount_or_direction_mismatch', self.report()['findings'][0]['errors'])

    def test_general_receipt_and_credit_application_do_not_double_cash(self):
        sale = self.sale()
        receipt = self.receipt(sale)
        self.assertEqual(self.report()['findings'], [])
        application = receipt.allocations.get(is_credit_application=True)
        self.lines(application).filter(gl_account__code='2300').update(gl_account=GLAccount.objects.get(code='1000', currency=1))
        self.assertIn('unexpected_account_or_currency', self.report()['findings'][0]['errors'])

    def test_overapplication_of_older_receipt_is_detected_in_new_period(self):
        sale = self.sale()
        receipt = self.receipt(sale, when=TXN_WHEN - timedelta(days=3))
        application = receipt.allocations.get(is_credit_application=True)
        Payment.objects.filter(pk=application.pk).update(amount=101, payment_date=TXN_WHEN)
        errors = [error for row in self.report(start_date=TXN_WHEN.date().isoformat())['findings'] for error in row['errors']]
        self.assertIn('credit_overapplied', errors)

    def test_deleted_target_is_not_certified_by_existing_payment_posting(self):
        sale = self.sale()
        create_order_payment(order=sale, amount=Decimal('40'), payment_type='sale')
        Sales.objects.filter(pk=sale.pk).update(deleted_at=TXN_WHEN)
        self.assertIn('missing_or_deleted_payment_target', self.report()['findings'][0]['errors'])

    def test_cutoff_excludes_future_payment(self):
        sale = self.sale()
        create_order_payment(order=sale, amount=Decimal('40'), payment_type='sale', when=TXN_WHEN + timedelta(days=3))
        report = self.report(end_date=TXN_WHEN.date().isoformat())
        self.assertEqual(report['counts']['checked'], 1)
        self.assertEqual(report['findings'], [])

    def test_invoice_overallocation_is_detected_without_using_paid_cache(self):
        sale = self.sale()
        payment = create_order_payment(order=sale, amount=Decimal('40'), payment_type='sale')
        Payment.objects.filter(pk=payment.pk).update(amount=101)
        Sales.objects.filter(pk=sale.pk).update(paid_amount=0)
        self.assertTrue(any('invoice_overallocated' in row['errors'] for row in self.report()['findings']))

    def test_gfk_collision_does_not_make_purchase_payment_settle_sale(self):
        sale = self.sale()
        purchase = self.purchase()
        create_order_payment(order=purchase, amount=Decimal('100'), payment_type='purchase')
        self.assertFalse(any('invoice_overallocated' in row['errors'] for row in self.report()['findings']))
        self.assertEqual(self.report()['findings'], [])

    def test_customer_and_vendor_loans_use_distinct_accounts(self):
        create_loan(amount=Decimal('100'))
        Loan.objects.create(vendor=Vendor.objects.create(name='Loan supplier'), loaner_type='vendor',
            loan_type='loan_in', amount=100, amount_base=100, currency=1, loan_date=TXN_WHEN)
        self.assertEqual(self.report()['findings'], [])

    def test_opening_loan_does_not_expect_cash(self):
        loan = create_loan(amount=Decimal('100'))
        Loan.objects.filter(pk=loan.pk).update(is_opening_balance=True)
        self.lines(loan).filter(gl_account__code='1000').update(gl_account=GLAccount.objects.get(code='3000', currency=1))
        self.assertEqual(self.report()['findings'], [])

    def test_loan_payment_fx_and_principal_are_checked_separately(self):
        create_exchange_rate(from_currency=2, rate=Decimal('80'), when=TXN_WHEN)
        loan = create_loan(amount=Decimal('100'), currency=2)
        later = TXN_WHEN + timedelta(days=1)
        create_exchange_rate(from_currency=2, rate=Decimal('90'), when=later)
        create_loan_payment(loan=loan, amount=Decimal('50'), when=later)
        self.assertEqual(self.report()['findings'], [])

    def test_loan_principal_overpayment_is_detected(self):
        loan = create_loan(amount=Decimal('100'))
        create_loan_payment(loan=loan, amount=Decimal('101'))
        self.assertTrue(any('principal_overpaid' in row['errors'] for row in self.report()['findings']))

    def test_future_repayment_cannot_change_past_principal_check(self):
        loan = create_loan(amount=Decimal('100'))
        create_loan_payment(loan=loan, amount=Decimal('101'), when=TXN_WHEN + timedelta(days=3))
        self.assertEqual(self.report(end_date=TXN_WHEN.date().isoformat())['findings'], [])

    def test_overpaid_loan_is_counted_once(self):
        loan = create_loan(amount=Decimal('100'))
        create_loan_payment(loan=loan, amount=Decimal('101'))
        report = self.report()
        self.assertEqual(report['counts']['checked'], 2)
        self.assertEqual(report['counts']['mismatched'], 1)

    def test_credit_allocation_currency_must_match_header(self):
        sale = self.sale()
        receipt = self.receipt(sale)
        allocation = receipt.allocations.get(is_credit_application=True)
        Payment.objects.filter(pk=allocation.pk).update(currency=2)
        errors = [error for row in self.report()['findings'] for error in row['errors']]
        self.assertIn('invalid_receipt_allocation', errors)

    def test_pre_principal_loan_payment_is_not_certified(self):
        loan = create_loan(amount=Decimal('100'))
        create_loan_payment(loan=loan, amount=Decimal('20'), when=TXN_WHEN - timedelta(days=1))
        self.assertTrue(any('loan_payment_before_principal' in row['errors'] for row in self.report()['findings']))

    def test_api_requires_permission_and_supports_pagination(self):
        sale = self.sale()
        self.lines(sale).delete()
        client = APIClient()
        self.assertIn(client.get('/api/reports/v2/settlement-reconciliation/').status_code, (401, 403))
        user = create_staff_user(username='settlements', email='settlements@example.com', as_admin=True)
        client.force_authenticate(user)
        response = client.get('/api/reports/v2/settlement-reconciliation/', {'page_size': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['meta']['source_reconciliation'], 'not_verified')
        self.assertEqual(client.get('/api/reports/v2/settlement-reconciliation/', {'account_id': 1}).status_code, 400)

    def test_read_only_no_new_journals_or_content_types(self):
        self.sale()
        before = (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count())
        self.report()
        self.assertEqual(before, (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count()))
