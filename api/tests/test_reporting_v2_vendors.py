from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import JournalEntry, JournalLine
from api.models.data.vendors import Vendor
from api.models.data.purchases import Purchase as RawMaterialPurchase
from api.models.data.payment import Payment, GeneralPayment
from api.models.data.sales import Sales
from api.services.reporting.contracts import ReportScope
from api.services.reporting.vendors import vendor_invoice_balances
from api.tests.accounting.helpers import TXN_WHEN, create_order_payment, create_staff_user


class VendorPositionsTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Supplier')

    def bill(self, amount=100, when=TXN_WHEN, vendor=None, currency=1, status='received'):
        return RawMaterialPurchase.objects.create(vendor=vendor or self.vendor, currency=currency,
            total_amount=amount, total_amount_base=amount, status=status, purchase_date=when)

    def credit(self, bill=None, amount=40, applied=0, when=TXN_WHEN, origin=None, vendor=None):
        vendor = vendor or self.vendor
        header = GeneralPayment.objects.create(payment_type='purchase', vendor=vendor, currency=1,
            amount=amount, amount_base=amount, payment_date=when, source_sale=origin)
        rows = [Payment(general_payment=header, content_type=ContentType.objects.get_for_model(header),
            object_id=header.pk, payment_type='purchase', currency=1, amount=amount,
            amount_base=amount, is_advance=True, payment_date=when)]
        if applied:
            rows.append(Payment(general_payment=header, content_type=ContentType.objects.get_for_model(bill),
                object_id=bill.pk, payment_type='purchase', currency=1, amount=applied,
                amount_base=applied, is_credit_application=True, payment_date=when))
        Payment.objects.bulk_create(rows)
        return header

    def returned(self, amount=40, when=TXN_WHEN):
        return Sales.objects.bulk_create([Sales(vendor=self.vendor, invoice_number=f'VR-{Sales.objects.count()}',
            vendor_transaction='purchase_return', currency=1, total_amount=amount, total_amount_base=amount,
            status='confirmed', sale_date=when)])[0]

    def report(self, **params):
        return vendor_invoice_balances(ReportScope.from_params(params))

    def test_received_bill_and_direct_payment(self):
        bill = self.bill()
        create_order_payment(order=bill, amount=Decimal('30'), payment_type='purchase')
        self.assertEqual(self.report()['parties'][0]['payable'], '70.0000')

    def test_old_bill_contributes_to_opening_and_period_change(self):
        bill = self.bill(when=TXN_WHEN - timedelta(days=5))
        create_order_payment(order=bill, amount=Decimal('30'), payment_type='purchase')
        party = self.report(start_date=TXN_WHEN.date().isoformat())['parties'][0]
        self.assertEqual((party['opening_balance'], party['period_change'], party['closing_balance']), ('100.0000', '-30.0000', '70.0000'))

    def test_unapplied_money_advance_reduces_party_not_arbitrary_bill(self):
        self.bill()
        self.credit(amount=40)
        report = self.report()
        self.assertEqual(report['rows'][0]['closing_balance'], '100.0000')
        self.assertEqual(report['parties'][0]['closing_balance'], '60.0000')

    def test_applied_purchase_return_is_not_subtracted_twice(self):
        bill = self.bill()
        origin = self.returned()
        self.credit(bill=bill, applied=40, origin=origin)
        report = self.report()
        self.assertEqual(report['rows'][0]['closing_balance'], '60.0000')
        self.assertEqual(report['credits'][0]['unused_amount'], '0.0000')
        self.assertEqual(report['parties'][0]['closing_balance'], '60.0000')
        self.assertEqual(report['purchase_returns'][0]['issues'], [])

    def test_partially_applied_return_has_same_party_effect(self):
        bill = self.bill()
        self.credit(bill=bill, applied=15, origin=self.returned())
        party = self.report()['parties'][0]
        self.assertEqual((party['outstanding_bills'], party['unused_credit'], party['closing_balance']), ('85.0000', '25.0000', '60.0000'))

    def test_real_general_payment_workflow_matches_supplier_position(self):
        from api.services.general_payments import save_general_payment
        self.bill()
        save_general_payment(dict(payment_type='purchase', vendor=self.vendor, currency=1,
            amount=Decimal('40'), amount_base=Decimal('40'), exchange_rate=Decimal('1'),
            payment_method='cash', payment_date=TXN_WHEN))
        report = self.report()
        self.assertEqual(report['parties'][0]['closing_balance'], '60.0000')
        self.assertEqual(report['parties'][0]['issue_count'], 0)

    def test_consuming_existing_credit_does_not_change_net_party_position(self):
        old = TXN_WHEN - timedelta(days=5)
        bill = self.bill(when=old)
        header = self.credit(when=old)
        Payment.objects.bulk_create([Payment(general_payment=header, content_type=ContentType.objects.get_for_model(bill),
            object_id=bill.pk, payment_type='purchase', currency=1, amount=40, amount_base=40,
            is_credit_application=True, payment_date=TXN_WHEN)])
        party = self.report(start_date=TXN_WHEN.date().isoformat())['parties'][0]
        self.assertEqual((party['opening_balance'], party['period_change'], party['closing_balance']), ('60.0000', '0.0000', '60.0000'))

    def test_currency_filter_does_not_combine_supplier_currencies(self):
        self.bill()
        RawMaterialPurchase.objects.bulk_create([RawMaterialPurchase(vendor=self.vendor, invoice_number='USD-BILL',
            currency=2, total_amount=10, total_amount_base=800, exchange_rate=80, status='received', purchase_date=TXN_WHEN)])
        self.assertEqual(len(self.report()['parties']), 2)
        party = self.report(currency=2)['parties'][0]
        self.assertEqual((party['currency_id'], party['payable']), (2, '10.0000'))

    def test_return_without_receipt_is_flagged_and_not_invented_as_bill_payment(self):
        self.bill()
        self.returned()
        report = self.report()
        self.assertEqual(report['rows'][0]['settled_amount'], '0.0000')
        self.assertIn('purchase_return_without_credit_receipt', report['purchase_returns'][0]['issues'])
        self.assertEqual(report['parties'][0]['issue_count'], 1)

    def test_credit_larger_than_bills_is_supplier_credit_not_negative_payable(self):
        self.bill(amount=20)
        self.credit(amount=40)
        party = self.report()['parties'][0]
        self.assertEqual((party['payable'], party['supplier_credit']), ('0.0000', '20.0000'))

    def test_credit_only_vendor_is_visible_without_received_bill(self):
        self.credit(amount=40)
        report = self.report()
        self.assertEqual(report['rows'], [])
        self.assertEqual(report['parties'][0]['supplier_credit'], '40.0000')

    def test_future_payment_and_credit_do_not_change_past(self):
        bill = self.bill()
        later = TXN_WHEN + timedelta(days=3)
        create_order_payment(order=bill, amount=Decimal('30'), payment_type='purchase', when=later)
        self.credit(amount=40, when=later)
        self.assertEqual(self.report(end_date=TXN_WHEN.date().isoformat())['parties'][0]['payable'], '100.0000')

    def test_pending_purchase_is_not_received_inventory_debt(self):
        self.bill(status='pending')
        self.assertEqual(self.report()['rows'], [])

    def test_vendor_and_currency_balances_do_not_offset(self):
        other = Vendor.objects.create(name='Other')
        self.bill(vendor=other)
        self.credit(amount=40)
        report = self.report()
        self.assertEqual(len(report['parties']), 2)
        self.assertEqual(next(p for p in report['parties'] if p['vendor_id'] == self.vendor.pk)['supplier_credit'], '40.0000')
        self.assertEqual(next(p for p in report['parties'] if p['vendor_id'] == other.pk)['payable'], '100.0000')

    def test_deleted_credit_header_is_not_applied_to_bill(self):
        bill = self.bill()
        header = self.credit(bill=bill, applied=40)
        GeneralPayment.objects.filter(pk=header.pk).update(deleted_at=TXN_WHEN)
        report = self.report()
        self.assertEqual(report['parties'][0]['closing_balance'], '100.0000')
        self.assertTrue(report['rows'][0]['issues'])

    def test_invalid_credit_target_is_flagged(self):
        bill = self.bill(vendor=Vendor.objects.create(name='Wrong'))
        self.credit(bill=bill, applied=40)
        report = self.report()
        self.assertIn('invalid_credit_application_target', report['credits'][0]['issues'])

    def test_paid_cache_does_not_settle_historical_bill(self):
        bill = self.bill()
        RawMaterialPurchase.objects.filter(pk=bill.pk).update(paid_amount=100, paid_amount_base=100)
        self.assertEqual(self.report()['parties'][0]['payable'], '100.0000')

    def test_read_only_api_permissions_and_pagination(self):
        self.bill()
        before = (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count())
        self.report()
        self.assertEqual(before, (JournalEntry.objects.count(), JournalLine.objects.count(), ContentType.objects.count()))
        client = APIClient()
        self.assertIn(client.get('/api/reports/v2/vendor-invoice-balances/').status_code, (401, 403))
        client.force_authenticate(create_staff_user(username='vendor-audit', email='vendor-audit@example.com', as_admin=True))
        response = client.get('/api/reports/v2/vendor-invoice-balances/', {'page_size': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['status'], 'unverified_invoice_positions')
        self.assertEqual(client.get('/api/reports/v2/vendor-invoice-balances/', {'account_id': 1}).status_code, 400)
