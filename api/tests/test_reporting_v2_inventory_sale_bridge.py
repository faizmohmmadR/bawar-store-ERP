from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.customers import Customer
from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.models.data.products import Product
from api.models.data.returns import Return, ReturnItems
from api.models.data.sales import Sales, SalesItems
from api.models.data.stock import Stock
from api.services.reporting.contracts import ReportScope
from api.services.reporting.inventory_sale_bridge import inventory_sale_bridge
from api.tests.accounting.helpers import create_staff_user


class InventorySaleBridgeV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='saleinventorybridge', email='saleinventorybridge@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.when = datetime(2026, 8, 1, 12, tzinfo=dt_timezone.utc)
        self.customer = Customer.objects.create(name='Inventory Bridge Customer')
        self.product = Product.objects.create(name='Inventory Bridge Product')
        self.stock = Stock.objects.create(product=self.product, piece_amount=0, buy_price=0, currency=1)

    def account(self, code, category):
        account, _ = GLAccount.objects.get_or_create(code=code, currency=1,
            defaults={'name': code, 'category': category})
        return account

    def sale(self, *, known=True, when=None, with_item=True):
        sale = Sales.objects.bulk_create([Sales(customer=self.customer,
            invoice_number=f'INV-BRIDGE-{Sales.objects.count() + 1}', currency=1,
            status='confirmed', sale_date=when or self.when, total_amount=100)])[0]
        item = None
        if with_item:
            item = SalesItems.objects.bulk_create([SalesItems(sales=sale, sale_source='stock',
                stock=self.stock, unit='piece', quantity=2, liter_amount=2,
                sell_price=50, unit_cost=5 if known else 0, cost_is_known=known)])[0]
        return sale, item

    def journal(self, source, *, inventory_debit=0, inventory_credit=0, when=None):
        entry = JournalEntry.objects.create(entry_date=when or self.when,
            content_type=ContentType.objects.get_for_model(source), object_id=source.pk)
        inventory = self.account('1100', 'asset')
        counterpart = self.account('5200', 'expense')
        JournalLine.objects.bulk_create([
            JournalLine(journal_entry=entry, gl_account=inventory, currency=1,
                debit=inventory_debit, credit=inventory_credit,
                base_debit=inventory_debit, base_credit=inventory_credit, exchange_rate=1),
            JournalLine(journal_entry=entry, gl_account=counterpart, currency=1,
                debit=inventory_credit, credit=inventory_debit,
                base_debit=inventory_credit, base_credit=inventory_debit, exchange_rate=1),
        ])
        return entry

    def test_sale_and_return_match_opposite_inventory_sides(self):
        sale, item = self.sale()
        self.journal(sale, inventory_credit=10)
        returned = Return.objects.bulk_create([Return(sales=sale, return_number='INV-BRIDGE-RETURN',
            return_date=self.when, currency=1, total_amount=50)])[0]
        ReturnItems.objects.bulk_create([ReturnItems(return_order=returned, sales_item=item,
            liter_amount=1, batch_returns=[{'quantity': '1', 'unit_cost_afn': '5'}])])
        self.journal(returned, inventory_debit=5)
        rows = inventory_sale_bridge(ReportScope())['rows']
        self.assertEqual([(row['source_model'], row['expected_cost_afn'], row['inventory_gl_afn'],
                           row['difference_afn']) for row in rows],
                         [('return', '5.0000', '5.00', '0.00'), ('sales', '10.0000', '10.00', '0.00')])

    def test_unknown_sale_cost_keeps_difference_null(self):
        sale, _ = self.sale(known=False)
        self.journal(sale, inventory_credit=0)
        row = inventory_sale_bridge(ReportScope())['rows'][0]
        self.assertIsNone(row['expected_cost_afn'])
        self.assertIsNone(row['difference_afn'])
        self.assertEqual(row['unknown_event_count'], 1)

    def test_missing_cost_posting_and_orphan_gl_are_separate(self):
        sale, _ = self.sale()
        orphan, _ = self.sale(with_item=False)
        orphan_journal = self.journal(orphan, inventory_credit=20)
        report = inventory_sale_bridge(ReportScope())
        self.assertEqual(report['rows'][0]['source_id'], sale.pk)
        self.assertEqual(report['rows'][0]['difference_afn'], '10.00')
        self.assertIn('missing_inventory_posting', report['rows'][0]['issues'])
        self.assertEqual(report['orphan_inventory_line_count'], 1)
        self.assertEqual(report['orphan_journal_ids'], [orphan_journal.pk])

    def test_cutoff_and_rejected_filters(self):
        self.sale(when=self.when + timedelta(days=2))
        url = '/api/reports/v2/inventory-sale-bridge/'
        response = self.client.get(url, {'end_date': self.when.date().isoformat()})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rows'], [])
        self.assertEqual(self.client.get(url, {'start_date': self.when.date().isoformat()}).status_code, 400)
        self.assertEqual(self.client.get(url, {'currency': 1}).status_code, 400)
        self.assertEqual(self.client.get(url, {'account_id': 1}).status_code, 400)
