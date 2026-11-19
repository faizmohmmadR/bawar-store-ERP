from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.payment import GeneralPayment, Payment
from api.models.data.vendors import Vendor
from api.services.reporting.contracts import ReportScope
from api.services.reporting.vendor_ap_bridge import vendor_ap_bridge
from api.tests.accounting.helpers import TXN_WHEN, create_order_payment, create_staff_user


class VendorApBridgeV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='apbridgeadmin', email='apbridge@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.vendor = Vendor.objects.create(name='Bridge Supplier')

    def bill(self, amount=100):
        return RawMaterialPurchase.objects.create(
            vendor=self.vendor, currency=1, total_amount=amount, total_amount_base=amount,
            status='received', purchase_date=TXN_WHEN,
        )

    def test_received_bill_and_payment_match_trade_ap(self):
        bill = self.bill()
        create_order_payment(order=bill, amount=Decimal('30'), payment_type='purchase')
        row = vendor_ap_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['bill_balance'], row['trade_gl_balance'],
                          row['trade_difference'], row['other_gl_balance']),
                         ('70.0000', '70.0000', '0.0000', '0.0000'))
        self.assertEqual(row['trade_line_count'], 2)

    def test_unused_supplier_credit_is_not_deducted_from_bill_ap(self):
        self.bill()
        header = GeneralPayment.objects.create(payment_type='purchase', vendor=self.vendor,
            currency=1, amount=40, amount_base=40, payment_date=TXN_WHEN)
        Payment.objects.bulk_create([Payment(general_payment=header,
            content_type=ContentType.objects.get_for_model(header), object_id=header.pk,
            payment_type='purchase', currency=1, amount=40, amount_base=40,
            is_advance=True, payment_date=TXN_WHEN)])
        row = vendor_ap_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['bill_balance'], row['unused_supplier_credit'],
                          row['trade_gl_balance'], row['trade_difference']),
                         ('100.0000', '40.0000', '100.0000', '0.0000'))

    def test_applied_supplier_credit_reduces_bill_and_ap_once(self):
        from api.services.general_payments import save_general_payment

        self.bill()
        save_general_payment(dict(payment_type='purchase', vendor=self.vendor, currency=1,
            amount=Decimal('40'), amount_base=Decimal('40'), exchange_rate=Decimal('1'),
            payment_method='cash', payment_date=TXN_WHEN))
        row = vendor_ap_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['bill_balance'], row['unused_supplier_credit'],
                          row['trade_gl_balance'], row['trade_difference']),
                         ('60.0000', '0.0000', '60.0000', '0.0000'))

    def test_manual_ap_is_separate_from_bill_difference(self):
        self.bill()
        ap = GLAccount.objects.get(code='2000', currency=1)
        cash = GLAccount.objects.get(code='1000', currency=1)
        entry = JournalEntry.objects.create(entry_date=TXN_WHEN, is_auto=False)
        JournalLine.objects.bulk_create([
            JournalLine(journal_entry=entry, gl_account=ap, currency=1, debit=0, credit=20,
                        base_debit=0, base_credit=20, exchange_rate=1),
            JournalLine(journal_entry=entry, gl_account=cash, currency=1, debit=20, credit=0,
                        base_debit=20, base_credit=0, exchange_rate=1),
        ])
        row = vendor_ap_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['trade_difference'], row['other_gl_balance'],
                          row['total_difference']), ('0.0000', '20.0000', '-20.0000'))
        self.assertEqual(row['other_journal_ids'], [entry.pk])

    def test_missing_purchase_line_and_cutoff_are_visible(self):
        bill = self.bill()
        JournalLine.objects.filter(journal_entry__object_id=bill.pk,
            journal_entry__content_type__model='rawmaterialpurchase',
            gl_account__code='2000').update(deleted_at=TXN_WHEN)
        row = vendor_ap_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['bill_balance'], row['trade_gl_balance'],
                          row['trade_difference']), ('100.0000', '0.0000', '100.0000'))
        create_order_payment(order=bill, amount=Decimal('30'), payment_type='purchase',
                             when=TXN_WHEN + timedelta(days=2))
        url = '/api/reports/v2/vendor-ap-bridge/'
        response = self.client.get(url, {'end_date': TXN_WHEN.date().isoformat()})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rows'][0]['bill_balance'], '100.0000')
        self.assertEqual(response.data['status'], 'comparison_only')
        self.assertEqual(self.client.get(url, {'start_date': TXN_WHEN.date().isoformat()}).status_code, 400)
        self.assertEqual(self.client.get(url, {'account_id': 1}).status_code, 400)
