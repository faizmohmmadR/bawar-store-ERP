from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.models.data.packing import PackingReturn
from api.models.data.products import Product
from api.models.data.raw_material_process import RawMaterialProcess, RawMaterialProcessItem
from api.models.data.raw_materials import RawMaterial, RawMaterialStock
from api.models.data.stock import Stock
from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.services.reporting.contracts import ReportScope
from api.services.reporting.inventory_current_position import inventory_current_position
from api.tests.accounting.helpers import create_staff_user


class InventoryCurrentPositionV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='currentinventoryv2', email='currentinventoryv2@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.material = RawMaterial.objects.create(name='Current raw', material_type='chemistry', unit='kg')
        self.product = Product.objects.create(name='Current finished')
        self.stock = Stock.objects.bulk_create([Stock(product=self.product, condition='good',
            piece_amount=3, buy_price=5, currency=1)])[0]
        self.tank = StorageTank.objects.create(name='Current tank', capacity_liters=100)

    def gl(self, amount=72, *, unknown=False):
        account, _ = GLAccount.objects.get_or_create(code='1100', currency=1,
            defaults={'name': 'Inventory', 'category': 'asset'})
        entry = JournalEntry.objects.create()
        JournalLine.objects.bulk_create([JournalLine(journal_entry=entry, gl_account=account,
            currency=1, debit=amount, credit=0, base_debit=None if unknown else amount,
            base_credit=0, exchange_rate=1, needs_rate_review=unknown)])

    def full_pools(self):
        RawMaterialStock.objects.bulk_create([RawMaterialStock(raw_material=self.material,
            quantity=10, last_purchase_price=2)])
        InventoryBatch.objects.bulk_create([InventoryBatch(batch_number='CURRENT-BATCH',
            product=self.product, condition='good', pieces_received=3, remaining_pieces=3,
            unit_cost=5, currency=1)])
        moved = RawMaterialProcess.objects.bulk_create([RawMaterialProcess(
            process_number='CURRENT-MOVED', product_name='Liquid', status='moved_to_storage',
            output_quantity_liters=5, total_cost_afn=20, cost_per_liter_afn=4)])[0]
        ProductionStorageTransfer.objects.bulk_create([ProductionStorageTransfer(
            production=moved, storage_tank=self.tank, quantity_liters=5)])
        RawMaterialProcess.objects.bulk_create([RawMaterialProcess(
            process_number='CURRENT-PENDING', product_name='Waiting liquid', status='completed',
            output_quantity_liters=1, total_cost_afn=7, cost_per_liter_afn=7)])
        PackingReturn.objects.bulk_create([PackingReturn(stock=self.stock, bottle_count=2,
            remaining_bottle_count=2, inventory_moved=True, unit_cost_afn=5,
            packaging_cost_afn=10)])

    def test_current_pools_and_gl_are_shown_without_double_counting(self):
        self.full_pools()
        self.gl()
        report = inventory_current_position(ReportScope())
        self.assertEqual({row['pool']: row['value_afn'] for row in report['rows']}, {
            'raw_material': '20.0000', 'storage_tank': '20.0000',
            'finished_stock': '15.0000', 'packing_return': '10.0000',
            'production_pending_transfer': '7.0000',
        })
        self.assertEqual((report['operational_total_afn'], report['inventory_gl_afn'],
                          report['difference_afn']), ('72.0000', '72.00', '0.00'))
        self.assertEqual(report['unknown_pool_count'], 0)

    def test_missing_raw_cost_keeps_total_and_difference_null(self):
        self.full_pools()
        RawMaterialStock.objects.update(last_purchase_price=0)
        self.gl()
        report = inventory_current_position(ReportScope())
        self.assertEqual(report['unknown_pool_count'], 1)
        self.assertIsNone(report['operational_total_afn'])
        self.assertIsNone(report['difference_afn'])
        self.assertEqual(report['inventory_gl_afn'], '72.00')

    def test_missing_batch_history_and_unknown_gl_are_explicit(self):
        self.gl(unknown=True)
        report = inventory_current_position(ReportScope())
        stock_row = next(row for row in report['rows'] if row['pool'] == 'finished_stock')
        self.assertIn('batch_history_missing', stock_row['issues'])
        self.assertIsNone(stock_row['value_afn'])
        self.assertIsNone(report['inventory_gl_afn'])
        self.assertEqual(report['unknown_gl_base_count'], 1)

    def test_negative_tank_balance_is_unknown_and_filters_are_rejected(self):
        from api.models.data.packing import PackingRun
        PackingRun.objects.bulk_create([PackingRun(packing_number='CURRENT-OVERDRAW',
            storage_tank=self.tank, quantity_liters=1, bottle_volume_liters=1,
            bottle_count=1, liquid_cost_afn=1, packaging_cost_afn=0,
            total_cost_afn=1, cost_per_bottle_afn=1)])
        report = inventory_current_position(ReportScope())
        tank_row = next(row for row in report['rows'] if row['pool'] == 'storage_tank')
        self.assertIsNone(tank_row['quantity'])
        self.assertIn('tank_balance_inconsistent', tank_row['issues'])
        url = '/api/reports/v2/inventory-current-position/'
        self.assertEqual(self.client.get(url).status_code, 200)
        for params in ({'end_date': '2026-11-01'}, {'start_date': '2026-11-01'},
                       {'currency': 1}, {'account_id': 1}):
            self.assertEqual(self.client.get(url, params).status_code, 400)

    def test_in_process_cost_and_stale_stock_cache_require_review(self):
        self.full_pools()
        RawMaterialProcess.objects.bulk_create([RawMaterialProcess(
            process_number='CURRENT-IN-PROCESS', product_name='Unfinished liquid',
            status='in_process', output_quantity_liters=2, material_cost_afn=8,
            total_cost_afn=8)])
        Stock.objects.filter(pk=self.stock.pk).update(piece_amount=9)
        report = inventory_current_position(ReportScope())
        self.assertIsNone(report['operational_total_afn'])
        process = next(row for row in report['rows'] if row['item_name'] == 'CURRENT-IN-PROCESS')
        self.assertIn('work_in_process_inputs_missing_or_invalid', process['issues'])
        finished = next(row for row in report['rows'] if row['pool'] == 'finished_stock')
        self.assertIn('stock_cache_mismatch', finished['issues'])
        self.assertEqual(finished['value_afn'], '15.0000')

    def test_invalid_negative_operational_quantity_is_not_valued(self):
        RawMaterialStock.objects.bulk_create([RawMaterialStock(raw_material=self.material,
            quantity=-1, last_purchase_price=2)])
        InventoryBatch.objects.bulk_create([InventoryBatch(batch_number='CURRENT-NEGATIVE',
            product=self.product, condition='good', pieces_received=1, remaining_pieces=-1,
            unit_cost=5, currency=1)])
        report = inventory_current_position(ReportScope())
        raw = next(row for row in report['rows'] if row['pool'] == 'raw_material')
        finished = next(row for row in report['rows'] if row['pool'] == 'finished_stock')
        self.assertIsNone(raw['value_afn'])
        self.assertIn('raw_material_quantity_invalid', raw['issues'])
        self.assertIsNone(finished['value_afn'])
        self.assertIn('negative_batch_quantity', finished['issues'])

    def test_priced_batches_remain_valued_when_stock_cache_is_missing(self):
        InventoryBatch.objects.bulk_create([InventoryBatch(batch_number='CURRENT-ORPHAN',
            product=self.product, condition='good', pieces_received=3, remaining_pieces=3,
            unit_cost=5, currency=1)])
        Stock.objects.filter(pk=self.stock.pk).delete()
        report = inventory_current_position(ReportScope())
        finished = next(row for row in report['rows'] if row['pool'] == 'finished_stock')
        self.assertIn('stock_summary_missing', finished['issues'])
        self.assertEqual(finished['value_afn'], '15.0000')

    def test_soft_deleted_stock_summary_is_visible_and_delete_is_guarded(self):
        InventoryBatch.objects.bulk_create([InventoryBatch(batch_number='CURRENT-SOFT-DELETED',
            product=self.product, condition='good', pieces_received=3, remaining_pieces=3,
            unit_cost=5, currency=1)])
        response = self.client.delete(f'/api/stocks/{self.stock.pk}/')
        self.assertEqual(response.status_code, 400)
        self.assertIsNone(Stock.all_objects.get(pk=self.stock.pk).deleted_at)
        Stock.all_objects.filter(pk=self.stock.pk).update(deleted_at=self.tank.created_at)
        report = inventory_current_position(ReportScope())
        finished = next(row for row in report['rows'] if row['pool'] == 'finished_stock')
        self.assertIn('stock_summary_soft_deleted', finished['issues'])
        self.assertEqual(finished['value_afn'], '15.0000')

    def test_work_in_process_has_known_material_value_without_final_output(self):
        process = RawMaterialProcess.objects.bulk_create([RawMaterialProcess(
            process_number='CURRENT-WIP-COSTED', product_name='Pending', status='in_process',
            output_quantity_liters=20, material_cost_afn=8, total_cost_afn=8)])[0]
        RawMaterialProcessItem.objects.bulk_create([RawMaterialProcessItem(
            process=process, raw_material=self.material, quantity=2, material_cost_afn=8)])
        report = inventory_current_position(ReportScope())
        row = next(row for row in report['rows'] if row['item_name'] == process.process_number)
        self.assertEqual(row['value_afn'], '8.0000')
        self.assertIsNone(row['quantity'])
        self.assertIn('work_in_process_output_not_final', row['issues'])
        RawMaterialProcess.objects.filter(pk=process.pk).update(extra_expense_afn=2, total_cost_afn=10)
        row = next(row for row in inventory_current_position(ReportScope())['rows']
                   if row['item_name'] == process.process_number)
        self.assertIsNone(row['value_afn'])
        self.assertIn('extra_production_cost_source_unverified', row['issues'])
