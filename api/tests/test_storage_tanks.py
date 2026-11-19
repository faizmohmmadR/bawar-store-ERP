from decimal import Decimal

from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory

from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.storage_tank import StorageTank
from api.services.production_storage import replace_production_storage_transfers
from api.views.data.raw_material_process import RawMaterialProcessViewSet
from api.views.data.storage_tanks import StorageTankViewSet


class StorageTankApiTests(TestCase):
    def setUp(self):
        self.tank = StorageTank.objects.create(
            name='Mixing Tank A',
            capacity_liters=Decimal('100'),
        )

    def make_production(self, name, output_liters='100'):
        return RawMaterialProcess.objects.create(
            product_name=name,
            output_quantity_liters=Decimal(output_liters),
            status=RawMaterialProcess.STATUS_MOVED_TO_STORAGE,
        )

    def test_tank_list_reports_capacity_and_current_liters(self):
        production = self.make_production('Batch A')
        replace_production_storage_transfers(production, [{
            'storage_tank': self.tank.id,
            'quantity_liters': '35.5',
        }])

        class UnrestrictedStorageTankViewSet(StorageTankViewSet):
            permission_classes = []

        list_tanks = UnrestrictedStorageTankViewSet.as_view({'get': 'list'})
        response = list_tanks(APIRequestFactory().get('/storage-tanks/'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            Decimal(response.data[0]['current_liters']), Decimal('35.5'))
        self.assertEqual(
            Decimal(response.data[0]['available_liters']), Decimal('64.5'))

    def test_tank_detail_includes_production_transfer_history(self):
        production = self.make_production('Historical batch')
        replace_production_storage_transfers(production, [{
            'storage_tank': self.tank.id,
            'quantity_liters': '18.25',
        }])

        class UnrestrictedStorageTankViewSet(StorageTankViewSet):
            permission_classes = []

        retrieve_tank = UnrestrictedStorageTankViewSet.as_view(
            {'get': 'retrieve'})
        response = retrieve_tank(
            APIRequestFactory().get(f'/storage-tanks/{self.tank.id}/'),
            pk=self.tank.id,
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data['production_transfers']), 1)
        self.assertEqual(
            response.data['production_transfers'][0]['process_number'],
            production.process_number,
        )
        self.assertEqual(
            Decimal(response.data['production_transfers']
                    [0]['quantity_liters']),
            Decimal('18.25'),
        )

    def test_transfer_rejects_tank_overfill_and_production_overfill(self):
        production = self.make_production('Batch A', output_liters='120')

        with self.assertRaises(ValidationError):
            replace_production_storage_transfers(production, [{
                'storage_tank': self.tank.id,
                'quantity_liters': '101',
            }])

        with self.assertRaises(ValidationError):
            replace_production_storage_transfers(production, [{
                'storage_tank': self.tank.id,
                'quantity_liters': '121',
            }])

        self.assertFalse(production.storage_transfers.exists())

    def test_transfer_requires_moved_status_and_positive_quantity(self):
        production = RawMaterialProcess.objects.create(
            product_name='Unmoved batch',
            output_quantity_liters=Decimal('100'),
        )
        with self.assertRaises(ValidationError):
            replace_production_storage_transfers(production, [{
                'storage_tank': self.tank.id,
                'quantity_liters': '10',
            }])

        production.status = RawMaterialProcess.STATUS_MOVED_TO_STORAGE
        production.save(update_fields=['status', 'updated_at'])
        with self.assertRaises(ValidationError):
            replace_production_storage_transfers(production, [])

        second_tank = StorageTank.objects.create(
            name='Mixing Tank B',
            capacity_liters=Decimal('100'),
        )
        with self.assertRaises(ValidationError):
            replace_production_storage_transfers(production, [
                {
                    'storage_tank': self.tank.id,
                    'quantity_liters': '10',
                },
                {
                    'storage_tank': second_tank.id,
                    'quantity_liters': '10',
                },
            ])

    def test_status_action_moves_liters_and_releases_tank_when_completed(self):
        production = RawMaterialProcess.objects.create(
            product_name='Action status batch',
            output_quantity_liters=Decimal('100'),
        )

        class UnrestrictedRawMaterialProcessViewSet(RawMaterialProcessViewSet):
            permission_classes = []

        class UnrestrictedStorageTankViewSet(StorageTankViewSet):
            permission_classes = []

        change_status = UnrestrictedRawMaterialProcessViewSet.as_view({
            'patch': 'change_status',
        })
        moved_response = change_status(
            APIRequestFactory().patch(
                f'/raw-material-processes/{production.id}/status/',
                {
                    'status': 'moved_to_storage',
                    'storage_transfers': [{
                        'storage_tank': self.tank.id,
                        'quantity_liters': '35',
                    }],
                },
                format='json',
            ),
            pk=production.id,
        )
        self.assertEqual(moved_response.status_code, 200, moved_response.data)
        self.assertEqual(moved_response.data['status'], 'moved_to_storage')
        self.assertEqual(
            Decimal(
                moved_response.data['storage_transfers'][0]['quantity_liters']),
            Decimal('35'),
        )

        completed_response = change_status(
            APIRequestFactory().patch(
                f'/raw-material-processes/{production.id}/status/',
                {'status': 'completed'},
                format='json',
            ),
            pk=production.id,
        )
        self.assertEqual(completed_response.status_code,
                         200, completed_response.data)
        self.assertEqual(completed_response.data['status'], 'completed')
        self.assertEqual(completed_response.data['storage_transfers'], [])

        list_tanks = UnrestrictedStorageTankViewSet.as_view({'get': 'list'})
        tank_list_response = list_tanks(
            APIRequestFactory().get('/storage-tanks/'))
        self.assertEqual(
            Decimal(tank_list_response.data[0]['current_liters']),
            Decimal('0'),
        )

    def test_edit_releases_old_quantity_before_validating_replacement(self):
        production = self.make_production('Batch A')
        replace_production_storage_transfers(production, [{
            'storage_tank': self.tank.id,
            'quantity_liters': '80',
        }])

        replace_production_storage_transfers(production, [{
            'storage_tank': self.tank.id,
            'quantity_liters': '60',
        }])

        self.assertEqual(
            production.storage_transfers.get().quantity_liters,
            Decimal('60'),
        )

    def test_occupied_tank_cannot_be_deleted_but_empty_tank_can(self):
        production = self.make_production('Batch A')
        replace_production_storage_transfers(production, [{
            'storage_tank': self.tank.id,
            'quantity_liters': '5',
        }])

        class UnrestrictedStorageTankViewSet(StorageTankViewSet):
            permission_classes = []

        delete_tank = UnrestrictedStorageTankViewSet.as_view(
            {'delete': 'destroy'})
        occupied_response = delete_tank(
            APIRequestFactory().delete(f'/storage-tanks/{self.tank.id}/'),
            pk=self.tank.id,
        )
        self.assertEqual(occupied_response.status_code, 400)
        self.assertIsNotNone(StorageTank.objects.get(pk=self.tank.id))

        production.status = RawMaterialProcess.STATUS_COMPLETED
        production.save(update_fields=['status', 'updated_at'])
        replace_production_storage_transfers(production, [])
        empty_response = delete_tank(
            APIRequestFactory().delete(f'/storage-tanks/{self.tank.id}/'),
            pk=self.tank.id,
        )
        self.assertEqual(empty_response.status_code, 204)
        self.assertFalse(StorageTank.objects.filter(pk=self.tank.id).exists())
