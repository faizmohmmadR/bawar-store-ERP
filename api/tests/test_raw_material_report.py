"""Raw material inventory report — stock, purchases, consumption."""
from decimal import Decimal

from django.test import TestCase

from api.models.data.raw_materials import (
    RawMaterial,
    RawMaterialPurchase,
    RawMaterialPurchaseItem,
    RawMaterialStock,
)
from api.models.data.vendors import Vendor
from api.services.raw_material_report import get_raw_material_report
from api.tests.accounting.helpers import TXN_WHEN


class RawMaterialReportTests(TestCase):
    def test_report_includes_stock_and_period_purchases(self):
        vendor = Vendor.objects.create(name='RM Vendor', is_active=True)
        material = RawMaterial.objects.create(
            name='Caustic',
            material_type=RawMaterial.TYPE_CHEMISTRY,
            unit=RawMaterial.UNIT_KG,
        )
        RawMaterialStock.objects.create(
            raw_material=material,
            quantity=Decimal('40'),
            last_purchase_price=Decimal('10'),
            last_purchase_date=TXN_WHEN.date(),
        )
        purchase = RawMaterialPurchase.objects.create(
            vendor=vendor,
            purchase_date=TXN_WHEN,
            status='received',
            currency=1,
            total_amount=Decimal('250'),
            total_amount_base=Decimal('250'),
        )
        RawMaterialPurchaseItem.objects.create(
            purchase=purchase,
            raw_material=material,
            quantity=Decimal('25'),
            price_per_unit=Decimal('10'),
            total_price=Decimal('250'),
            price_per_unit_base=Decimal('10'),
            total_price_base=Decimal('250'),
        )

        report = get_raw_material_report(start_date=TXN_WHEN, end_date=TXN_WHEN)

        self.assertEqual(report['currency'], 'AFN')
        self.assertEqual(report['kpis']['stock_value_afn'], 400.0)
        self.assertEqual(report['kpis']['purchased_value_afn'], 250.0)
        self.assertEqual(report['kpis']['purchase_count'], 1)
        self.assertIn('AFN', report['by_currency'])
        self.assertEqual(report['by_currency']['AFN']['purchased_native'], 250.0)
        self.assertEqual(report['by_currency']['AFN']['purchased_afn'], 250.0)
        self.assertTrue(report['by_vendor'])
        self.assertEqual(report['by_vendor'][0]['value_afn'], 250.0)
        self.assertEqual(report['by_vendor'][0]['currency_code'], 'AFN')
        self.assertEqual(report['by_vendor'][0]['value_native'], 250.0)

        movement = next(row for row in report['movement'] if row['material_id'] == material.pk)
        self.assertEqual(movement['purchased_qty'], 25.0)
        self.assertEqual(movement['closing_qty'], 40.0)
        self.assertEqual(movement['opening_qty'], 15.0)

        position = next(row for row in report['position'] if row['material_id'] == material.pk)
        self.assertEqual(position['quantity'], 40.0)
        self.assertEqual(position['value_afn'], 400.0)

    def test_unknown_cost_is_flagged(self):
        material = RawMaterial.objects.create(
            name='Mystery',
            material_type=RawMaterial.TYPE_OTHER,
            unit=RawMaterial.UNIT_PIECE,
        )
        RawMaterialStock.objects.create(
            raw_material=material,
            quantity=Decimal('5'),
            last_purchase_price=Decimal('0'),
            zero_cost_allowed=False,
        )
        report = get_raw_material_report()
        self.assertGreaterEqual(report['kpis']['unknown_cost_count'], 1)
        row = next(r for r in report['position'] if r['material_id'] == material.pk)
        self.assertIn('cost_unknown', row['issues'])
