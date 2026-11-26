"""Supermarket stock report — KPIs and focused lists (no full catalog dump)."""
from decimal import Decimal

from django.test import TestCase

from api.models.data.inventory_ledger import StockMovement
from api.models.data.product_packaging import ProductPackaging
from api.models.data.products import Product
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.warehouse import Warehouse
from api.services.inventory.damage import record_damaged_stock
from api.services.inventory.engine import post_movement
from api.services.stock_report import get_stock_report
from api.tests.accounting.helpers import AFN, TXN_WHEN, create_staff_user
from api.services.accounting.coa import ensure_accounting_ready


class StockReportTests(TestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=AFN)
        self.user = create_staff_user(
            username='stock-report', email='stock-report@test.local', as_admin=True,
        )
        count = UnitCategory.objects.create(code='count-sr', name='Count')
        piece = UnitOfMeasure.objects.create(
            category=count, code='pc-sr', name='Piece', symbol='pc',
            is_category_reference=True,
        )
        self.warehouse = Warehouse.objects.create(
            code='SR', name='Report WH', is_default=True, is_active=True,
        )
        self.product = Product.objects.create(
            name='Report Milk',
            sku='SR-1',
            base_uom=piece,
            track_inventory=True,
            reorder_level=Decimal('50'),
            average_cost=Decimal('5'),
            is_active=True,
        )
        self.packaging = ProductPackaging.objects.create(
            product=self.product,
            name='Piece',
            qty_in_base=Decimal('1'),
            is_base=True,
            for_stock=True,
            uom=piece,
        )
        post_movement(
            product=self.product,
            warehouse=self.warehouse,
            movement_type=StockMovement.TYPE_OPENING,
            base_quantity=Decimal('40'),
            packaging=self.packaging,
            transaction_quantity=Decimal('40'),
            unit_cost=Decimal('5'),
            user=self.user,
            occurred_at=TXN_WHEN,
        )

    def test_stock_report_kpis_without_full_balances(self):
        report = get_stock_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        self.assertEqual(report['report_type'], 'stock')
        self.assertNotIn('balances', report)
        self.assertEqual(report['kpis']['products_with_stock'], 1)
        self.assertEqual(report['kpis']['product_balance_count'], 1)
        self.assertEqual(Decimal(str(report['kpis']['total_on_hand'])), Decimal('40'))
        self.assertEqual(Decimal(str(report['kpis']['total_value_afn'])), Decimal('200'))
        self.assertEqual(report['kpis']['low_stock_count'], 1)
        self.assertEqual(len(report['top_by_value']), 1)
        self.assertEqual(len(report['low_stock']), 1)
        self.assertGreater(report['kpis']['movement_count'], 0)

    def test_stock_report_includes_period_damage(self):
        record_damaged_stock(
            product=self.product,
            warehouse=self.warehouse,
            quantity=Decimal('5'),
            packaging=self.packaging,
            reason='Broken',
            user=self.user,
            occurred_at=TXN_WHEN,
        )
        report = get_stock_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        self.assertEqual(report['kpis']['damage_count'], 1)
        self.assertEqual(Decimal(str(report['kpis']['damage_loss_afn'])), Decimal('25'))
        self.assertEqual(len(report['period_damages']), 1)
        self.assertEqual(report['period_damages'][0]['product'], 'Report Milk')
        # After damage write-off, on-hand value is already reduced; net equals stock value
        # when nothing is expired on hand.
        self.assertEqual(
            Decimal(str(report['kpis']['net_value_afn'])),
            Decimal(str(report['kpis']['total_value_afn'])),
        )

    def test_stock_report_net_value_excludes_expired_on_hand(self):
        from datetime import timedelta

        from django.utils import timezone

        from api.models.data.inventory_ledger import InventoryBalance, InventoryLot

        lot = InventoryLot.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            lot_number='EXP-1',
            expiry_date=timezone.localdate() - timedelta(days=3),
            quantity_received=Decimal('10'),
            quantity_remaining=Decimal('10'),
            unit_cost=Decimal('5'),
        )
        InventoryBalance.objects.create(
            product=self.product,
            warehouse=self.warehouse,
            lot=lot,
            quantity_on_hand=Decimal('10'),
            average_cost=Decimal('5'),
        )

        report = get_stock_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        # Opening 40×5=200 + expired lot 10×5=50
        self.assertEqual(Decimal(str(report['kpis']['total_value_afn'])), Decimal('250'))
        self.assertEqual(
            Decimal(str(report['kpis']['expired_on_hand_value_afn'])),
            Decimal('50'),
        )
        self.assertEqual(Decimal(str(report['kpis']['net_value_afn'])), Decimal('200'))
        self.assertEqual(report['kpis']['expired_on_hand_count'], 1)
        self.assertEqual(len(report['expired_on_hand']), 1)
