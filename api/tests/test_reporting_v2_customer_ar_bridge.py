from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.services.reporting.contracts import ReportScope
from api.services.reporting.customer_ar_bridge import customer_ar_bridge
from api.tests.accounting.helpers import (
    TXN_WHEN, create_confirmed_sale, create_order_payment, create_staff_user,
)


class CustomerArBridgeV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='arbridgeadmin', email='arbridge@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_invoice_and_trade_journal_match_after_payment(self):
        sale = create_confirmed_sale(amount=Decimal('100'))
        create_order_payment(order=sale, amount=Decimal('30'), payment_type='sale')
        row = customer_ar_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['invoice_balance'], row['trade_gl_balance'],
                          row['trade_difference'], row['other_gl_balance']),
                         ('70.0000', '70.0000', '0.0000', '0.0000'))
        self.assertEqual(row['trade_line_count'], 2)

    def test_manual_receivable_is_separate_from_trade_difference(self):
        create_confirmed_sale(amount=Decimal('100'))
        ar = GLAccount.objects.get(code='1200', currency=1)
        capital = GLAccount.objects.get(code='3000', currency=1)
        entry = JournalEntry.objects.create(entry_date=TXN_WHEN, is_auto=False)
        JournalLine.objects.bulk_create([
            JournalLine(journal_entry=entry, gl_account=ar, currency=1, debit=40, credit=0,
                        base_debit=40, base_credit=0, exchange_rate=1),
            JournalLine(journal_entry=entry, gl_account=capital, currency=1, debit=0, credit=40,
                        base_debit=0, base_credit=40, exchange_rate=1),
        ])
        row = customer_ar_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['trade_difference'], row['other_gl_balance'],
                          row['total_difference']), ('0.0000', '40.0000', '-40.0000'))
        self.assertEqual(row['other_journal_ids'], [entry.pk])

    def test_missing_trade_line_is_visible_as_difference(self):
        sale = create_confirmed_sale(amount=Decimal('100'))
        JournalLine.objects.filter(journal_entry__object_id=sale.pk,
            journal_entry__content_type__model='sales', gl_account__code='1200').update(deleted_at=TXN_WHEN)
        row = customer_ar_bridge(ReportScope())['rows'][0]
        self.assertEqual((row['invoice_balance'], row['trade_gl_balance'],
                          row['trade_difference']), ('100.0000', '0.0000', '100.0000'))

    def test_cutoff_and_filter_rejection(self):
        sale = create_confirmed_sale(amount=Decimal('100'))
        create_order_payment(order=sale, amount=Decimal('30'), payment_type='sale',
                             when=TXN_WHEN + timedelta(days=2))
        url = '/api/reports/v2/customer-ar-bridge/'
        response = self.client.get(url, {'end_date': TXN_WHEN.date().isoformat()})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rows'][0]['invoice_balance'], '100.0000')
        self.assertEqual(response.data['rows'][0]['trade_difference'], '0.0000')
        self.assertEqual(response.data['status'], 'comparison_only')
        self.assertEqual(self.client.get(url, {'start_date': TXN_WHEN.date().isoformat()}).status_code, 400)
        self.assertEqual(self.client.get(url, {'account_id': 1}).status_code, 400)
