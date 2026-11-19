from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.models.data.raw_materials import RawMaterial, RawMaterialPurchase, RawMaterialPurchaseItem
from api.models.data.vendors import Vendor
from api.services.reporting.contracts import ReportScope
from api.services.reporting.inventory_purchase_bridge import inventory_purchase_bridge
from api.tests.accounting.helpers import TXN_WHEN, create_staff_user


class InventoryPurchaseBridgeV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='inventorybridgeadmin', email='inventorybridge@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.vendor = Vendor.objects.create(name='Inventory bridge vendor')
        self.material = RawMaterial.objects.create(name='Inventory bridge material',
            material_type='chemistry', unit='kg')

    def purchase(self, *, when=TXN_WHEN, status='received', with_item=True):
        purchase = RawMaterialPurchase.objects.create(vendor=self.vendor, currency=1,
            status=status, purchase_date=when,
            total_amount=40 if with_item else 0,
            total_amount_base=40 if with_item else 0)
        if with_item:
            RawMaterialPurchaseItem.objects.create(purchase=purchase, raw_material=self.material,
                quantity=Decimal('10'), price_per_unit=Decimal('4'))
        purchase.refresh_from_db()
        return purchase

    def test_received_items_header_and_inventory_gl_match(self):
        purchase = self.purchase()
        row = inventory_purchase_bridge(ReportScope())['rows'][0]
        self.assertEqual(row['purchase_id'], purchase.pk)
        self.assertEqual((row['item_value_afn'], row['header_value_afn'],
                          row['inventory_gl_afn'], row['header_gl_difference_afn']),
                         ('40.0000', '40.0000', '40.00', '0.00'))
        self.assertEqual(row['issues'], [])

    def test_header_drift_and_unknown_gl_base_are_not_hidden(self):
        purchase = self.purchase()
        RawMaterialPurchase.objects.filter(pk=purchase.pk).update(total_amount_base=41)
        row = inventory_purchase_bridge(ReportScope())['rows'][0]
        self.assertIn('items_header_value_mismatch', row['issues'])
        self.assertIn('header_inventory_gl_mismatch', row['issues'])
        self.assertEqual(row['header_gl_difference_afn'], '1.00')
        JournalLine.objects.filter(journal_entry__content_type__model='rawmaterialpurchase',
            journal_entry__object_id=purchase.pk, gl_account__code='1100').update(
                base_debit=None, needs_rate_review=True)
        row = inventory_purchase_bridge(ReportScope())['rows'][0]
        self.assertIsNone(row['inventory_gl_afn'])
        self.assertIsNone(row['header_gl_difference_afn'])
        self.assertEqual(row['unknown_base_count'], 1)

    def test_pending_purchase_posting_is_orphan_and_cutoff_is_enforced(self):
        pending = self.purchase(status='pending', with_item=False)
        entry = JournalEntry.objects.create(entry_date=TXN_WHEN,
            content_type=ContentType.objects.get_for_model(pending), object_id=pending.pk)
        inventory = GLAccount.objects.get(code='1100', currency=1)
        JournalLine.objects.bulk_create([JournalLine(journal_entry=entry, gl_account=inventory,
            currency=1, debit=10, credit=0, base_debit=10, base_credit=0, exchange_rate=1)])
        later = self.purchase(when=TXN_WHEN + timedelta(days=2))
        url = '/api/reports/v2/inventory-purchase-bridge/'
        response = self.client.get(url, {'end_date': TXN_WHEN.date().isoformat()})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rows'], [])
        self.assertEqual(response.data['orphan_inventory_line_count'], 1)
        self.assertEqual(response.data['orphan_journal_ids'], [entry.pk])
        self.assertNotIn(later.pk, [row['purchase_id'] for row in response.data['rows']])
        self.assertEqual(self.client.get(url, {'start_date': TXN_WHEN.date().isoformat()}).status_code, 400)
        self.assertEqual(self.client.get(url, {'currency': 1}).status_code, 400)
        self.assertEqual(self.client.get(url, {'account_id': 1}).status_code, 400)
