"""Damage filled bottles: remaining liquid → tank, spill → damaged materials."""
from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.damaged_materials import DamagedMaterialRecord
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.products import Product
from api.models.data.raw_materials import RawMaterial, RawMaterialCategory
from api.models.data.stock import Stock
from api.models.data.storage_tank import StorageTank
from api.services.material_finished_stock import add_material_stock
from api.services.tank_inventory import get_tank_liquid_totals, get_tank_mass_quantity
from api.tests.accounting.helpers import create_staff_user


class StockBottleDamageAPITests(TestCase):
    def setUp(self):
        self.user = create_staff_user(
            username='bottle_damage_tester',
            email='bottle_damage_tester@example.com',
            as_admin=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        category = RawMaterialCategory.objects.create(name='Bottle Damage Cat')
        self.material = RawMaterial.objects.create(
            name='2kg Bottle',
            material_type=RawMaterial.TYPE_BOTTLE,
            unit=RawMaterial.UNIT_PIECE,
            category=category,
            capacity_kg=Decimal('2'),
            capacity_liters=Decimal('2'),
        )
        self.product = Product.objects.create(
            name='Oil 2kg',
            packaging_type='bottle',
            raw_material=self.material,
            bottle_capacity_kg=Decimal('2'),
            bottle_capacity_liters=Decimal('2'),
            density_kg_per_liter=Decimal('1'),
            bottles_per_carton=1,
        )
        self.stock, _, _ = add_material_stock(
            material=self.material,
            product=self.product,
            quantity=Decimal('10'),
            total_cost=Decimal('500'),
            packing=True,
            notes='Test bottles',
        )
        self.tank = StorageTank.objects.create(
            name='Return Tank',
            capacity_liters=Decimal('1000'),
            capacity_kg=Decimal('1000'),
            density_kg_per_liter=Decimal('1'),
        )

    def test_damage_bottles_splits_liquid_to_tank_and_damaged(self):
        # 4 × 2kg = 8kg total; 4kg remaining → tank; 4kg damaged
        response = self.client.post(
            f'/api/stocks/{self.stock.id}/damage-bottles/',
            {
                'bottle_count': 4,
                'remaining_liquid_kg': '4',
                'storage_tank': self.tank.id,
                'notes': 'Broken bottles',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Decimal(response.data['total_liquid_kg']), Decimal('8.0000'))
        self.assertEqual(Decimal(response.data['remaining_liquid_kg']), Decimal('4.0000'))
        self.assertEqual(Decimal(response.data['damaged_liquid_kg']), Decimal('4.0000'))
        self.assertIsNotNone(response.data['damaged_number'])

        self.stock.refresh_from_db()
        self.assertEqual(self.stock.piece_amount, Decimal('6'))

        liters, cost, _ = get_tank_liquid_totals(self.tank)
        self.assertEqual(liters, Decimal('4.0000'))
        self.assertEqual(get_tank_mass_quantity(self.tank), Decimal('4.0000'))
        self.assertGreater(cost, 0)

        damaged = DamagedMaterialRecord.objects.get(damaged_number=response.data['damaged_number'])
        self.assertEqual(damaged.source, DamagedMaterialRecord.SOURCE_STOCK_BOTTLE)
        item = damaged.items.get()
        self.assertEqual(item.component_type, 'liquid')
        self.assertEqual(item.unit, 'kg')
        self.assertEqual(item.quantity_pieces, Decimal('4.0000'))
        self.assertEqual(item.product_id, self.product.id)

        # Bottle-spill damaged rows cannot be edited/deleted via damaged API
        delete = self.client.delete(f'/api/damaged-materials/{damaged.id}/')
        self.assertEqual(delete.status_code, status.HTTP_400_BAD_REQUEST, delete.data)

    def test_preview_endpoint_returns_capacity(self):
        response = self.client.get(f'/api/stocks/{self.stock.id}/damage-bottles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(Decimal(response.data['capacity_kg']), Decimal('2.0000'))
        self.assertEqual(response.data['on_hand_bottles'], 10)

    def test_list_update_and_reverse_bottle_damage(self):
        created = self.client.post(
            f'/api/stocks/{self.stock.id}/damage-bottles/',
            {
                'bottle_count': 4,
                'remaining_liquid_kg': '4',
                'storage_tank': self.tank.id,
            },
            format='json',
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        damage_id = created.data['id']

        listing = self.client.get('/api/stock-bottle-damages/')
        self.assertEqual(listing.status_code, status.HTTP_200_OK, listing.data)
        rows = listing.data['results'] if isinstance(listing.data, dict) else listing.data
        self.assertTrue(any(row['id'] == damage_id for row in rows))

        updated = self.client.patch(
            f'/api/stock-bottle-damages/{damage_id}/',
            {
                'bottle_count': 2,
                'remaining_liquid_kg': '1',
                'storage_tank': self.tank.id,
                'notes': 'corrected',
            },
            format='json',
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.assertEqual(updated.data['bottle_count'], 2)
        self.assertEqual(Decimal(updated.data['remaining_liquid_kg']), Decimal('1.0000'))
        self.assertEqual(Decimal(updated.data['damaged_liquid_kg']), Decimal('3.0000'))

        new_id = updated.data['id']
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.piece_amount, Decimal('8'))  # 10 - 2

        deleted = self.client.delete(f'/api/stock-bottle-damages/{new_id}/')
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT, deleted.data)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.piece_amount, Decimal('10'))
        liters, _, _ = get_tank_liquid_totals(self.tank)
        self.assertEqual(liters, Decimal('0.0000'))
