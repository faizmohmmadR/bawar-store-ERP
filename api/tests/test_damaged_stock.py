"""Damaged products: reduce sellable stock and create StockAdjustment."""
from decimal import Decimal

from rest_framework.test import APIClient, APITestCase

from api.models.data.inventory_ledger import InventoryBalance, StockMovement
from api.models.data.product_packaging import ProductPackaging
from api.models.data.products import Product
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.uom import UnitCategory, UnitOfMeasure
from api.models.data.warehouse import Warehouse
from api.services.accounting.coa import ensure_accounting_ready
from api.services.inventory.damage import record_damaged_stock
from api.services.inventory.engine import post_movement
from api.tests.accounting.helpers import AFN, create_staff_user


class DamagedStockTests(APITestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=AFN)
        self.user = create_staff_user(
            username='damage-user', email='damage@test.local', as_admin=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

        count = UnitCategory.objects.create(code='count-dmg', name='Count')
        piece = UnitOfMeasure.objects.create(
            category=count, code='pc-dmg', name='Piece', symbol='pc',
            is_category_reference=True,
        )
        self.warehouse = Warehouse.objects.create(
            code='DMG', name='Damage WH', is_default=True, is_active=True,
        )
        self.product = Product.objects.create(
            name='Damaged Test Product',
            sku='DMG-1',
            base_uom=piece,
            track_inventory=True,
            average_cost=Decimal('10'),
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
        post_movement(
            product=self.product,
            warehouse=self.warehouse,
            movement_type=StockMovement.TYPE_OPENING,
            base_quantity=Decimal('100'),
            packaging=self.packaging,
            transaction_quantity=Decimal('100'),
            unit_cost=Decimal('10'),
            user=self.user,
            notes='Opening for damage test',
        )

    def test_record_damaged_stock_reduces_balance(self):
        result = record_damaged_stock(
            product=self.product,
            warehouse=self.warehouse,
            quantity=Decimal('15'),
            packaging=self.packaging,
            reason='Broken seal',
            user=self.user,
        )
        balance = InventoryBalance.objects.get(
            product=self.product, warehouse=self.warehouse, lot__isnull=True,
        )
        self.assertEqual(balance.quantity_on_hand, Decimal('85.000000'))
        adj = result['adjustment']
        self.assertEqual(adj.adjustment_type, StockAdjustment.ADJUSTMENT_TYPE_DAMAGED)
        self.assertEqual(adj.quantity_change, Decimal('-15.000000'))
        self.assertEqual(result['loss_value'], Decimal('150.000000'))
        self.assertTrue(
            StockMovement.objects.filter(
                product=self.product,
                movement_type=StockMovement.TYPE_DAMAGE,
            ).exists()
        )

    def test_record_damage_api(self):
        response = self.client.post(
            '/api/stock-adjustments/record-damage/',
            {
                'product': self.product.id,
                'warehouse': self.warehouse.id,
                'packaging': self.packaging.id,
                'quantity': '20',
                'reason': 'Crushed carton',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['adjustment_type'], 'damaged')
        self.assertEqual(response.data['product_name'], self.product.name)
        self.assertEqual(Decimal(str(response.data['loss_value'])), Decimal('200'))

        listing = self.client.get(
            '/api/stock-adjustments/',
            {'adjustment_type': 'damaged'},
        )
        self.assertEqual(listing.status_code, 200)
        payload = listing.data
        results = payload.get('results', payload) if isinstance(payload, dict) else payload
        self.assertTrue(any(row['id'] == response.data['id'] for row in results))

    def test_insufficient_stock_rejected(self):
        response = self.client.post(
            '/api/stock-adjustments/record-damage/',
            {
                'product': self.product.id,
                'warehouse': self.warehouse.id,
                'quantity': '999',
                'base_quantity': '999',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
