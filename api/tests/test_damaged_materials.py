"""Damaged packaging records are CRUD-only and never change stock."""
from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.raw_materials import RawMaterial, RawMaterialCategory, RawMaterialStock
from api.tests.accounting.helpers import create_staff_user


class DamagedMaterialsAPITests(TestCase):
    def setUp(self):
        self.user = create_staff_user(
            username='damaged_tester',
            email='damaged_tester@example.com',
            as_admin=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        category = RawMaterialCategory.objects.create(name='Damaged Cat')
        self.label = RawMaterial.objects.create(
            name='Label A',
            material_type=RawMaterial.TYPE_LABEL,
            unit=RawMaterial.UNIT_PIECE,
            category=category,
        )
        self.plastic = RawMaterial.objects.create(
            name='Plastic A',
            material_type=RawMaterial.TYPE_PLASTIC,
            unit=RawMaterial.UNIT_PIECE,
            category=category,
        )
        self.carton = RawMaterial.objects.create(
            name='Carton A',
            material_type=RawMaterial.TYPE_CARTON,
            unit=RawMaterial.UNIT_PIECE,
            category=category,
            bottles_per_carton=8,
        )
        RawMaterialStock.objects.create(
            raw_material=self.label, quantity=Decimal('100'), last_purchase_price=Decimal('2.50'),
        )
        RawMaterialStock.objects.create(
            raw_material=self.plastic, quantity=Decimal('50'), last_purchase_price=Decimal('5.00'),
        )
        RawMaterialStock.objects.create(
            raw_material=self.carton, quantity=Decimal('20'), last_purchase_price=Decimal('10.00'),
        )

    def test_create_edit_delete_without_stock_change(self):
        payload = {
            'record_date': '2026-10-31',
            'notes': 'Broken during handling',
            'items': [
                {'component_type': 'label', 'raw_material': self.label.id, 'quantity_pieces': '4'},
                {'component_type': 'plastic', 'raw_material': self.plastic.id, 'quantity_pieces': '2'},
                {'component_type': 'carton', 'raw_material': self.carton.id, 'quantity_pieces': '1'},
            ],
        }
        create = self.client.post('/api/damaged-materials/', payload, format='json')
        self.assertEqual(create.status_code, status.HTTP_201_CREATED, create.data)
        self.assertEqual(len(create.data['items']), 3)
        self.assertEqual(float(create.data['total_cost_afn']), 30.0)  # 4*2.5 + 2*5 + 1*10
        record_id = create.data['id']

        for material in (self.label, self.plastic, self.carton):
            stock = RawMaterialStock.objects.get(raw_material=material)
            self.assertEqual(stock.quantity, {
                self.label.id: Decimal('100'),
                self.plastic.id: Decimal('50'),
                self.carton.id: Decimal('20'),
            }[material.id])

        update = self.client.patch(
            f'/api/damaged-materials/{record_id}/',
            {
                'notes': 'Updated',
                'items': [
                    {'component_type': 'label', 'raw_material': self.label.id, 'quantity_pieces': '1'},
                ],
            },
            format='json',
        )
        self.assertEqual(update.status_code, status.HTTP_200_OK, update.data)
        self.assertEqual(len(update.data['items']), 1)
        self.assertEqual(float(update.data['total_cost_afn']), 2.5)

        delete = self.client.delete(f'/api/damaged-materials/{record_id}/')
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)
        for material in (self.label, self.plastic, self.carton):
            stock = RawMaterialStock.objects.get(raw_material=material)
            self.assertGreater(stock.quantity, 0)
