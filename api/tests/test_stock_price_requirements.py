from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from rest_framework.exceptions import ValidationError

from api.models.data.raw_materials import RawMaterial, RawMaterialPurchase, RawMaterialPurchaseItem, RawMaterialStock
from api.models.data.vendors import Vendor
from api.serializers.data.raw_materials import RawMaterialPurchaseItemSerializer, RawMaterialStockDirectSerializer
from api.services.packing import _consume_raw_material_component


class StockPriceRequirementsTests(TestCase):
    def setUp(self):
        self.material = RawMaterial.objects.create(name='Price recovery material', unit='piece')
        self.stock = RawMaterialStock.objects.create(raw_material=self.material, quantity=10)
        self.vendor = Vendor.objects.create(name='Cost source vendor')

    def purchase(self, price='5', currency=1, rate='1'):
        purchase = RawMaterialPurchase.objects.create(vendor=self.vendor, status='received', currency=currency, exchange_rate=rate)
        return RawMaterialPurchaseItem.objects.create(purchase=purchase, raw_material=self.material, quantity=10, price_per_unit=price)

    def repair(self, apply=True):
        out = StringIO()
        call_command('repair_raw_material_prices', apply=apply, stdout=out)
        self.stock.refresh_from_db()
        return out.getvalue()

    def test_recovery_uses_purchase_afn_cost_without_changing_quantity(self):
        self.purchase(currency=2, rate='70')
        self.repair()
        self.assertEqual(self.stock.last_purchase_price, Decimal('350'))
        self.assertEqual(self.stock.quantity, Decimal('10'))
        self.assertIn('checked=0', self.repair())

    def test_recovery_can_reconstruct_missing_base_price_from_saved_rate(self):
        item = self.purchase(currency=2, rate='70')
        RawMaterialPurchaseItem.objects.filter(pk=item.pk).update(price_per_unit_base=0)
        self.repair()
        self.assertEqual(self.stock.last_purchase_price, Decimal('350'))

    def test_dry_run_does_not_write(self):
        self.purchase()
        self.assertIn('recovered=1', self.repair(apply=False))
        self.assertEqual(self.stock.last_purchase_price, 0)

    def test_no_purchase_is_reported_without_inventing_price(self):
        self.assertIn('need_actual_cost=1', self.repair())
        self.assertEqual(self.stock.last_purchase_price, 0)

    def test_pending_purchase_does_not_supply_received_stock_price(self):
        item = self.purchase()
        item.purchase.status = 'draft'
        item.purchase.save()
        self.assertIn('need_actual_cost=1', self.repair())

    def test_purchase_price_must_be_positive(self):
        for price in ['0', '-1']:
            serializer = RawMaterialPurchaseItemSerializer(data={
                'purchase': self.purchase().purchase_id, 'raw_material': self.material.pk,
                'quantity': '1', 'price_per_unit': price,
            })
            self.assertFalse(serializer.is_valid())
            self.assertIn('price_per_unit', serializer.errors)

    def test_manual_stock_on_hand_requires_price(self):
        serializer = RawMaterialStockDirectSerializer(self.stock, data={'quantity': '11'}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn('last_purchase_price', serializer.errors)
        serializer = RawMaterialStockDirectSerializer(self.stock, data={'last_purchase_price': '5'}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_packing_rejects_unpriced_components_without_consuming_stock(self):
        with self.assertRaises(ValidationError):
            _consume_raw_material_component(self.stock, Decimal('1'), None)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, Decimal('10'))
