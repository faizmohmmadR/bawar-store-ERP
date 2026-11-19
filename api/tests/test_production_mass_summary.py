from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from api.models.data.raw_materials import RawMaterial, RawMaterialPurchase, RawMaterialPurchaseItem, RawMaterialStock
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.storage_tank import StorageTank
from api.models.data.vendors import Vendor
from api.services.raw_material_stock import reconcile_raw_material_stock
from api.services.packing import get_available_packing_tanks
from api.views.data.raw_material_process import RawMaterialProcessViewSet


class OpenProduction(RawMaterialProcessViewSet):
    permission_classes = []


class ProductionMassSummaryTests(TestCase):
    def setUp(self):
        self.material = RawMaterial.objects.create(name='Chemistry', unit='kg', material_type='chemistry')
        self.vendor = Vendor.objects.create(name='Supplier')
        self.factory = APIRequestFactory()
        self.create = OpenProduction.as_view({'post': 'create'})

    def receive(self, amount='20', price='10', material=None):
        purchase = RawMaterialPurchase.objects.create(vendor=self.vendor, status='received', currency=1)
        line = RawMaterialPurchaseItem.objects.create(purchase=purchase, raw_material=material or self.material, quantity=Decimal(amount), price_per_unit=Decimal(price), piece_count=10)
        reconcile_raw_material_stock(purchase, previous_status='draft', previous_items=[], save_stock=True)
        return line

    def payload(self, **overrides):
        data = {'product_name': 'Mixture', 'output_from_inputs': True, 'water_quantity_kg': '9.5', 'extra_expense': '5', 'expense_currency': 1,
                'items': [{'raw_material': self.material.pk, 'quantity': '500', 'quantity_unit': 'g'}]}
        data.update(overrides)
        return data

    def test_computed_mass_cost_and_packing_tank_use_same_total(self):
        self.receive()
        tank = StorageTank.objects.create(name='Tank', capacity_liters=100)
        response = self.create(self.factory.post('/', self.payload(output_quantity_kg='999', materials_quantity_kg='888', density_kg_per_liter='2', status='moved_to_storage', storage_transfers=[{'storage_tank': tank.pk, 'quantity_kg': '10'}]), format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        for field, expected in {'chemistry_quantity_kg': '.5', 'materials_quantity_kg': '.5', 'water_quantity_kg': '9.5', 'total_input_quantity_kg': '10', 'output_quantity_kg': '10', 'output_quantity_liters': '5', 'material_cost_afn': '5', 'total_cost_afn': '10', 'cost_per_kg_afn': '1', 'cost_per_liter_afn': '2'}.items():
            self.assertEqual(Decimal(response.data[field]), Decimal(expected), field)
        option = next(row for row in get_available_packing_tanks() if row['id'] == tank.pk)
        self.assertEqual(Decimal(option['available_kg']), Decimal('10'))
        self.assertEqual(Decimal(option['liquid_cost_per_liter_afn']), Decimal('2'))
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).quantity, Decimal('19.5'))

    def test_edit_recalculates_mass_cost_and_restores_previous_usage(self):
        self.receive()
        response = self.create(self.factory.post('/', self.payload(), format='json'))
        view = OpenProduction.as_view({'patch': 'partial_update'})
        response = view(self.factory.patch('/', {'water_quantity_kg': '9', 'items': [{'raw_material': self.material.pk, 'quantity': '1', 'quantity_unit': 'kg'}]}, format='json'), pk=response.data['id'])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(response.data['total_input_quantity_kg']), Decimal('10'))
        self.assertEqual(Decimal(response.data['cost_per_kg_afn']), Decimal('1.5'))
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).quantity, Decimal('19'))

    def test_shortage_has_row_error_and_rolls_back(self):
        self.receive('1')
        response = self.create(self.factory.post('/', self.payload(items=[{'raw_material': self.material.pk, 'quantity': '2'}]), format='json'))
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('quantity', response.data['items'][0])
        self.assertEqual(RawMaterialProcess.objects.count(), 0)
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).quantity, Decimal('1'))

    def test_selected_purchase_limit_is_checked_separately_from_total_stock(self):
        first = self.receive('.25')
        self.receive('5')
        response = self.create(self.factory.post('/', self.payload(items=[{'raw_material': self.material.pk, 'quantity': '.5', 'purchase_item': first.pk}]), format='json'))
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('quantity', response.data['items'][0])
        self.assertEqual(RawMaterialProcess.objects.count(), 0)

    def test_gram_inventory_is_converted_to_kg_before_costing(self):
        grams = RawMaterial.objects.create(name='Powder', unit='g', material_type='chemistry')
        self.receive('1500', '.002', grams)
        response = self.create(self.factory.post('/', self.payload(water_quantity_kg='.5', extra_expense='0', items=[{'raw_material': grams.pk, 'quantity': '.5', 'quantity_unit': 'kg'}]), format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['materials_quantity_kg']), Decimal('.5'))
        self.assertEqual(Decimal(response.data['total_input_quantity_kg']), Decimal('1'))
        self.assertEqual(Decimal(response.data['cost_per_kg_afn']), Decimal('1'))
        self.assertEqual(Decimal(response.data['items'][0]['quantity']), Decimal('500'))

    def test_negative_or_fractional_package_counts_cannot_increase_stock(self):
        self.receive()
        for pieces in ('-1', '.5', 'NaN'):
            response = self.create(self.factory.post('/', self.payload(items=[{'raw_material': self.material.pk, 'quantity': '1', 'piece_count': pieces}]), format='json'))
            self.assertEqual(response.status_code, 400, response.data)
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity, Decimal('20'))
        self.assertEqual(stock.piece_count, 10)

    def test_new_api_can_derive_output_without_client_output_field(self):
        self.receive()
        data = self.payload()
        del data['output_from_inputs']
        response = self.create(self.factory.post('/', data, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['output_from_inputs'])
        self.assertEqual(Decimal(response.data['output_quantity_kg']), Decimal('10'))

    def test_backfill_adds_breakdown_without_changing_legacy_yield_or_cost(self):
        from importlib import import_module
        from types import SimpleNamespace
        from django.apps import apps
        self.receive()
        response = self.create(self.factory.post('/', self.payload(output_from_inputs=False, output_quantity_kg='2', water_quantity_kg='2', extra_expense='0', items=[{'raw_material': self.material.pk, 'quantity': '1'}]), format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        process = RawMaterialProcess.objects.get(pk=response.data['id'])
        original_cost = process.cost_per_kg_afn
        RawMaterialProcess.objects.filter(pk=process.pk).update(materials_quantity_kg=0, chemistry_quantity_kg=0, total_input_quantity_kg=0)
        migration = import_module('api.migrations.0006_rawmaterialprocess_chemistry_quantity_kg_and_more')
        migration.backfill_input_weights(apps, SimpleNamespace(connection=SimpleNamespace(alias='default')))
        process.refresh_from_db()
        self.assertEqual(process.materials_quantity_kg, Decimal('1'))
        self.assertEqual(process.total_input_quantity_kg, Decimal('3'))
        self.assertEqual(process.output_quantity_kg, Decimal('2'))
        self.assertEqual(process.cost_per_kg_afn, original_cost)
        self.assertFalse(process.output_from_inputs)

    def test_archived_material_with_remaining_stock_is_offered_and_consumed(self):
        from api.services.raw_material_process import get_available_raw_material_process_options
        self.receive()
        self.material.soft_delete()
        self.assertIn(self.material.pk, [row['raw_material'] for row in get_available_raw_material_process_options()])
        response = self.create(self.factory.post('/', self.payload(), format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(RawMaterialStock.objects.get(raw_material_id=self.material.pk).quantity, Decimal('19.5'))
        self.assertEqual(Decimal(response.data['chemistry_quantity_kg']), Decimal('.5'))
        self.material.refresh_from_db()
        self.assertIsNotNone(self.material.deleted_at)

    def test_unknown_material_selection_has_material_row_error(self):
        response = self.create(self.factory.post('/', self.payload(items=[{'raw_material': 999999, 'quantity': '1'}]), format='json'))
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('raw_material', response.data['items'][0])
        self.assertEqual(RawMaterialProcess.objects.count(), 0)

    def test_archived_material_without_stock_is_not_offered_or_consumed(self):
        from api.services.raw_material_process import get_available_raw_material_process_options
        self.material.soft_delete()
        self.assertNotIn(self.material.pk, [row['raw_material'] for row in get_available_raw_material_process_options()])
        response = self.create(self.factory.post('/', self.payload(), format='json'))
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(RawMaterialProcess.objects.count(), 0)

    def test_stock_without_active_purchase_can_be_used_and_costed(self):
        from api.services.raw_material_process import get_available_raw_material_process_options
        RawMaterialStock.objects.create(raw_material=self.material, quantity=2, last_purchase_price=12)
        self.material.soft_delete()
        self.assertIn(self.material.pk, [row['raw_material'] for row in get_available_raw_material_process_options()])
        response = self.create(self.factory.post('/', self.payload(), format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['material_cost_afn']), Decimal('6'))
        self.assertEqual(response.data['items'][0]['purchase_sources'][0]['source'], 'stock')
        self.assertEqual(RawMaterialStock.objects.get(raw_material_id=self.material.pk).quantity, Decimal('1.5'))
        edit = OpenProduction.as_view({'patch': 'partial_update'})
        response = edit(self.factory.patch('/', {'notes': 'Updated'}, format='json'), pk=response.data['id'])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(RawMaterialStock.objects.get(raw_material_id=self.material.pk).quantity, Decimal('1.5'))

    def test_multiple_selected_purchases_keep_individual_costs(self):
        first = self.receive('15', '10')
        second = self.receive('85', '20')
        self.receive('50', '100')
        payload = self.payload(water_quantity_kg='0', extra_expense='0', items=[{
            'raw_material': self.material.pk, 'quantity': '100',
            'purchase_items': [first.pk, second.pk],
        }])
        response = self.create(self.factory.post('/', payload, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['material_cost_afn']), Decimal('1850'))
        sources = response.data['items'][0]['purchase_sources']
        self.assertEqual([source['purchase_item'] for source in sources], [first.pk, second.pk])
        self.assertEqual([Decimal(source['quantity']) for source in sources], [Decimal('15'), Decimal('85')])
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).quantity, Decimal('50'))
        edit = OpenProduction.as_view({'patch': 'partial_update'})
        response = edit(self.factory.patch('/', {'notes': 'Multi purchase'}, format='json'), pk=response.data['id'])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(response.data['material_cost_afn']), Decimal('1850'))

    def test_selected_purchases_cannot_fall_back_to_other_stock(self):
        first = self.receive('1', '10')
        second = self.receive('2', '20')
        self.receive('50', '100')
        response = self.create(self.factory.post('/', self.payload(items=[{
            'raw_material': self.material.pk, 'quantity': '4', 'purchase_items': [first.pk, second.pk],
        }]), format='json'))
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(RawMaterialProcess.objects.count(), 0)
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).quantity, Decimal('53'))

    def test_purchase_backed_stock_is_price_protected_but_can_be_deleted(self):
        from api.serializers.data.raw_materials import RawMaterialStockDirectSerializer
        from api.views.data.raw_materials import RawMaterialStockViewSet
        self.receive()
        stock = RawMaterialStock.objects.get(raw_material=self.material)
        serializer = RawMaterialStockDirectSerializer(stock, data={'quantity': '1', 'last_purchase_price': '999'}, partial=True)
        self.assertFalse(serializer.is_valid())
        view = type('OpenStock', (RawMaterialStockViewSet,), {'permission_classes': []}).as_view({'delete': 'destroy'})
        response = view(self.factory.delete('/'), pk=stock.pk)
        self.assertEqual(response.status_code, 204, response.data)
        self.assertFalse(RawMaterialStock.objects.filter(pk=stock.pk).exists())
        self.assertTrue(RawMaterialPurchaseItem.objects.filter(raw_material=self.material).exists())

    def test_purchase_with_zero_packages_remains_selectable_and_consumable(self):
        from api.services.raw_material_process import get_available_raw_material_process_options
        line = self.receive('10', '7')
        line.piece_count = 0
        line.save()
        RawMaterialStock.objects.filter(raw_material=self.material).update(piece_count=0)
        option = next(row for row in get_available_raw_material_process_options() if row['raw_material'] == self.material.pk)
        self.assertEqual(option['purchase_lots'][0]['id'], line.pk)
        self.assertEqual(option['purchase_lots'][0]['available_piece_count'], 0)
        response = self.create(self.factory.post('/', self.payload(items=[{
            'raw_material': self.material.pk, 'quantity': '2', 'piece_count': 0, 'purchase_items': [line.pk],
        }]), format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data['material_cost_afn']), Decimal('14'))
