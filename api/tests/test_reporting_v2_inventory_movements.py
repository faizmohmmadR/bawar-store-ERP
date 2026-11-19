from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from api.models.data.packing import PackingRun, PackingRunComponent
from api.models.data.customers import Customer
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.packing import PackingRunOutput
from api.models.data.products import Product
from api.models.data.raw_material_process import RawMaterialProcess, RawMaterialProcessItem
from api.models.data.raw_materials import RawMaterial, RawMaterialPurchase, RawMaterialPurchaseItem, RawMaterialStock
from api.models.data.returns import Return, ReturnItems
from api.models.data.sales import Sales, SalesItems
from api.models.data.stock import Stock
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.stock_bottle_damage import StockBottleDamage
from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.models.data.storage_tank_leak import StorageTankLeak
from api.models.data.vendors import Vendor
from api.services.reporting.contracts import ReportScope
from api.services.reporting.inventory_movement_review import inventory_movement_review
from api.tests.accounting.helpers import create_staff_user


class InventoryMovementReviewV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='inventoryreview', email='inventoryreview@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.vendor = Vendor.objects.create(name='Inventory source vendor')
        self.material = RawMaterial.objects.create(name='Inventory source chemical', material_type='chemistry', unit='kg')
        self.product = Product.objects.create(name='Inventory review product')
        self.tank = StorageTank.objects.create(name='Inventory review tank', capacity_liters=1000)
        self.stock = Stock.objects.create(product=self.product, piece_amount=0, buy_price=0, currency=1)

    def make_events(self):
        purchase = RawMaterialPurchase.objects.create(vendor=self.vendor, currency=1, status='received', purchase_date=timezone.now())
        RawMaterialPurchaseItem.objects.create(purchase=purchase, raw_material=self.material, quantity=Decimal('10'),
                                               price_per_unit=Decimal('4'))
        process = RawMaterialProcess.objects.create(product_name='Inventory review liquid', product=self.product,
            status='moved_to_storage', process_date=timezone.now(), output_quantity_liters=Decimal('10'),
            output_quantity_kg=Decimal('10'), material_cost_afn=Decimal('40'), total_cost_afn=Decimal('40'),
            cost_per_liter_afn=Decimal('4'))
        RawMaterialProcessItem.objects.create(process=process, raw_material=self.material, quantity=Decimal('10'), material_cost_afn=Decimal('40'))
        ProductionStorageTransfer.objects.create(production=process, storage_tank=self.tank,
                                                 quantity_liters=Decimal('10'), quantity_kg=Decimal('10'))
        PackingRun.objects.create(storage_tank=self.tank, product=self.product, finished_stock=self.stock,
            quantity_liters=Decimal('10'), quantity_kg=Decimal('10'), bottle_volume_liters=Decimal('1'), bottle_count=Decimal('10'),
            liquid_cost_afn=Decimal('40'), packaging_cost_afn=Decimal('5'), total_cost_afn=Decimal('45'), cost_per_bottle_afn=Decimal('4.5'))

    def test_four_connected_inventory_movement_sources_are_visible(self):
        self.make_events()
        report = inventory_movement_review(ReportScope())
        self.assertEqual({row['movement'] for row in report['events']}, {
            'raw_purchase_receipt', 'production_input', 'production_to_tank', 'tank_to_packing', 'packing_to_finished_stock',
        })
        received = next(row for row in report['events'] if row['movement'] == 'raw_purchase_receipt')
        self.assertEqual((received['quantity'], received['value_afn']), ('10.0000', '40.0000'))
        transfer = next(row for row in report['events'] if row['movement'] == 'production_to_tank')
        self.assertIn('transfer_effective_date_not_recorded', transfer['issues'])

    def test_endpoint_paginates_events_but_preserves_summaries(self):
        self.make_events()
        response = self.client.get('/api/reports/v2/inventory-movement-review/', {'page_size': 2})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 5)
        self.assertEqual(len(response.data['results']), 2)
        self.assertTrue(response.data['summaries'])

    def test_currency_and_gl_filters_are_rejected(self):
        self.assertEqual(self.client.get('/api/reports/v2/inventory-movement-review/', {'currency': 1}).status_code, 400)
        self.assertEqual(self.client.get('/api/reports/v2/inventory-movement-review/', {'account_id': 1}).status_code, 400)

    def test_sale_and_return_use_inventory_cost_and_physical_units(self):
        now = timezone.now()
        customer = Customer.objects.create(name='Movement customer')
        raw_stock = RawMaterialStock.objects.create(raw_material=self.material, quantity=20, last_purchase_price=2)
        sale = Sales.objects.bulk_create([Sales(customer=customer, invoice_number='MOV-SALE-1', currency=1,
            status='confirmed', sale_date=now, total_amount=900)])[0]
        items = SalesItems.objects.bulk_create([
            SalesItems(sales=sale, sale_source='raw_material', raw_material_stock=raw_stock, unit='kg',
                       quantity=5, kilogram_amount=5, sell_price=20, unit_cost=2, cost_is_known=True),
            SalesItems(sales=sale, sale_source='tank', storage_tank=self.tank, unit='liter',
                       quantity=3, liter_amount=3, sell_price=30, unit_cost=4, cost_is_known=True),
            SalesItems(sales=sale, sale_source='stock', stock=self.stock, unit='piece',
                       quantity=2, liter_amount=2, sell_price=40, unit_cost=5, cost_is_known=True),
        ])
        returned = Return.objects.bulk_create([Return(sales=sale, return_number='MOV-RETURN-1', currency=1,
                                                      return_date=now, total_amount=50)])[0]
        ReturnItems.objects.bulk_create([
            ReturnItems(return_order=returned, sales_item=items[0], quantity_kg=2, return_price=20, return_amount=40),
            ReturnItems(return_order=returned, sales_item=items[1], liter_amount=1, return_price=30, return_amount=30),
            ReturnItems(return_order=returned, sales_item=items[2], liter_amount=1, return_price=40, return_amount=40),
        ])
        events = inventory_movement_review(ReportScope())['events']
        sale_rows = {row['item_type']: row for row in events if row['movement'] == 'sale_inventory_out'}
        return_rows = {row['item_type']: row for row in events if row['movement'] == 'sale_inventory_return'}
        self.assertEqual([(sale_rows[k]['quantity'], sale_rows[k]['value_afn']) for k in ('raw_material', 'storage_tank', 'stock')],
                         [('5.0000', '10.0000'), ('3.0000', '12.0000'), ('2.0000', '10.0000')])
        self.assertEqual([(return_rows[k]['quantity'], return_rows[k]['value_afn']) for k in ('raw_material', 'storage_tank', 'stock')],
                         [('2.0000', '4.0000'), ('1.0000', '4.0000'), ('1.0000', '5.0000')])

    def test_damage_salvage_and_leak_are_single_physical_events(self):
        now = timezone.now()
        StockBottleDamage.objects.bulk_create([StockBottleDamage(stock=self.stock, product=self.product,
            storage_tank=self.tank, bottle_count=2, recorded_at=now, remaining_liquid_liters=1,
            returned_liquid_cost_afn=4, bottle_sources=[{'bottle_count': 2, 'unit_cost_afn': '5'}])])
        StorageTankLeak.objects.bulk_create([StorageTankLeak(storage_tank=self.tank, quantity_kg=1,
            quantity_liters=1, total_cost_afn=4, recorded_at=now)])
        report = inventory_movement_review(ReportScope())
        rows = {row['movement']: row for row in report['events']}
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows['bottle_damage']['value_afn'], '10.0000')
        self.assertEqual(rows['liquid_salvage_to_tank']['value_afn'], '4.0000')
        self.assertEqual(rows['tank_leak']['value_afn'], '4.0000')

    def test_packing_outputs_replace_fallback_to_avoid_double_value(self):
        self.make_events()
        run = PackingRun.objects.get()
        batch = InventoryBatch.objects.bulk_create([InventoryBatch(batch_number='MOV-BATCH-1', product=self.product,
                                                                   pieces_received=10, remaining_pieces=10)])[0]
        PackingRunOutput.objects.bulk_create([PackingRunOutput(packing_run=run, component_type='bottle',
            stock=self.stock, inventory_batch=batch, quantity_pieces=10, total_cost_afn=45, unit_cost_afn=4.5)])
        rows = [row for row in inventory_movement_review(ReportScope())['events']
                if row['movement'] == 'packing_to_finished_stock']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['event_model'], 'packingrunoutput')
        self.assertEqual(rows[0]['value_afn'], '45.0000')

    def test_unknown_sale_cost_is_null_and_deleted_sale_is_excluded(self):
        now = timezone.now()
        customer = Customer.objects.create(name='Unknown cost customer')
        sale = Sales.objects.bulk_create([Sales(customer=customer, invoice_number='MOV-SALE-UNKNOWN',
            currency=1, status='confirmed', sale_date=now, total_amount=100)])[0]
        SalesItems.objects.bulk_create([SalesItems(sales=sale, sale_source='stock', stock=self.stock,
            unit='piece', quantity=2, liter_amount=2, sell_price=50, unit_cost=0, cost_is_known=False)])
        report = inventory_movement_review(ReportScope())
        movement = next(row for row in report['events'] if row['movement'] == 'sale_inventory_out')
        self.assertIsNone(movement['value_afn'])
        self.assertIn('historical_sale_cost_unknown', movement['issues'])
        self.assertEqual(report['summaries'][0]['unknown_value_count'], 1)
        Sales.objects.filter(pk=sale.pk).update(deleted_at=now)
        self.assertEqual(inventory_movement_review(ReportScope())['events'], [])

    def test_unknown_outflow_keeps_only_that_direction_total_null(self):
        now = timezone.now()
        customer = Customer.objects.create(name='Mixed cost customer')
        sale = Sales.objects.bulk_create([Sales(customer=customer, invoice_number='MOV-MIXED-COST',
            currency=1, status='confirmed', sale_date=now, total_amount=100)])[0]
        known, _ = SalesItems.objects.bulk_create([
            SalesItems(sales=sale, sale_source='stock', stock=self.stock, unit='piece',
                quantity=2, liter_amount=2, sell_price=20, unit_cost=5, cost_is_known=True),
            SalesItems(sales=sale, sale_source='stock', stock=self.stock, unit='piece',
                quantity=3, liter_amount=3, sell_price=20, unit_cost=0, cost_is_known=False),
        ])
        returned = Return.objects.bulk_create([Return(sales=sale, return_number='MOV-MIXED-RETURN',
            currency=1, return_date=now)])[0]
        ReturnItems.objects.bulk_create([ReturnItems(return_order=returned, sales_item=known,
            liter_amount=1, batch_returns=[{'quantity': '1', 'unit_cost_afn': '5'}])])
        summary = inventory_movement_review(ReportScope())['summaries'][0]
        self.assertEqual((summary['quantity_out'], summary['value_out_afn'],
                          summary['unknown_value_out_count']), ('5.0000', None, 1))
        self.assertEqual((summary['quantity_in'], summary['value_in_afn'],
                          summary['unknown_value_in_count']), ('1.0000', '5.0000', 0))
        self.assertEqual(summary['unknown_value_count'], 1)

    def test_packing_components_preserve_kg_allocation_and_piece_only_legacy(self):
        self.make_events()
        run = PackingRun.objects.get()
        kg_stock = RawMaterialStock.objects.create(raw_material=self.material, quantity=5, piece_count=10)
        piece_material = RawMaterial.objects.create(name='Review caps', material_type='cap', unit='piece')
        piece_stock = RawMaterialStock.objects.create(raw_material=piece_material, quantity=20)
        PackingRunComponent.objects.bulk_create([
            PackingRunComponent(packing_run=run, component_type='bottle', raw_material_stock=kg_stock,
                quantity_pieces=4, unit_cost_afn=2, total_cost_afn=8,
                inventory_allocations=[{'quantity': '2', 'piece_count': 4}]),
            PackingRunComponent(packing_run=run, component_type='cap', raw_material_stock=piece_stock,
                quantity_pieces=4, unit_cost_afn=1, total_cost_afn=4),
        ])
        rows = [row for row in inventory_movement_review(ReportScope())['events']
                if row['movement'] == 'packing_component_consumption']
        self.assertEqual([(row['unit'], row['quantity'], row['value_afn']) for row in rows],
                         [('kg', '2.0000', '8.0000'), ('piece', '4.0000', '4.0000')])
        PackingRunComponent.objects.filter(component_type='bottle').update(inventory_allocations=[])
        legacy = next(row for row in inventory_movement_review(ReportScope())['events']
                      if row['movement'] == 'packing_component_consumption' and row['item_id'] == self.material.pk)
        self.assertEqual((legacy['unit'], legacy['quantity']), ('piece', '4.0000'))
        self.assertIn('historical_component_weight_unknown', legacy['issues'])

    def test_stock_adjustment_uses_signed_delta_and_saved_cost(self):
        now = timezone.now()
        batch = InventoryBatch.objects.bulk_create([InventoryBatch(batch_number='MOV-ADJ', product=self.product,
            pieces_received=10, remaining_pieces=10, unit_cost=5)])[0]
        StockAdjustment.objects.bulk_create([
            StockAdjustment(inventory_batch=batch, adjustment_type='manual_correction', quantity_before=10,
                quantity_after=7, quantity_change=-3, unit_cost=5, adjustment_date=now),
            StockAdjustment(inventory_batch=batch, adjustment_type='returned', quantity_before=7,
                quantity_after=9, quantity_change=2, unit_cost=5, adjustment_date=now),
            StockAdjustment(inventory_batch=batch, adjustment_type='transfer', quantity_before=9,
                quantity_after=8, quantity_change=-1, unit_cost=5, adjustment_date=now),
        ])
        report = inventory_movement_review(ReportScope())
        rows = [row for row in report['events'] if row['movement'] == 'stock_adjustment']
        self.assertEqual([(row['direction'], row['quantity'], row['value_afn']) for row in rows],
                         [('out', '3.0000', '15.0000'), ('in', '2.0000', '10.0000')])
        self.assertEqual(rows[0]['item_id'], self.stock.pk)
        self.assertEqual(report['summaries'][0]['quantity_out'], '3.0000')
