from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.packing import PackingRun, PackingRunComponent, PackingRunOutput
from api.models.data.products import Product
from api.models.data.raw_material_process import RawMaterialProcess, RawMaterialProcessItem
from api.models.data.raw_materials import RawMaterial, RawMaterialStock
from api.models.data.stock import Stock
from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.services.reporting.contracts import ReportScope
from api.services.reporting.inventory_transformation_bridge import inventory_transformation_bridge
from api.tests.accounting.helpers import create_staff_user


class InventoryTransformationBridgeV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='transformbridge', email='transformbridge@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.when = datetime(2026, 8, 1, 12, tzinfo=dt_timezone.utc)
        self.product = Product.objects.create(name='Transformation product')
        self.material = RawMaterial.objects.create(name='Transformation raw', material_type='chemistry', unit='kg')
        self.raw_stock = RawMaterialStock.objects.create(raw_material=self.material, quantity=0)
        self.tank = StorageTank.objects.create(name='Transformation tank', capacity_liters=1000)
        self.stock = Stock.objects.create(product=self.product, piece_amount=0, buy_price=0, currency=1)

    def process(self, *, item_cost=40, header_material=40, total=45, with_transfer=True):
        process = RawMaterialProcess.objects.bulk_create([RawMaterialProcess(
            process_number=f'TRANS-P-{RawMaterialProcess.objects.count() + 1}',
            product_name='Liquid', product=self.product, status='moved_to_storage',
            process_date=self.when, output_quantity_liters=10, output_quantity_kg=10,
            material_cost_afn=header_material, extra_expense_afn=5, total_cost_afn=total,
            cost_per_liter_afn=Decimal(total) / 10)])[0]
        RawMaterialProcessItem.objects.bulk_create([RawMaterialProcessItem(
            process=process, raw_material=self.material, quantity=10, material_cost_afn=item_cost)])
        if with_transfer:
            ProductionStorageTransfer.objects.bulk_create([ProductionStorageTransfer(
                production=process, storage_tank=self.tank, quantity_liters=10, quantity_kg=10)])
        return process

    def packing(self, *, packaging=5, total=45, returned=0, with_output=True):
        run = PackingRun.objects.bulk_create([PackingRun(
            packing_number=f'TRANS-K-{PackingRun.objects.count() + 1}',
            storage_tank=self.tank, product=self.product, finished_stock=self.stock,
            quantity_liters=10, bottle_volume_liters=1, bottle_count=10,
            liquid_cost_afn=40, packaging_cost_afn=packaging, returned_cost_afn=returned,
            total_cost_afn=total, cost_per_bottle_afn=Decimal(total) / 10)])[0]
        PackingRunComponent.objects.bulk_create([PackingRunComponent(
            packing_run=run, component_type='bottle', raw_material_stock=self.raw_stock,
            quantity_pieces=10, unit_cost_afn=Decimal('0.5'), total_cost_afn=5)])
        if with_output:
            batch = InventoryBatch.objects.bulk_create([InventoryBatch(
                batch_number=f'TRANS-B-{InventoryBatch.objects.count() + 1}', product=self.product,
                pieces_received=10, remaining_pieces=10)])[0]
            PackingRunOutput.objects.bulk_create([PackingRunOutput(
                packing_run=run, component_type='bottle', stock=self.stock, inventory_batch=batch,
                quantity_pieces=10, total_cost_afn=total, unit_cost_afn=Decimal(total) / 10)])
        return run

    def test_connected_production_and_packing_values_match(self):
        self.process()
        self.packing()
        rows = {row['source_model']: row for row in inventory_transformation_bridge(ReportScope())['rows']}
        production = rows['rawmaterialprocess']
        packing = rows['packingrun']
        self.assertEqual((production['input_value_afn'], production['extra_expense_afn'],
                          production['output_value_afn'], production['output_header_difference_afn']),
                         ('40.0000', '5.0000', '45.0000', '0.0000'))
        self.assertEqual((packing['input_value_afn'], packing['output_value_afn'],
                          packing['output_header_difference_afn']), ('45.0000', '45.0000', '0.0000'))
        self.assertNotIn('transfer_value_mismatch', production['issues'])
        self.assertNotIn('packing_output_value_mismatch', packing['issues'])

    def test_source_mismatch_and_missing_outputs_are_visible(self):
        self.process(item_cost=30, header_material=40, total=50)
        self.packing(packaging=6, total=50, with_output=False)
        rows = {row['source_model']: row for row in inventory_transformation_bridge(ReportScope())['rows']}
        self.assertIn('material_cost_mismatch', rows['rawmaterialprocess']['issues'])
        self.assertIn('production_total_mismatch', rows['rawmaterialprocess']['issues'])
        self.assertIn('packing_total_mismatch', rows['packingrun']['issues'])
        self.assertIn('packing_output_batch_missing', rows['packingrun']['issues'])
        self.assertIsNone(rows['packingrun']['output_header_difference_afn'])

    def test_incomplete_transfer_does_not_compare_zero_to_full_output(self):
        self.process(with_transfer=False)
        row = inventory_transformation_bridge(ReportScope())['rows'][0]
        self.assertIsNone(row['output_value_afn'])
        self.assertIsNone(row['output_header_difference_afn'])
        self.assertIn('transfer_quantity_mismatch_or_cutoff_incomplete', row['issues'])

    def test_returned_bottle_cost_is_explicit_part_of_packing_total(self):
        self.packing(total=49, returned=4)
        row = inventory_transformation_bridge(ReportScope())['rows'][0]
        self.assertEqual(row['input_value_afn'], '45.0000')
        self.assertEqual(row['extra_expense_afn'], '4.0000')
        self.assertEqual(row['cost_build_difference_afn'], '0.0000')
        self.assertEqual(row['output_header_difference_afn'], '0.0000')

    def test_endpoint_rejects_unsupported_filters(self):
        process = self.process()
        ProductionStorageTransfer.objects.filter(production=process).update(created_at=self.when + timedelta(days=4))
        url = '/api/reports/v2/inventory-transformation-bridge/'
        response = self.client.get(url, {'end_date': '2026-08-02'})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['rows'][0]['output_value_afn'])
        self.assertIn('transfer_quantity_mismatch_or_cutoff_incomplete', response.data['rows'][0]['issues'])
        for param in ('start_date', 'currency', 'account_id'):
            self.assertEqual(self.client.get(url, {param: 1}).status_code, 400)
