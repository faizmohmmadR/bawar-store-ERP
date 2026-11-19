from decimal import Decimal
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from api.models.data.raw_materials import RawMaterial, RawMaterialStock, RawMaterialPurchase, RawMaterialPurchaseItem, RawMaterialCategory
from api.models.data.raw_material_process import RawMaterialProcess
from api.models.data.vendors import Vendor
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.sales import Sales, SalesItems
from api.models.data.customers import Customer
from api.services.raw_material_stock import reconcile_raw_material_stock
from api.services.raw_material_process import consume_raw_materials_for_process, release_raw_materials_for_process
from api.services.packing import _consume_raw_material_component
from api.services.material_finished_stock import add_material_stock
from api.services.stock_valuation import stock_valuation
from api.services.fefo_allocation import allocate_inventory_for_sale_item, revert_sale_item_allocations, restore_pieces_to_sale_batches

class MovingAverageTests(TestCase):
    def setUp(self):
        self.vendor=Vendor.objects.create(name='Moving average supplier')
        self.material=RawMaterial.objects.create(name='Average ingredient',unit='kg')

    def receive(self, quantity, price, material=None, pieces=0):
        purchase=RawMaterialPurchase.objects.create(vendor=self.vendor,status='received',currency=1)
        item=RawMaterialPurchaseItem.objects.create(purchase=purchase,raw_material=material or self.material,quantity=quantity,price_per_unit=price,piece_count=pieces)
        reconcile_raw_material_stock(purchase,previous_status='draft',previous_items=[],save_stock=True)
        return item

    def process(self, quantity):
        process=RawMaterialProcess.objects.create(product_name='Average mix',output_quantity_liters=1,extra_expense=0,expense_currency=1)
        consume_raw_materials_for_process(process,[{'raw_material':self.material.pk,'quantity':quantity,'piece_count':0}])
        return process

    def test_receipts_weight_remaining_stock_not_lifetime_purchases(self):
        self.receive(100,10)
        process=self.process(80)
        self.assertEqual(process.material_cost_afn,Decimal('800'))
        self.receive(20,30)
        stock=RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity,40)
        self.assertEqual(stock.last_purchase_price,20)
        # Lifetime average would be 13.333333; the current-stock average is 20.
        next_process=self.process(10)
        self.assertEqual(next_process.material_cost_afn,200)
        self.assertEqual(next_process.items.get().purchase_sources[0]['costing_method'],'moving_weighted_average')

    def test_opening_stock_is_included_in_new_receipt(self):
        RawMaterialStock.objects.create(raw_material=self.material,quantity=10,last_purchase_price=50)
        self.receive(10,10)
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).last_purchase_price,30)

    def test_replenishment_after_empty_stock_uses_new_price(self):
        self.receive(10,50); self.process(10); self.receive(5,20)
        self.assertEqual(RawMaterialStock.objects.get(raw_material=self.material).last_purchase_price,20)

    def test_process_reversal_blends_original_cost_with_new_receipt(self):
        self.receive(10,10); process=self.process(8); self.receive(2,30)
        release_raw_materials_for_process(process)
        stock=RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity,12)
        self.assertEqual(stock.last_purchase_price,Decimal('13.333333'))

    def test_price_only_receipt_edit_uses_prior_value_snapshot(self):
        item=self.receive(10,10)
        previous=[(item.raw_material_id,item.quantity,item.piece_count,item.quantity*item.price_per_unit_base)]
        item.price_per_unit=20;item.save()
        reconcile_raw_material_stock(item.purchase,previous_status='received',previous_items=previous,save_stock=True)
        stock=RawMaterialStock.objects.get(raw_material=self.material)
        self.assertEqual(stock.quantity,10);self.assertEqual(stock.last_purchase_price,20)

    def test_packing_consumes_average_even_with_legacy_purchase_selector(self):
        material=RawMaterial.objects.create(name='Average cap',material_type='cap',unit='piece')
        item=self.receive(10,2,material);self.receive(10,6,material)
        stock=RawMaterialStock.objects.get(raw_material=material)
        unit,total,allocations=_consume_raw_material_component(stock,5,item.pk)
        self.assertEqual(unit,4);self.assertEqual(total,20)
        self.assertEqual(stock.quantity,15)

    def test_kg_packaging_reduces_both_weight_and_package_count(self):
        material=RawMaterial.objects.create(name='Average kg cap',material_type='cap',unit='kg')
        self.receive(10,20,material,pieces=100);self.receive(20,50,material,pieces=200)
        stock=RawMaterialStock.objects.get(raw_material=material)
        unit,total,allocations=_consume_raw_material_component(stock,30,None)
        self.assertEqual(unit,4);self.assertEqual(total,120)
        self.assertEqual(stock.quantity,27);self.assertEqual(stock.piece_count,270)
        self.assertEqual(Decimal(allocations[0]['quantity']),3)

    def packed(self):
        material=RawMaterial.objects.create(name='Average bottle',material_type='bottle',unit='piece',category=RawMaterialCategory.objects.get(name='A'),capacity_liters=1)
        stock,first,_=add_material_stock(material=material,quantity=10,total_cost=100,packing=True)
        stock,second,_=add_material_stock(material=material,quantity=10,total_cost=300,packing=True)
        return material,stock,first,second

    def sale(self,stock,quantity):
        customer=Customer.objects.create(name='Average buyer')
        sale=Sales.objects.create(customer=customer,currency=1,total_amount=1000,status='draft')
        item=SalesItems.objects.create(sales=sale,stock=stock,unit='piece',quantity=quantity,sell_price=100,unit_cost=999)
        allocate_inventory_for_sale_item(item,Decimal(quantity))
        item.refresh_from_db();return item

    def test_finished_batches_share_average_and_preserve_receipt_history(self):
        material,stock,first,second=self.packed()
        first.refresh_from_db();second.refresh_from_db()
        self.assertEqual(first.unit_cost,20);self.assertEqual(second.unit_cost,20)
        self.assertEqual(first.receipt_unit_cost,10);self.assertEqual(second.receipt_unit_cost,30)
        self.assertEqual(stock_valuation(stock)['value'],400)

    def test_sales_use_average_and_outflow_does_not_change_remaining_average(self):
        material,stock,first,second=self.packed();item=self.sale(stock,5)
        stock.refresh_from_db()
        self.assertEqual(item.unit_cost,20);self.assertEqual(stock.buy_price,20);self.assertEqual(stock.piece_amount,15)

    def test_future_receipt_does_not_rewrite_old_sale_cost(self):
        material,stock,first,second=self.packed();item=self.sale(stock,5)
        add_material_stock(material=material,quantity=5,total_cost=200,packing=True)
        item.refresh_from_db();stock.refresh_from_db()
        self.assertEqual(stock.buy_price,25);self.assertEqual(item.unit_cost,20)
        self.assertEqual(item.batch_allocations.get().unit_cost,20)

    def test_sale_reversal_returns_at_snapshot_price_after_new_receipt(self):
        material,stock,first,second=self.packed();item=self.sale(stock,5)
        add_material_stock(material=material,quantity=5,total_cost=200,packing=True)
        revert_sale_item_allocations(item);stock.refresh_from_db()
        self.assertEqual(stock.piece_amount,25);self.assertEqual(stock.buy_price,24)
        self.assertEqual(stock_valuation(stock)['value'],600)

    def test_sales_return_blends_saved_issue_cost_into_current_pool(self):
        material,stock,first,second=self.packed();item=self.sale(stock,5)
        add_material_stock(material=material,quantity=5,total_cost=200,packing=True)
        restore_pieces_to_sale_batches(item,Decimal('5'));stock.refresh_from_db()
        self.assertEqual(stock.buy_price,24)

    def test_untouched_batch_update_does_not_restore_stale_price(self):
        material,stock,first,second=self.packed()
        first.notes='Expiry trace remains editable';first.save()
        first.refresh_from_db();self.assertEqual(first.unit_cost,20)

    def test_fractional_average_does_not_drift_after_outflow(self):
        from api.services.stock_write_off import write_off_stock
        material=RawMaterial.objects.create(name='Fractional bottle',material_type='bottle',unit='piece',category=RawMaterialCategory.objects.get(name='A'),capacity_liters=1)
        stock,first,_=add_material_stock(material=material,quantity=10,total_cost=100,packing=True)
        stock,second,_=add_material_stock(material=material,quantity=20,total_cost=600,packing=True)
        write_off_stock(source=stock,batch=first,piece_amount=10)
        stock.refresh_from_db()
        self.assertEqual(stock.buy_price,Decimal('23.333333'))
        self.assertEqual(stock_valuation(stock)['value'],Decimal('466.6667'))

    def test_adjustment_keeps_its_issue_snapshot_after_next_receipt(self):
        from api.services.stock_write_off import write_off_stock
        from api.models.data.stock_adjustment import StockAdjustment
        material,stock,first,second=self.packed()
        write_off_stock(source=stock,batch=first,piece_amount=2)
        adjustment=StockAdjustment.objects.get(inventory_batch=first)
        self.assertEqual(adjustment.unit_cost,20)
        add_material_stock(material=material,quantity=2,total_cost=80,packing=True)
        adjustment.refresh_from_db();self.assertEqual(adjustment.unit_cost,20)

    def test_migration_freezes_receipts_and_issues_before_pooling(self):
        from importlib import import_module
        from django.apps import apps
        from types import SimpleNamespace
        material,stock,first,second=self.packed()
        item=self.sale(stock,5)
        allocation=item.batch_allocations.get()
        InventoryBatch.objects.filter(pk=first.pk).update(unit_cost=10,receipt_unit_cost=None)
        InventoryBatch.objects.filter(pk=second.pk).update(unit_cost=30,receipt_unit_cost=None)
        type(allocation).objects.filter(pk=allocation.pk).update(unit_cost=None)
        migration=import_module('api.migrations.0011_moving_weighted_average')
        migration.initialize_pools(apps,SimpleNamespace(connection=SimpleNamespace(alias='default')))
        first.refresh_from_db();second.refresh_from_db();allocation.refresh_from_db()
        self.assertEqual(first.receipt_unit_cost,10)
        self.assertEqual(second.receipt_unit_cost,30)
        self.assertEqual(allocation.unit_cost,10)
        # Remaining stock is 5@10 + 10@30 = 350 / 15.
        self.assertEqual(first.unit_cost,Decimal('23.333333'))
        self.assertEqual(second.unit_cost,Decimal('23.333333'))

    def test_direct_batch_receipt_preserves_legacy_opening_balance(self):
        from api.models.data.stock import Stock
        from api.models.data.products import Product
        from api.serializers.data.inventory_batch import InventoryBatchSerializer
        product=Product.objects.create(name='Legacy opening bottle',bottles_per_carton=1,bottle_capacity_liters=1)
        stock=Stock.objects.create(product=product,piece_amount=10,buy_price=20,currency=1)
        serializer=InventoryBatchSerializer(data={'product':product.pk,'pieces_received':10,'remaining_pieces':10,'unit_cost':40,'currency':1})
        self.assertTrue(serializer.is_valid(),serializer.errors)
        serializer.save();stock.refresh_from_db()
        self.assertEqual(stock.piece_amount,20)
        self.assertEqual(stock.buy_price,30)

    def test_raw_sale_quantity_reduction_returns_original_issue_value(self):
        from api.services.raw_material_sales import apply_raw_material_sale_item
        self.receive(10,10)
        stock=RawMaterialStock.objects.get(raw_material=self.material)
        sale=Sales.objects.create(customer=Customer.objects.create(name='Raw average buyer'),currency=1,total_amount=1000,status='draft')
        item=SalesItems.objects.create(sales=sale,sale_source=SalesItems.SOURCE_RAW_MATERIAL,raw_material_stock=stock,unit='kg',quantity=8,sell_price=100,unit_cost=10)
        apply_raw_material_sale_item(item)
        self.receive(2,30)
        item.quantity=4;item.save()
        apply_raw_material_sale_item(item,previous_quantity=8,previous_piece_count=0)
        stock.refresh_from_db();item.refresh_from_db()
        self.assertEqual(stock.quantity,8)
        self.assertEqual(stock.last_purchase_price,15)
        self.assertEqual(item.unit_cost,10)


