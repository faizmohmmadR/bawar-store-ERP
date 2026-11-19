from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from api.management.commands.repair_deleted_stock_summaries import review_deleted_stock_summaries
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.products import Product
from api.models.data.stock import Stock


class RepairDeletedStockSummariesTests(TestCase):
    def setUp(self):
        product = Product.objects.create(name='Repair stock product')
        self.stock = Stock.objects.create(product=product, condition='good',
                                          piece_amount=3, buy_price=5, currency=1)
        InventoryBatch.objects.bulk_create([InventoryBatch(batch_number='REPAIR-STOCK-1',
            product=product, condition='good', pieces_received=3, remaining_pieces=3,
            unit_cost=5, currency=1)])
        Stock.all_objects.filter(pk=self.stock.pk).update(deleted_at=timezone.now())

    def test_dry_run_is_read_only_and_apply_is_idempotent(self):
        rows = review_deleted_stock_summaries()
        self.assertEqual(rows[0]['stock_id'], self.stock.pk)
        self.assertTrue(rows[0]['eligible'])
        self.assertFalse(rows[0]['restored'])
        self.assertIsNotNone(Stock.all_objects.get(pk=self.stock.pk).deleted_at)
        self.assertTrue(review_deleted_stock_summaries(apply=True)[0]['restored'])
        self.assertIsNone(Stock.all_objects.get(pk=self.stock.pk).deleted_at)
        self.assertEqual(review_deleted_stock_summaries(apply=True), [])

    def test_mismatched_quantity_is_not_restored(self):
        Stock.all_objects.filter(pk=self.stock.pk).update(piece_amount=Decimal('4'))
        row = review_deleted_stock_summaries(apply=True)[0]
        self.assertIn('quantity_mismatch', row['issues'])
        self.assertFalse(row['restored'])
        self.assertIsNotNone(Stock.all_objects.get(pk=self.stock.pk).deleted_at)
