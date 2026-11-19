from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.exceptions import ValidationError

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.journal import JournalEntry
from api.models.data.products import Product
from api.models.data.stock import Stock
from api.models.data.stock_transfer import StockTransfer
from api.services.reporting.contracts import ReportScope
from api.services.reporting.inventory_movement_review import inventory_movement_review
from api.services.reporting.inventory_transfer_review import inventory_transfer_review
from api.services.stock_condition_move import move_stock_to_condition
from api.tests.accounting.helpers import create_staff_user


class InventoryConditionMoveV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='conditionmovev2', email='conditionmovev2@example.com', as_admin=True)

    def setUp(self):
        self.product = Product.objects.create(name='Condition move product')
        self.stock = Stock.objects.create(product=self.product, condition='good',
                                          piece_amount=10, buy_price=6, currency=1)
        self.first = InventoryBatch.objects.bulk_create([InventoryBatch(
            batch_number='CONDITION-FIRST', product=self.product, condition='good',
            pieces_received=5, remaining_pieces=5, unit_cost=5)])[0]
        self.second = InventoryBatch.objects.bulk_create([InventoryBatch(
            batch_number='CONDITION-SECOND', product=self.product, condition='good',
            pieces_received=5, remaining_pieces=5, unit_cost=7)])[0]

    def test_move_creates_document_and_two_equal_valued_legs(self):
        target = move_stock_to_condition(source=self.stock, target_condition='damaged',
                                         piece_amount=7, user=self.user)
        transfer = StockTransfer.objects.get()
        self.assertEqual((transfer.source_stock_id, transfer.target_stock_id,
                          transfer.piece_amount, transfer.total_value),
                         (self.stock.pk, target.pk, Decimal('7'), Decimal('39.00')))
        self.assertEqual(transfer.transferred_by_id, self.user.pk)
        self.assertEqual(transfer.source_batch_id, self.first.pk)
        rows = [row for row in inventory_movement_review(ReportScope())['events']
                if row['event_model'] == 'stocktransfer']
        self.assertEqual([(row['direction'], row['value_afn']) for row in rows],
                         [('out', '39.0000'), ('in', '39.0000')])
        self.assertEqual(inventory_transfer_review(ReportScope())['rows'][0]['net_change_afn'], '0.0000')
        self.assertFalse(JournalEntry.objects.filter(
            content_type=ContentType.objects.get_for_model(transfer), object_id=transfer.pk).exists())

    def test_unknown_batch_cost_creates_quantity_document_without_false_afn_value(self):
        InventoryBatch.objects.filter(pk=self.first.pk).update(currency=2)
        target = move_stock_to_condition(source=self.stock, target_condition='waste', piece_amount=2,
                                         batch_id=self.first.pk)
        transfer = StockTransfer.objects.get()
        self.assertEqual(transfer.target_stock_id, target.pk)
        self.assertEqual(transfer.total_value, Decimal('0'))
        rows = [row for row in inventory_movement_review(ReportScope())['events']
                if row['event_model'] == 'stocktransfer']
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row['value_afn'] is None for row in rows))
        self.assertIn('historical_transfer_cost_unknown',
                      inventory_transfer_review(ReportScope())['rows'][0]['issues'])

    def test_failed_move_leaves_no_transfer_document(self):
        with self.assertRaises(ValidationError):
            move_stock_to_condition(source=self.stock, target_condition='damaged', piece_amount=11)
        self.assertEqual(StockTransfer.objects.count(), 0)
        self.first.refresh_from_db()
        self.assertEqual(self.first.remaining_pieces, Decimal('5'))
