"""Section report for finished stock and period damages."""
from decimal import Decimal

from django.test import TestCase

from api.models.data.damaged_materials import DamagedMaterialItem, DamagedMaterialRecord
from api.models.data.products import Product
from api.models.data.raw_materials import RawMaterial, RawMaterialCategory
from api.models.data.stock import Stock
from api.services.material_finished_stock import add_material_stock
from api.services.stock_report import get_stock_report
from api.tests.accounting.helpers import TXN_WHEN


class StockReportTests(TestCase):
    def setUp(self):
        category = RawMaterialCategory.objects.create(name='Stock Report Cat')
        self.material = RawMaterial.objects.create(
            name='Report Bottle',
            material_type=RawMaterial.TYPE_BOTTLE,
            unit=RawMaterial.UNIT_PIECE,
            category=category,
            capacity_kg=Decimal('1'),
            capacity_liters=Decimal('1'),
        )
        self.product = Product.objects.create(
            name='Report Oil',
            packaging_type='bottle',
            raw_material=self.material,
            bottle_capacity_kg=Decimal('1'),
            bottle_capacity_liters=Decimal('1'),
            density_kg_per_liter=Decimal('1'),
            bottles_per_carton=1,
        )
        self.stock, _, _ = add_material_stock(
            material=self.material,
            product=self.product,
            quantity=Decimal('20'),
            total_cost=Decimal('200'),
            packing=True,
            notes='Report stock',
        )

    def test_stock_report_position_by_condition(self):
        report = get_stock_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        self.assertEqual(report['report_type'], 'stock')
        self.assertGreater(report['kpis']['stock_value_afn'], 0)
        self.assertGreaterEqual(report['kpis']['good_pieces'], 20.0)
        conditions = {row['condition'] for row in report['by_condition']}
        self.assertIn(Stock.CONDITION_GOOD, conditions)

    def test_stock_report_includes_packaging_damage(self):
        label = RawMaterial.objects.create(
            name='Report Label',
            material_type=RawMaterial.TYPE_LABEL,
            unit=RawMaterial.UNIT_PIECE,
            category=self.material.category,
        )
        record = DamagedMaterialRecord.objects.create(
            record_date=TXN_WHEN,
            source=DamagedMaterialRecord.SOURCE_MANUAL,
            total_cost_afn=Decimal('30'),
            notes='broken labels',
        )
        DamagedMaterialItem.objects.create(
            record=record,
            component_type=DamagedMaterialRecord.COMPONENT_LABEL,
            raw_material=label,
            quantity_pieces=Decimal('10'),
            unit=DamagedMaterialItem.UNIT_PIECE,
            unit_price_afn=Decimal('3'),
            total_cost_afn=Decimal('30'),
        )

        report = get_stock_report(start_date=TXN_WHEN, end_date=TXN_WHEN)
        kinds = {row['kind'] for row in report['damages']}
        self.assertIn('packaging_manual', kinds)
        self.assertEqual(report['kpis']['period_damage_loss_afn'], 30.0)
        self.assertEqual(len(report['packaging_components']), 1)
        self.assertEqual(report['packaging_components'][0]['component_type'], 'label')
