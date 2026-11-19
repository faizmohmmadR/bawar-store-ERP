from datetime import datetime, timedelta, timezone as dt_timezone

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.journal import GLAccount, JournalEntry, JournalLine
from api.models.data.products import Product
from api.models.data.stock import Stock
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.stock_bottle_damage import StockBottleDamage
from api.models.data.storage_tank import StorageTank
from api.models.data.storage_tank_leak import StorageTankLeak
from api.services.reporting.contracts import ReportScope
from api.services.reporting.inventory_waste_bridge import inventory_waste_bridge
from api.tests.accounting.helpers import create_staff_user


class InventoryWasteBridgeV2Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = create_staff_user(username='wasteinventorybridge', email='wasteinventorybridge@example.com', as_admin=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.when = datetime(2026, 8, 1, 12, tzinfo=dt_timezone.utc)
        self.product = Product.objects.create(name='Waste Bridge Product')
        self.stock = Stock.objects.create(product=self.product, piece_amount=0, buy_price=0, currency=1)
        self.tank = StorageTank.objects.create(name='Waste Bridge Tank', capacity_liters=1000)

    def journal(self, source, *, debit=0, credit=0, when=None):
        entry = JournalEntry.objects.create(entry_date=when or self.when,
            content_type=ContentType.objects.get_for_model(source), object_id=source.pk)
        inventory, _ = GLAccount.objects.get_or_create(code='1100', currency=1,
            defaults={'name': 'Inventory', 'category': 'asset'})
        JournalLine.objects.bulk_create([JournalLine(journal_entry=entry, gl_account=inventory,
            currency=1, debit=debit, credit=credit, base_debit=debit, base_credit=credit, exchange_rate=1)])
        return entry

    def damage(self, *, sources=None, when=None):
        return StockBottleDamage.objects.bulk_create([StockBottleDamage(
            stock=self.stock, product=self.product, storage_tank=self.tank, bottle_count=2,
            remaining_liquid_liters=1, returned_liquid_cost_afn=4,
            bottle_sources=sources if sources is not None else [{'bottle_count': 2, 'unit_cost_afn': '5'}],
            recorded_at=when or self.when)])[0]

    def leak(self, *, when=None):
        return StorageTankLeak.objects.bulk_create([StorageTankLeak(storage_tank=self.tank,
            quantity_kg=1, quantity_liters=1, total_cost_afn=4, recorded_at=when or self.when)])[0]

    def adjustment(self, *, currency=1, change=-2, when=None):
        batch = InventoryBatch.objects.bulk_create([InventoryBatch(
            batch_number=f'WASTE-BATCH-{InventoryBatch.objects.count() + 1}', product=self.product,
            pieces_received=10, remaining_pieces=10, unit_cost=5, currency=currency)])[0]
        return StockAdjustment.objects.bulk_create([StockAdjustment(inventory_batch=batch,
            adjustment_type='manual_correction', quantity_before=10, quantity_after=10 + change,
            quantity_change=change, unit_cost=5, adjustment_date=when or self.when)])[0]

    def test_damage_salvage_and_leak_match_net_inventory_reduction(self):
        damage = self.damage()
        leak = self.leak()
        self.journal(damage, credit=6)
        self.journal(leak, credit=4)
        rows = {row['source_model']: row for row in inventory_waste_bridge(ReportScope())['rows']}
        damaged = rows['stockbottledamage']
        self.assertEqual((damaged['gross_out_afn'], damaged['salvage_in_afn'],
                          damaged['expected_inventory_change_afn'], damaged['inventory_gl_change_afn'],
                          damaged['difference_afn']), ('10.0000', '4.0000', '-6.0000', '-6.00', '0.00'))
        self.assertEqual(damaged['event_count'], 2)
        self.assertEqual(rows['storagetankleak']['expected_inventory_change_afn'], '-4.0000')
        self.assertEqual(rows['storagetankleak']['difference_afn'], '0.00')

    def test_adjustment_gain_and_loss_use_signed_inventory_change(self):
        loss = self.adjustment(change=-2)
        gain = self.adjustment(change=3)
        self.journal(loss, credit=10)
        self.journal(gain, debit=15)
        rows = {row['source_id']: row for row in inventory_waste_bridge(ReportScope())['rows']}
        self.assertEqual(rows[loss.pk]['expected_inventory_change_afn'], '-10.0000')
        self.assertEqual(rows[gain.pk]['expected_inventory_change_afn'], '15.0000')
        self.assertEqual(rows[loss.pk]['difference_afn'], '0.00')
        self.assertEqual(rows[gain.pk]['difference_afn'], '0.00')

    def test_unknown_cost_and_foreign_batch_do_not_claim_afn_value(self):
        damage = self.damage(sources=[{'bottle_count': 1, 'unit_cost_afn': '5'}])
        foreign = self.adjustment(currency=2)
        self.journal(damage, credit=6)
        self.journal(foreign, credit=10)
        rows = {row['source_model']: row for row in inventory_waste_bridge(ReportScope())['rows']}
        self.assertIsNone(rows['stockbottledamage']['expected_inventory_change_afn'])
        self.assertIsNone(rows['stockbottledamage']['difference_afn'])
        self.assertEqual(rows['stockbottledamage']['unknown_event_count'], 1)
        self.assertIsNone(rows['stockadjustment']['expected_inventory_change_afn'])
        self.assertIn('historical_adjustment_fx_value_unknown', rows['stockadjustment']['issues'])

    def test_missing_posting_orphan_and_cutoff_filters(self):
        damage = self.damage()
        orphan = self.adjustment(change=0)
        journal = self.journal(orphan, credit=5)
        later = self.leak(when=self.when + timedelta(days=2))
        self.journal(later, credit=4, when=self.when + timedelta(days=2))
        report = inventory_waste_bridge(ReportScope(end_date=self.when))
        self.assertEqual(len(report['rows']), 1)
        self.assertEqual(report['rows'][0]['source_id'], damage.pk)
        self.assertIn('missing_inventory_posting', report['rows'][0]['issues'])
        self.assertEqual(report['orphan_journal_ids'], [journal.pk])
        self.assertEqual(report['orphan_inventory_line_count'], 1)
        url = '/api/reports/v2/inventory-waste-bridge/'
        self.assertEqual(self.client.get(url, {'end_date': self.when.date().isoformat()}).status_code, 200)
        for param in ('start_date', 'currency', 'account_id'):
            self.assertEqual(self.client.get(url, {param: 1}).status_code, 400)
