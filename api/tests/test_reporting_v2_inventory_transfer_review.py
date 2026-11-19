from datetime import datetime, timedelta, timezone as dt_timezone

from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.products import Product
from api.models.data.stock import Stock
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.stock_transfer import StockTransfer
from api.services.reporting.contracts import ReportScope
from api.services.reporting.inventory_movement_review import inventory_movement_review
from api.services.reporting.inventory_transfer_review import inventory_transfer_review
from api.tests.accounting.helpers import create_staff_user


class InventoryTransferReviewV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='inventorytransferreview', email='inventorytransferreview@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.when = datetime(2026, 8, 1, 12, tzinfo=dt_timezone.utc)
        self.product = Product.objects.create(name='Transfer review product')
        self.source = Stock.objects.create(product=self.product, condition='good', piece_amount=0, buy_price=0, currency=1)
        self.target = Stock.objects.create(product=self.product, condition='damaged', piece_amount=0, buy_price=0, currency=1)

    def transfer(self, *, source=None, target=None, currency=1, value=20, when=None):
        return StockTransfer.objects.bulk_create([StockTransfer(
            transfer_number=f'TRANSFER-REV-{StockTransfer.objects.count() + 1}',
            product=self.product, target_product=self.product, condition='good',
            piece_amount=2, unit_cost=10, currency=currency, total_value=value,
            source_stock=source if source is not None else self.source,
            target_stock=target if target is not None else self.target,
            transfer_date=when or self.when)])[0]

    def test_distinct_transfer_has_two_equal_legs_and_zero_net(self):
        transfer = self.transfer()
        report = inventory_movement_review(ReportScope())
        events = [event for event in report['events'] if event['event_model'] == 'stocktransfer']
        self.assertEqual([(event['direction'], event['item_id'], event['value_afn']) for event in events],
                         [('out', self.source.pk, '20.0000'), ('in', self.target.pk, '20.0000')])
        row = inventory_transfer_review(ReportScope())['rows'][0]
        self.assertEqual(row['source_id'], transfer.pk)
        self.assertEqual(row['net_change_afn'], '0.0000')
        self.assertEqual(row['issues'], [])

    def test_same_stock_and_foreign_value_are_flagged(self):
        self.transfer(target=self.source, currency=2)
        events = [event for event in inventory_movement_review(ReportScope())['events']
                  if event['event_model'] == 'stocktransfer']
        self.assertEqual(len(events), 2)
        self.assertTrue(all(event['value_afn'] is None for event in events))
        self.assertTrue(all('transfer_locations_not_distinct' in event['issues'] for event in events))
        row = inventory_transfer_review(ReportScope())['rows'][0]
        self.assertIsNone(row['net_change_afn'])
        self.assertIn('historical_transfer_cost_unknown', row['issues'])

    def test_missing_endpoint_and_transfer_adjustment_do_not_create_partial_legs(self):
        transfer = self.transfer()
        StockTransfer.objects.filter(pk=transfer.pk).update(target_stock=None)
        batch = InventoryBatch.objects.bulk_create([InventoryBatch(
            batch_number='TRANS-REV-BATCH', product=self.product, pieces_received=10,
            remaining_pieces=10, unit_cost=5)])[0]
        adjustment = StockAdjustment.objects.bulk_create([StockAdjustment(
            inventory_batch=batch, adjustment_type='transfer', quantity_before=10,
            quantity_after=8, quantity_change=-2, unit_cost=5, adjustment_date=self.when)])[0]
        self.assertEqual(inventory_movement_review(ReportScope())['events'], [])
        rows = {row['source_model']: row for row in inventory_transfer_review(ReportScope())['rows']}
        self.assertFalse(rows['stocktransfer']['paired_movement'])
        self.assertIn('transfer_endpoint_missing', rows['stocktransfer']['issues'])
        self.assertEqual(rows['stockadjustment']['source_id'], adjustment.pk)
        self.assertIn('transfer_adjustment_destination_not_recorded', rows['stockadjustment']['issues'])

    def test_cutoff_and_unsupported_filters(self):
        self.transfer(when=self.when + timedelta(days=3))
        url = '/api/reports/v2/inventory-transfer-review/'
        response = self.client.get(url, {'end_date': '2026-08-01'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['rows'], [])
        for param in ('start_date', 'currency', 'account_id'):
            self.assertEqual(self.client.get(url, {param: 1}).status_code, 400)
