from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from api.models.data.raw_materials import RawMaterial, RawMaterialStock
from api.serializers.data.raw_materials import RawMaterialStockSerializer


class DemoRawMaterialPriceTests(TestCase):
    def setUp(self):
        self.material = RawMaterial.objects.create(name='رنګ سفید', unit='kg', material_type='chemistry')
        self.stock = RawMaterialStock.objects.create(raw_material=self.material, quantity=500)

    def test_sample_prices_are_labeled_and_do_not_change_quantities(self):
        call_command('seed_demo_raw_material_prices', apply=True, stdout=StringIO())
        self.stock.refresh_from_db()
        self.material.refresh_from_db()
        self.assertEqual(self.stock.last_purchase_price, Decimal('450'))
        self.assertEqual(self.stock.quantity, Decimal('500'))
        self.assertIsNone(self.stock.last_purchase_date)
        self.assertIn('[TEST DATA: SAMPLE PRICE]', self.material.description)
        self.assertTrue(RawMaterialStockSerializer(self.stock).data['price_is_sample'])

    def test_dry_run_preserves_missing_prices(self):
        call_command('seed_demo_raw_material_prices', stdout=StringIO())
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.last_purchase_price, Decimal('0'))

    def test_existing_positive_cost_is_preserved_and_seed_is_idempotent(self):
        self.stock.last_purchase_price = 25
        self.stock.save()
        for _ in range(2):
            call_command('seed_demo_raw_material_prices', apply=True, stdout=StringIO())
        self.stock.refresh_from_db()
        self.material.refresh_from_db()
        self.assertEqual(self.stock.last_purchase_price, Decimal('25'))
        self.assertFalse(self.material.description)
