from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.journal import JournalEntry, JournalLine
from api.models.data.raw_materials import (
    RawMaterial,
    RawMaterialPurchase,
    RawMaterialPurchaseItem,
    RawMaterialStock,
)
from api.models.data.vendors import Vendor
from api.models.data.currency import BASE_CURRENCY_ID
from api.services.accounting import sync_raw_material_stock_opening_journal
from api.services.accounting.coa import ensure_accounting_ready
from api.services.reporting.contracts import ReportScope
from api.services.reporting.inventory_current_position import inventory_current_position
from api.tests.accounting.helpers import create_staff_user

WHEN = datetime(2026, 11, 1, 12, tzinfo=dt_timezone.utc)


class RawMaterialOpeningGLTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(
            username='rmopeninggl', email='rmopeninggl@example.com', as_admin=True,
        )
        ensure_accounting_ready(currency_id=BASE_CURRENCY_ID)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.material = RawMaterial.objects.create(
            name='Opening chemistry', material_type='chemistry', unit='kg',
        )
        self.vendor = Vendor.objects.create(name='Opening vendor')

    def test_direct_stock_create_posts_opening_equity_journal(self):
        response = self.client.post('/api/raw-material-stocks/', {
            'raw_material': self.material.pk,
            'quantity': '10',
            'piece_count': 0,
            'last_purchase_price': '5',
            'last_purchase_date': '2026-11-01',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        ct = ContentType.objects.get_for_model(RawMaterialStock)
        entry = JournalEntry.objects.get(
            content_type=ct, object_id=stock.pk, deleted_at__isnull=True, is_auto=True,
        )
        lines = list(JournalLine.objects.filter(journal_entry=entry).select_related('gl_account'))
        by_code = {line.gl_account.code: line for line in lines}
        self.assertEqual(by_code['1100'].base_debit, Decimal('50.0000'))
        self.assertEqual(by_code['3000'].base_credit, Decimal('50.0000'))

    def test_sync_opening_journal_replace_and_clear(self):
        stock = RawMaterialStock.objects.create(
            raw_material=self.material, quantity=4, last_purchase_price=3,
        )
        sync_raw_material_stock_opening_journal(stock)
        ct = ContentType.objects.get_for_model(RawMaterialStock)
        self.assertEqual(
            JournalEntry.objects.filter(content_type=ct, object_id=stock.pk, deleted_at__isnull=True).count(),
            1,
        )
        stock.quantity = 0
        stock.save(update_fields=['quantity'])
        sync_raw_material_stock_opening_journal(stock)
        self.assertFalse(
            JournalEntry.objects.filter(content_type=ct, object_id=stock.pk, deleted_at__isnull=True).exists()
        )

    def test_purchase_soft_delete_reverses_received_stock(self):
        stock = RawMaterialStock.objects.create(
            raw_material=self.material, quantity=0, last_purchase_price=0,
        )
        purchase = RawMaterialPurchase.objects.create(
            vendor=self.vendor, invoice_number='OPEN-DEL-1', purchase_date=WHEN,
            currency=1, total_amount=20, status='received', exchange_rate=1,
        )
        RawMaterialPurchaseItem.objects.create(
            purchase=purchase, raw_material=self.material, quantity=4,
            price_per_unit=5, total_price=20, price_per_unit_base=5, total_price_base=20,
        )
        from api.services.raw_material_stock import reconcile_raw_material_stock
        reconcile_raw_material_stock(
            purchase, previous_status='draft', previous_items=[], save_stock=True,
        )
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, Decimal('4.0000'))

        response = self.client.delete(f'/api/raw-material-purchases/{purchase.pk}/')
        self.assertEqual(response.status_code, 204)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, Decimal('0.0000'))

    def test_inventory_report_flags_opening_without_gl(self):
        RawMaterialStock.objects.create(
            raw_material=self.material, quantity=2, last_purchase_price=10,
        )
        report = inventory_current_position(ReportScope())
        raw = next(row for row in report['rows'] if row['pool'] == 'raw_material')
        self.assertIn('opening_stock_without_gl', raw['issues'])
        self.assertEqual(report['gap_analysis']['raw_opening_missing_gl_afn'], '20.0000')