class PackingAveragePipelineTests(TestCase):
    def setUp(self):
        from api.tests.test_packing import PackingRunApiTests
        PackingRunApiTests.setUp(self)

    def test_repeated_production_and_packing_pool_finished_costs(self):
        from api.services.packing import create_packing_run
        first=create_packing_run(storage_tank_id=self.tank.pk,quantity_liters=8,bottle_volume_liters=1,components=self.components)
        first_output=first.outputs.get(component_type='bottle')
        self.assertEqual(first.total_cost_afn,Decimal('51.6667'))
        self.assertEqual(first_output.unit_cost_afn,Decimal('5.333338'))
        material=first.components.get(component_type='bottle').raw_material_stock.raw_material
        vendor=Vendor.objects.first()
        purchase=RawMaterialPurchase.objects.create(vendor=vendor,status='received',currency=1)
        RawMaterialPurchaseItem.objects.create(purchase=purchase,raw_material=material,quantity=100,price_per_unit=4)
        reconcile_raw_material_stock(purchase,previous_status='draft',previous_items=[],save_stock=True)
        second=create_packing_run(storage_tank_id=self.tank.pk,quantity_liters=8,bottle_volume_liters=1,components=self.components)
        second_output=second.outputs.get(component_type='bottle')
        first_output.inventory_batch.refresh_from_db();second_output.inventory_batch.refresh_from_db()
        self.assertEqual(first_output.inventory_batch.unit_cost,Decimal('5.884301'))
        self.assertEqual(second_output.inventory_batch.unit_cost,Decimal('5.884301'))
        self.assertEqual(first_output.inventory_batch.receipt_unit_cost,Decimal('5.333338'))
