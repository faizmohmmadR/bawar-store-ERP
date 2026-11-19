"""Independent arithmetic and value-conservation checks for packing costs."""
from decimal import Decimal

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from api.models.data.packing import PackingRun, PackingRunOutput
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.raw_materials import RawMaterial, RawMaterialCategory, RawMaterialStock
from api.models.data.storage_tank import StorageTank, ProductionStorageTransfer
from api.serializers.data.packing import PackingRunSerializer
from api.services.packing import create_packing_run, _consume_raw_material_component


class PackingCostAuditTests(TestCase):
    def setUp(self):
        category, _ = RawMaterialCategory.objects.get_or_create(name='Cost audit')
        self.tank = StorageTank.objects.create(name='Cost audit tank', capacity_liters=100)
        production = RawMaterialProcess.objects.create(product_name='Audit liquid',
            status='moved_to_storage', output_quantity_liters=20, output_quantity_kg=20,
            cost_per_liter_afn=3, density_kg_per_liter=1)
        ProductionStorageTransfer.objects.create(production=production, storage_tank=self.tank,
            quantity_liters=20, quantity_kg=20)
        self.components = []
        self.materials = {}
        for kind, material_type, unit, quantity, pieces, price, used in [
            ('bottle', 'bottle', 'piece', 100, 0, '2', 8),
            ('cap', 'cap', 'piece', 100, 0, '0.5', 8),
            ('label', 'label_double', 'piece', 200, 0, '0.2', 16),
            ('plastic', 'plastic', 'kg', 1, 3, '100', 1),
            ('carton', 'carton', 'piece', 100, 0, '5', 1),
        ]:
            material = RawMaterial.objects.create(name=f'Audit {kind}', material_type=material_type,
                unit=unit, category=category if kind in ('bottle', 'plastic') else None,
                capacity_liters=1 if kind in ('bottle', 'carton') else None,
                bottles_per_carton=8 if kind == 'carton' else None)
            RawMaterialStock.objects.create(raw_material=material, quantity=quantity,
                piece_count=pieces, last_purchase_price=Decimal(price))
            self.materials[kind] = material
            self.components.append(dict(component_type=kind, raw_material=material.pk,
                quantity_pieces=used))

    def pack(self, components=None):
        return create_packing_run(storage_tank_id=self.tank.pk, quantity_liters=8,
            bottle_volume_liters=1, components=components or self.components)

    def test_explicit_cost_example_and_distinct_full_run_and_stock_costs(self):
        run = self.pack()
        self.assertEqual(run.liquid_cost_afn, Decimal('24'))
        self.assertEqual(run.packaging_cost_afn, Decimal('61.5333'))
        self.assertEqual(run.total_cost_afn, Decimal('85.5333'))
        self.assertEqual(run.cost_per_bottle_afn, Decimal('10.691663'))
        outputs = {row.component_type: row for row in run.outputs.all()}
        self.assertEqual(outputs['bottle'].total_cost_afn, Decimal('47.2'))
        self.assertEqual(outputs['bottle'].unit_cost_afn, Decimal('5.9'))
        self.assertEqual(outputs['carton'].unit_cost_afn, Decimal('5'))
        self.assertEqual(outputs['plastic'].unit_cost_afn, Decimal('33.3333'))
        self.assertEqual(sum(row.total_cost_afn for row in outputs.values()), run.total_cost_afn)
        data = PackingRunSerializer(run).data
        self.assertEqual(Decimal(data['cost_per_carton_afn']), Decimal('85.5333'))
        self.assertEqual(Decimal(data['cost_per_plastic_afn']), Decimal('85.5333'))
        self.assertEqual(Decimal(data['full_unit_costs'][0]['cost_per_bottle_afn']), Decimal('10.691663'))
        self.assertEqual(Decimal(data['full_unit_costs'][0]['cost_per_carton_afn']), Decimal('85.533300'))
        self.assertEqual(Decimal(data['full_unit_costs'][0]['cost_per_plastic_afn']), Decimal('85.533300'))

    def test_kg_piece_consumption_conserves_raw_and_output_value(self):
        stock = RawMaterialStock.objects.get(raw_material=self.materials['plastic'])
        _, consumed, _ = _consume_raw_material_component(stock, 1, None)
        stock.refresh_from_db()
        remaining = stock.quantity * stock.last_purchase_price
        self.assertLessEqual(abs(remaining + consumed - Decimal('100')), Decimal('0.0001'))

    def test_complete_kg_piece_consumption_does_not_drop_or_invent_cost(self):
        stock = RawMaterialStock.objects.get(raw_material=self.materials['plastic'])
        costs = []
        for _ in range(3):
            _, cost, _ = _consume_raw_material_component(stock, 1, None)
            costs.append(cost)
        stock.refresh_from_db()
        self.assertEqual(stock.quantity, 0)
        self.assertEqual(stock.piece_count, 0)
        self.assertLessEqual(abs(sum(costs) - Decimal('100')), Decimal('0.0001'))

    def test_no_plastic_still_preserves_total_and_bottle_cost(self):
        run = self.pack([row for row in self.components if row['component_type'] != 'plastic'])
        self.assertEqual(run.total_cost_afn, Decimal('52.2'))
        self.assertEqual(run.outputs.get(component_type='bottle').unit_cost_afn, Decimal('5.9'))
        self.assertFalse(run.outputs.filter(component_type='plastic').exists())

    def test_extra_empty_bottles_are_costed_but_do_not_inflate_finished_count(self):
        rows = [dict(row, quantity_pieces=10) if row['component_type'] == 'bottle' else row for row in self.components]
        run = self.pack(rows)
        self.assertEqual(run.bottle_count, 8)
        self.assertEqual(run.outputs.get(component_type='bottle').unit_cost_afn, Decimal('6.4'))

    def test_gram_stock_cannot_be_silently_consumed_as_pieces(self):
        material = self.materials['plastic']
        material.unit = 'g'
        material.save(update_fields=['unit'])
        stock = RawMaterialStock.objects.select_related('raw_material').get(raw_material=material)
        with self.assertRaises(ValidationError):
            _consume_raw_material_component(stock, 1, None)

    def test_untouched_large_output_can_reverse_despite_unit_cost_rounding(self):
        from api.services.material_finished_stock import add_material_stock, reverse_output
        run = PackingRun.objects.create(storage_tank=self.tank, quantity_liters=1, quantity_kg=1,
            bottle_volume_liters=1, bottle_count=1, liquid_cost_afn=1,
            packaging_cost_afn=0, total_cost_afn=1, cost_per_bottle_afn=1)
        stock, batch, unit = add_material_stock(material=self.materials['carton'], quantity=3000,
            total_cost=1, packing=True)
        output = PackingRunOutput.objects.create(packing_run=run, component_type='carton', stock=stock,
            inventory_batch=batch, quantity_pieces=3000, total_cost_afn=1, unit_cost_afn=unit)
        reverse_output(output, action='deleted')
        stock.refresh_from_db()
        self.assertEqual(stock.piece_amount, 0)
        self.assertEqual(stock.buy_price, 0)

    def test_full_unit_costs_do_not_mix_independent_returned_section(self):
        from api.services.packing_costs import packing_full_cost_sections
        run = self.pack()
        # A carried value of 60 and one new carton at 5 belong to the
        # returned section, not the newly filled section's plastic cost.
        run.total_cost_afn += Decimal('65')
        run.returned_cost_afn = Decimal('60')
        run.returned_bottle_count = 6
        run.bottle_count += 6
        run.save()
        from api.models.data.packing import PackingRunComponent
        PackingRunComponent.objects.create(packing_run=run, component_type='returned_carton',
            raw_material_stock=RawMaterialStock.objects.get(raw_material=self.materials['carton']),
            quantity_pieces=1, unit_cost_afn=5, total_cost_afn=5)
        sections = packing_full_cost_sections(run)
        self.assertEqual(len(sections), 2)
        self.assertEqual(sections[0]['section'], 'new')
        self.assertEqual(Decimal(sections[0]['cost_per_bottle_afn']), Decimal('10.691663'))
        self.assertEqual(Decimal(sections[0]['cost_per_plastic_afn']), Decimal('85.533300'))
        self.assertEqual(sections[1]['section'], 'returned')
        self.assertEqual(Decimal(sections[1]['cost_per_bottle_afn']), Decimal('10.833333'))
        self.assertEqual(Decimal(sections[1]['cost_per_carton_afn']), Decimal('65'))
        self.assertIsNone(sections[1]['cost_per_plastic_afn'])

    def test_full_costs_report_usd_using_run_snapshot(self):
        from api.services.packing_costs import full_unit_costs
        values = full_unit_costs(1000, 100, 10, 20, rate=Decimal('80'))
        self.assertEqual(Decimal(values['cost_per_bottle_afn']), 10)
        self.assertEqual(Decimal(values['cost_per_carton_afn']), 100)
        self.assertEqual(Decimal(values['cost_per_plastic_afn']), 50)
        self.assertEqual(Decimal(values['cost_per_bottle_usd']), Decimal('0.125'))
        self.assertEqual(Decimal(values['cost_per_carton_usd']), Decimal('1.25'))
        self.assertEqual(Decimal(values['cost_per_plastic_usd']), Decimal('0.625'))

    def test_every_packaging_material_can_be_omitted_and_output_value_is_preserved(self):
        from itertools import combinations
        from api.services.packing import delete_packing_run
        for size in range(len(self.components) + 1):
            for selected in combinations(self.components, size):
                with self.subTest(materials=[r['component_type'] for r in selected]):
                    run = create_packing_run(storage_tank_id=self.tank.pk,
                        quantity_liters=8, quantity_kg=8, bottle_volume_liters=0,
                        filled_bottle_count=8, components=list(selected))
                    self.assertEqual(run.bottle_count, 8)
                    self.assertEqual(sum(o.total_cost_afn for o in run.outputs.all()), run.total_cost_afn)
                    self.assertEqual(run.finished_stock.piece_amount, 8)
                    self.assertEqual(run.components.count(), size)
                    self.assertIsNotNone(run.product_id)
                    delete_packing_run(packing_run_id=run.pk)

    def test_no_bottle_material_requires_valid_manual_count(self):
        for count in [None, 0, -1, Decimal('2.5')]:
            with self.subTest(count=count), self.assertRaises(ValidationError):
                create_packing_run(storage_tank_id=self.tank.pk, quantity_liters=8,
                    bottle_volume_liters=0, filled_bottle_count=count, components=[])

    def test_no_bottle_material_edit_keeps_stock_and_cost_consistent(self):
        from api.services.packing import update_packing_run
        run = create_packing_run(storage_tank_id=self.tank.pk, quantity_liters=8,
            bottle_volume_liters=0, filled_bottle_count=3, components=[])
        run = update_packing_run(packing_run_id=run.pk, storage_tank_id=self.tank.pk,
            quantity_liters=8, bottle_volume_liters=0, filled_bottle_count=4, components=[])
        self.assertEqual(run.bottle_count, 4)
        self.assertEqual(run.finished_stock.piece_amount, 4)
        self.assertEqual(run.total_cost_afn, 24)
        self.assertEqual(run.product.bottle_capacity_kg, 2)

    def test_serializer_accepts_no_packaging_and_plastic_capacity(self):
        from api.serializers.data.packing import CreatePackingRunSerializer
        from api.serializers.data.raw_materials import RawMaterialSerializer
        serializer = CreatePackingRunSerializer(data={'storage_tank': self.tank.pk,
            'quantity_kg': 8, 'filled_bottle_count': 8, 'components': []})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        material = self.materials['plastic']
        serializer = RawMaterialSerializer(material, data={'bottles_per_plastic': 3}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        material.refresh_from_db()
        self.assertEqual(material.bottles_per_plastic, 3)
        self.assertIsNone(material.capacity_kg)

    def test_custom_production_names_do_not_determine_selected_bottle_inventory(self):
        from rest_framework.test import APIRequestFactory
        from api.views.data.packing import PackingRunViewSet
        production = RawMaterialProcess.objects.create(product_name='My separate custom batch name',
            status='moved_to_storage', output_quantity_liters=10, output_quantity_kg=10,
            cost_per_liter_afn=7, density_kg_per_liter=1)
        ProductionStorageTransfer.objects.create(production=production, storage_tank=self.tank,
            quantity_liters=10, quantity_kg=10)
        view = type('OpenPacking', (PackingRunViewSet,), {'permission_classes': []}).as_view({'post': 'create'})
        response = view(APIRequestFactory().post('/', {
            'storage_tank': self.tank.pk, 'quantity_kg': '8', 'components': self.components,
        }, format='json'))
        self.assertEqual(response.status_code, 201, response.data)
        run = PackingRun.objects.get(pk=response.data['id'])
        self.assertEqual(run.product.raw_material_id, self.materials['bottle'].pk)
        self.assertEqual(sum(o.total_cost_afn for o in run.outputs.all()), run.total_cost_afn)
        self.assertEqual(run.bottle_count, 8)

    def test_blank_production_name_does_not_block_packing(self):
        RawMaterialProcess.objects.filter(storage_transfers__storage_tank=self.tank).update(product_name='')
        run = self.pack()
        self.assertEqual(run.product.raw_material_id, self.materials['bottle'].pk)

    def test_no_bottle_inventory_is_independent_of_production_name_changes(self):
        first = create_packing_run(storage_tank_id=self.tank.pk, quantity_liters=4,
            bottle_volume_liters=0, filled_bottle_count=4, components=[])
        RawMaterialProcess.objects.filter(storage_transfers__storage_tank=self.tank).update(product_name='A renamed production')
        production = RawMaterialProcess.objects.create(product_name='Another custom name',
            status='moved_to_storage', output_quantity_liters=10, output_quantity_kg=10,
            cost_per_liter_afn=3, density_kg_per_liter=1)
        ProductionStorageTransfer.objects.create(production=production, storage_tank=self.tank,
            quantity_liters=10, quantity_kg=10)
        second = create_packing_run(storage_tank_id=self.tank.pk, quantity_liters=4,
            bottle_volume_liters=0, filled_bottle_count=4, components=[])
        self.assertEqual(first.product_id, second.product_id)
        self.assertEqual(first.finished_stock_id, second.finished_stock_id)
        second.finished_stock.refresh_from_db()
        self.assertEqual(second.finished_stock.piece_amount, 8)
        self.assertEqual(second.total_cost_afn, 12)
