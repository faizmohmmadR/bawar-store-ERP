"""Storage tank leaks reduce inventory and post damaged liquid records."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.damaged_materials import DamagedMaterialRecord
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.models.data.storage_tank_leak import StorageTankLeak
from api.services.accounting.coa import ensure_accounting_ready
from api.services.tank_inventory import get_tank_mass_quantity
from api.models.data.currency import BASE_CURRENCY_ID


User = get_user_model()


class StorageTankLeakTests(TestCase):
    def setUp(self):
        ensure_accounting_ready(currency_id=BASE_CURRENCY_ID)
        self.user = User.objects.create_user(
            username='tank-leak-admin',
            email='tank-leak@example.com',
            password='pass-123',
        )
        self.user.is_admin = True
        self.user.is_superuser = True
        self.user.is_staff = True
        self.user.role = 'admin'
        self.user.save()
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.tank = StorageTank.objects.create(
            name='Leak tank',
            capacity_kg=Decimal('1000'),
            capacity_liters=Decimal('1000'),
            density_kg_per_liter=Decimal('1'),
        )
        production = RawMaterialProcess.objects.create(
            product_name='Leak liquid',
            status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE,
            output_quantity_liters=Decimal('100'),
            output_quantity_kg=Decimal('100'),
            density_kg_per_liter=Decimal('1'),
            cost_per_liter_afn=Decimal('10'),
        )
        ProductionStorageTransfer.objects.create(
            production=production,
            storage_tank=self.tank,
            quantity_liters=Decimal('100'),
            quantity_kg=Decimal('100'),
        )

    def test_create_edit_delete_leak_updates_tank_and_damaged(self):
        self.assertEqual(get_tank_mass_quantity(self.tank), Decimal('100.0000'))
        created = self.client.post('/api/storage-tank-leaks/', {
            'storage_tank': self.tank.pk,
            'quantity_kg': '25',
            'notes': 'Pipe leak',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        leak_id = created.data['id']
        self.assertEqual(Decimal(str(created.data['quantity_kg'])), Decimal('25.0000'))
        self.assertEqual(Decimal(str(created.data['total_cost_afn'])), Decimal('250.000000'))
        self.assertTrue(created.data.get('damaged_number'))
        self.assertEqual(get_tank_mass_quantity(self.tank), Decimal('75.0000'))
        damaged = DamagedMaterialRecord.objects.get(pk=created.data['damaged_record'])
        self.assertEqual(damaged.source, DamagedMaterialRecord.SOURCE_TANK_LEAK)
        self.assertEqual(damaged.items.get().quantity_pieces, Decimal('25.0000'))

        updated = self.client.patch(f'/api/storage-tank-leaks/{leak_id}/', {
            'quantity_kg': '40',
            'notes': 'Pipe leak corrected',
        }, format='json')
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(get_tank_mass_quantity(self.tank), Decimal('60.0000'))
        self.assertEqual(StorageTankLeak.objects.filter(deleted_at__isnull=True).count(), 1)

        deleted = self.client.delete(f'/api/storage-tank-leaks/{updated.data["id"]}/')
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(get_tank_mass_quantity(self.tank), Decimal('100.0000'))
        self.assertFalse(StorageTankLeak.objects.filter(deleted_at__isnull=True).exists())

    def test_cannot_leak_more_than_available(self):
        response = self.client.post('/api/storage-tank-leaks/', {
            'storage_tank': self.tank.pk,
            'quantity_kg': '150',
        }, format='json')
        self.assertEqual(response.status_code, 400)
