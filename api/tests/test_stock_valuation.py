from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from api.models.data.customers import Customer
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.raw_materials import RawMaterial, RawMaterialCategory
from api.models.data.sales import Sales, SalesItems
from api.serializers.data.stock import StockSerializer
from api.services.fefo_allocation import allocate_inventory_for_sale_item, revert_sale_item_allocations
from api.services.material_finished_stock import add_material_stock
from api.services.stock_valuation import stock_valuation, sync_stock_valuation


class PooledStockCostTests(TestCase):
    def setUp(self):
        self.material = RawMaterial.objects.create(
            name='Shared bottle across production runs', material_type='bottle', unit='piece',
            category=RawMaterialCategory.objects.get(name='A'), capacity_liters=1,
        )
        self.stock, self.first, _ = add_material_stock(material=self.material, quantity=10, total_cost=100, packing=True, notes='Packing run A')
        self.stock, self.second, _ = add_material_stock(material=self.material, quantity=20, total_cost=600, packing=True, notes='Packing run B')

    def sale_item(self, quantity):
        customer = Customer.objects.create(name='Lot cost buyer')
        sale = Sales.objects.create(customer=customer, currency=1, total_amount=1000, status='draft')
        return SalesItems.objects.create(sales=sale, stock=self.stock, unit='piece', quantity=quantity, sell_price=100, unit_cost=999)

    def test_multiple_runs_preserve_receipt_costs_and_share_pool_average(self):
        self.assertEqual(self.stock.piece_amount, Decimal('30'))
        self.assertEqual(self.stock.buy_price, Decimal('23.333333'))
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual((self.first.unit_cost, self.second.unit_cost),
                         (Decimal('23.333333'), Decimal('23.333333')))
        self.assertEqual((self.first.receipt_unit_cost, self.second.receipt_unit_cost),
                         (Decimal('10'), Decimal('30')))
        data = StockSerializer(self.stock).data
        self.assertEqual(data['batch_count'], 2)
        self.assertEqual(data['price_layer_count'], 1)
        self.assertEqual(Decimal(data['stock_value_afn']), Decimal('700'))
        self.assertEqual(Decimal(data['on_hand_quantity']), Decimal('30'))
        self.assertEqual(Decimal(data['average_unit_cost_afn']), Decimal('23.333333'))

    def test_sale_and_reversal_keep_the_saved_issue_cost(self):
        item = self.sale_item(5)
        allocate_inventory_for_sale_item(item, Decimal('5'))
        self.stock.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(item.unit_cost, Decimal('23.333333'))
        self.assertEqual(self.stock.piece_amount, Decimal('25'))
        self.assertEqual(self.stock.buy_price, Decimal('23.333333'))
        revert_sale_item_allocations(item)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.piece_amount, Decimal('30'))
        self.assertEqual(self.stock.buy_price, Decimal('23.333333'))

    def test_sale_spanning_batches_and_new_inflow_use_remaining_pool_value(self):
        item = self.sale_item(15)
        allocate_inventory_for_sale_item(item, Decimal('15'))
        item.refresh_from_db()
        self.assertEqual(item.unit_cost, Decimal('23.333333'))
        # An edited stock-price cache must not replace the pooled batch value.
        self.stock.refresh_from_db()
        self.stock.buy_price = 999
        self.stock._skip_stock_journal = True
        self.stock.save()
        stock, _, _ = add_material_stock(material=self.material, quantity=5, total_cost=250, packing=True)
        self.assertEqual(stock.piece_amount, Decimal('20'))
        self.assertEqual(stock.buy_price, Decimal('30'))
        self.assertEqual(stock_valuation(stock)['value'], Decimal('600'))
        item.refresh_from_db()
        self.assertEqual(item.unit_cost, Decimal('23.333333'))

    def test_expired_lots_are_valued_on_hand_but_not_available(self):
        self.first.expire_date = timezone.localdate() - timedelta(days=1)
        self.first.save()
        data = StockSerializer(self.stock).data
        self.assertEqual(Decimal(data['on_hand_quantity']), Decimal('30'))
        self.assertEqual(Decimal(data['available_quantity']), Decimal('20'))
        self.assertEqual(Decimal(data['stock_value_afn']), Decimal('700'))
        self.assertEqual(Decimal(data['piece_amount']), Decimal('20'))

    def test_exhausted_lots_do_not_fall_back_to_stale_stock_quantities(self):
        InventoryBatch.objects.filter(product=self.stock.product).update(remaining_pieces=0, status='empty')
        self.stock.piece_amount = 999
        data = StockSerializer(self.stock).data
        self.assertEqual(Decimal(data['on_hand_quantity']), Decimal('0'))
        self.assertEqual(Decimal(data['stock_value_afn']), Decimal('0'))
        sync_stock_valuation(self.stock)
        self.assertEqual(self.stock.buy_price, Decimal('0'))

    def test_write_off_preserves_remaining_pool_average(self):
        from api.services.stock_write_off import write_off_stock
        write_off_stock(source=self.stock, batch=self.first, piece_amount=10, notes='Remove first lot')
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.piece_amount, Decimal('20'))
        self.assertEqual(self.stock.buy_price, Decimal('23.333333'))
        self.assertEqual(stock_valuation(self.stock)['value'], Decimal('466.6667'))

    def test_condition_move_preserves_pooled_value(self):
        from api.services.stock_condition_move import move_stock_to_condition
        target = move_stock_to_condition(source=self.stock, target_condition='damaged', piece_amount=5, batch_id=self.second.pk)
        self.stock.refresh_from_db()
        target.refresh_from_db()
        self.assertEqual(self.stock.buy_price, Decimal('23.333333'))
        self.assertEqual(target.buy_price, Decimal('23.333333'))
        self.assertEqual(stock_valuation(self.stock)['value'] + stock_valuation(target)['value'], Decimal('700'))

    def test_stock_list_filters_product_and_condition_and_exposes_cost_layers(self):
        from api.models.data.stock import Stock
        from api.views.data.stock import StockViewSet
        from rest_framework.test import APIRequestFactory
        Stock.objects.create(product=self.stock.product, condition='damaged', piece_amount=1, buy_price=99)
        class View(StockViewSet):
            permission_classes = []
        response = View.as_view({'get': 'list'})(APIRequestFactory().get('/stocks/', {'product': self.stock.product_id, 'condition': 'good'}))
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data.get('results', []) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['id'], self.stock.pk)
        self.assertEqual(rows[0]['batch_count'], 2)
        self.assertEqual({row['notes'] for row in rows[0]['batches']}, {'Packing run A', 'Packing run B'})

    def test_latest_cost_is_receipt_order_not_expiry_or_remaining_quantity(self):
        self.second.remaining_pieces = 0
        self.second.save()
        data = StockSerializer(self.stock).data
        self.assertEqual(Decimal(data['last_unit_cost_afn']), Decimal('30'))
        self.assertEqual(Decimal(data['average_unit_cost_afn']), Decimal('23.333333'))

    def test_sale_increase_merges_allocation_and_decrease_recosts(self):
        from api.services.fefo_allocation import update_sale_item_allocations
        item = self.sale_item(5)
        allocate_inventory_for_sale_item(item, 5)
        update_sale_item_allocations(item, 5, 8)
        self.assertEqual(item.batch_allocations.count(), 1)
        update_sale_item_allocations(item, 8, 15)
        item.refresh_from_db()
        self.assertEqual(item.unit_cost, Decimal('23.333333'))
        update_sale_item_allocations(item, 15, 8)
        item.refresh_from_db()
        self.assertEqual(item.unit_cost, Decimal('23.333333'))

    def test_repeated_returns_never_restore_more_than_sold(self):
        from rest_framework.exceptions import ValidationError
        from api.services.fefo_allocation import restore_pieces_to_sale_batches, consume_pieces_from_sale_batches
        item = self.sale_item(15)
        allocate_inventory_for_sale_item(item, 15)
        restore_pieces_to_sale_batches(item, 4)
        restore_pieces_to_sale_batches(item, 4)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual(self.first.remaining_pieces, Decimal('3'))
        self.assertEqual(self.second.remaining_pieces, Decimal('20'))
        with self.assertRaises(ValidationError):
            restore_pieces_to_sale_batches(item, 8)
        consume_pieces_from_sale_batches(item, 8)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.piece_amount, Decimal('15'))
        self.assertEqual(item.batch_allocations.count(), 2)

    def test_expired_history_cannot_be_resurrected_from_stock_cache(self):
        from api.services.fefo_allocation import InsufficientInventoryError
        InventoryBatch.objects.filter(product=self.stock.product).update(expire_date=timezone.localdate() - timedelta(days=1))
        item = self.sale_item(1)
        with self.assertRaises(InsufficientInventoryError):
            allocate_inventory_for_sale_item(item, 1)

    def test_sale_rejects_wrong_packaging_unit(self):
        from api.serializers.data.sales import SalesItemsSerializer
        item = self.sale_item(1)
        serializer = SalesItemsSerializer(item, data={'unit': 'carton', 'quantity': 1}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn('unit', serializer.errors)

    def test_return_trace_undo_uses_original_cost_layer(self):
        from api.models.data.returns import Return, ReturnItems
        from api.services.fefo_allocation import restore_pieces_to_sale_batches, consume_pieces_from_sale_batches
        item = self.sale_item(15)
        allocate_inventory_for_sale_item(item, 15)
        order = Return.objects.create(sales=item.sales, currency=1)
        returned = ReturnItems.objects.create(return_order=order, sales_item=item, liter_amount=4, return_price=800)
        restore_pieces_to_sale_batches(item, 4, return_item=returned)
        self.assertEqual(returned.batch_returns[0]['batch'], self.second.pk)
        self.assertEqual(Decimal(returned.batch_returns[0]['unit_cost_afn']), Decimal('23.333333'))
        consume_pieces_from_sale_batches(item, 2, return_item=returned)
        self.second.refresh_from_db()
        returned.refresh_from_db()
        self.assertEqual(self.second.remaining_pieces, Decimal('17'))
        self.assertEqual(Decimal(returned.batch_returns[0]['quantity']), Decimal('2'))

    def test_stock_edit_reduces_pooled_lots_with_manual_adjustments(self):
        from api.models.data.stock_adjustment import StockAdjustment
        serializer = StockSerializer(self.stock, data={'piece_amount': '15'}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        stock = serializer.save()
        self.assertEqual(stock.piece_amount, Decimal('15'))
        self.assertEqual(stock.buy_price, Decimal('23.333333'))
        self.assertEqual(Decimal(serializer.data['on_hand_quantity']), Decimal('15'))
        self.assertEqual(Decimal(serializer.data['stock_value_afn']), Decimal('350'))
        self.assertEqual(StockAdjustment.objects.filter(adjustment_type='manual_correction').count(), 2)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.assertEqual(self.first.unit_cost, Decimal('23.333333'))
        self.assertEqual(self.second.unit_cost, Decimal('23.333333'))
        self.assertEqual((self.first.receipt_unit_cost, self.second.receipt_unit_cost),
                         (Decimal('10'), Decimal('30')))

    def test_stock_edit_accepts_zero_and_can_add_after_empty(self):
        serializer = StockSerializer(self.stock, data={'piece_amount': '0'}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        stock = serializer.save()
        self.assertEqual(stock.piece_amount, Decimal('0'))
        self.assertEqual(Decimal(serializer.data['on_hand_quantity']), Decimal('0'))
        serializer = StockSerializer(stock, data={'piece_amount': '4', 'buy_price': '12'}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        stock = serializer.save()
        self.assertEqual(stock.piece_amount, Decimal('4'))
        self.assertEqual(stock.buy_price, Decimal('12'))

    def test_stock_edit_counts_expired_stock_and_rejects_negative(self):
        self.first.expire_date = timezone.localdate() - timedelta(days=1)
        self.first.save()
        serializer = StockSerializer(self.stock, data={'piece_amount': '25'}, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        stock = serializer.save()
        self.assertEqual(stock.piece_amount, Decimal('25'))
        self.first.refresh_from_db()
        self.assertEqual(self.first.remaining_pieces, Decimal('5'))
        invalid = StockSerializer(stock, data={'piece_amount': '-1'}, partial=True)
        self.assertFalse(invalid.is_valid())
