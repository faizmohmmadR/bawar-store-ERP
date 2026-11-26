"""Expired lot write-off + FEFO purchase receive (track_expiry)."""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient, APITestCase

from api.models.data.inventory_ledger import InventoryBalance, InventoryLot, StockMovement
from api.models.data.product_packaging import ProductPackaging
from api.models.data.products import Product
from api.models.data.purchases import Purchase, PurchaseItem
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.vendors import Vendor
from api.models.data.warehouse import Warehouse
from api.services.accounting.coa import ensure_accounting_ready
from api.services.inventory.engine import receive_purchase_item
from api.services.inventory.expiry import record_expired_stock
from api.tests.accounting.helpers import AFN, create_staff_user


class ExpiredStockTests(APITestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=AFN)
        self.user = create_staff_user(
            username='expiry-user', email='expiry@test.local', as_admin=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        count = UnitCategory.objects.create(code='count-exp', name='Count')
        piece = UnitOfMeasure.objects.create(
            category=count, code='pc-exp', name='Piece', symbol='pc',
            is_category_reference=True,
        )
        self.warehouse = Warehouse.objects.create(
            code='EXP', name='Expiry WH', is_default=True, is_active=True,
        )
        self.vendor = Vendor.objects.create(name='Expiry Vendor')
        self.product = Product.objects.create(
            name='Biscuit FEFO',
            sku='BIS-FEFO',
            base_uom=piece,
            track_inventory=True,
            track_expiry=True,
            average_cost=Decimal('5'),
            is_active=True,
        )
        self.packaging = ProductPackaging.objects.create(
            product=self.product,
            name='Piece',
            qty_in_base=Decimal('1'),
            is_base=True,
            for_sale=True,
            for_purchase=True,
            for_stock=True,
            uom=piece,
        )
        today = timezone.localdate()
        self.old_expiry = today - timedelta(days=5)
        self.fresh_expiry = today + timedelta(days=60)

        purchase = Purchase.objects.create(
            vendor=self.vendor,
            warehouse=self.warehouse,
            currency=AFN,
            status='received',
            total_amount=0,
            invoice_number='EXP-INV-1',
        )
        # Older lot (expired) — should be written off / sold first under FEFO.
        receive_purchase_item(PurchaseItem.objects.create(
            purchase=purchase,
            product=self.product,
            packaging=self.packaging,
            quantity=40,
            conversion_factor=1,
            price_per_unit=5,
            lot_number='LOT-OLD',
            expiry_date=self.old_expiry,
        ), user=self.user)
        # Newer lot (still good).
        receive_purchase_item(PurchaseItem.objects.create(
            purchase=purchase,
            product=self.product,
            packaging=self.packaging,
            quantity=60,
            conversion_factor=1,
            price_per_unit=5,
            lot_number='LOT-NEW',
            expiry_date=self.fresh_expiry,
        ), user=self.user)

    def test_track_expiry_requires_expiry_on_receive(self):
        purchase = Purchase.objects.create(
            vendor=self.vendor,
            warehouse=self.warehouse,
            currency=AFN,
            status='received',
            total_amount=0,
        )
        item = PurchaseItem.objects.create(
            purchase=purchase,
            product=self.product,
            packaging=self.packaging,
            quantity=10,
            conversion_factor=1,
            price_per_unit=5,
            lot_number='LOT-NO-EXP',
        )
        with self.assertRaises(ValidationError):
            receive_purchase_item(item, user=self.user)

    def test_two_purchases_create_separate_lots(self):
        lots = InventoryLot.objects.filter(product=self.product).order_by('expiry_date')
        self.assertEqual(lots.count(), 2)
        self.assertEqual(lots[0].lot_number, 'LOT-OLD')
        self.assertEqual(lots[1].lot_number, 'LOT-NEW')
        balances = InventoryBalance.objects.filter(
            product=self.product, warehouse=self.warehouse, quantity_on_hand__gt=0,
        )
        self.assertEqual(balances.count(), 2)
        self.assertEqual(
            sum(b.quantity_on_hand for b in balances),
            Decimal('100.000000'),
        )

    def test_record_expired_writes_off_expired_lot_only(self):
        result = record_expired_stock(
            product=self.product,
            warehouse=self.warehouse,
            quantity=Decimal('40'),
            packaging=self.packaging,
            reason='Past best-before',
            user=self.user,
        )
        old_bal = InventoryBalance.objects.get(
            product=self.product, warehouse=self.warehouse, lot__lot_number='LOT-OLD',
        )
        new_bal = InventoryBalance.objects.get(
            product=self.product, warehouse=self.warehouse, lot__lot_number='LOT-NEW',
        )
        self.assertEqual(old_bal.quantity_on_hand, Decimal('0.000000'))
        self.assertEqual(new_bal.quantity_on_hand, Decimal('60.000000'))
        adj = result['adjustment']
        self.assertEqual(adj.adjustment_type, StockAdjustment.ADJUSTMENT_TYPE_EXPIRED)
        self.assertTrue(
            StockMovement.objects.filter(
                product=self.product,
                movement_type=StockMovement.TYPE_EXPIRY,
                lot__lot_number='LOT-OLD',
            ).exists()
        )

    def test_cannot_write_off_fresh_lot_as_expired(self):
        new_lot = InventoryLot.objects.get(product=self.product, lot_number='LOT-NEW')
        with self.assertRaises(ValidationError):
            record_expired_stock(
                product=self.product,
                warehouse=self.warehouse,
                lot=new_lot,
                quantity=Decimal('10'),
                packaging=self.packaging,
                user=self.user,
            )

    def test_record_expiry_api(self):
        response = self.client.post(
            '/api/stock-adjustments/record-expiry/',
            {
                'product': self.product.id,
                'warehouse': self.warehouse.id,
                'quantity': '25',
                'reason': 'API expiry write-off',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        old_bal = InventoryBalance.objects.get(
            product=self.product, warehouse=self.warehouse, lot__lot_number='LOT-OLD',
        )
        self.assertEqual(old_bal.quantity_on_hand, Decimal('15.000000'))

    def test_expiring_balances_endpoint(self):
        response = self.client.get(
            '/api/inventory-balances/expiring/',
            {'days': 90},
        )
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.data
        rows = payload.get('results', payload) if isinstance(payload, dict) else payload
        lot_numbers = {row.get('lot_number') for row in rows}
        self.assertIn('LOT-OLD', lot_numbers)
        self.assertIn('LOT-NEW', lot_numbers)
        old = next(r for r in rows if r.get('lot_number') == 'LOT-OLD')
        self.assertTrue(old.get('is_expired'))
