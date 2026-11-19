from datetime import timedelta
from decimal import Decimal
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.utils import timezone


class ReturnedPoolMigrationTests(TransactionTestCase):
    def test_existing_returns_merge_without_losing_dates_balances_or_packing_links(self):
        before = [('api', '0015_packingreturn_bottle_volume_liters_and_more')]
        after = [('api', '0016_packingreturnevent_packingreturn_first_returned_at_and_more')]
        executor = MigrationExecutor(connection)
        executor.migrate(before)
        try:
            apps = executor.loader.project_state(before).apps
            Product = apps.get_model('api', 'Product')
            Stock = apps.get_model('api', 'Stock')
            Pool = apps.get_model('api', 'PackingReturn')
            Run = apps.get_model('api', 'PackingRun')
            product = Product.objects.create(name='Merged return bottle')
            stock = Stock.objects.create(product=product)
            early = timezone.now() - timedelta(days=2)
            late = timezone.now() - timedelta(days=1)
            first = Pool.objects.create(stock=stock, bottle_count=6, remaining_bottle_count=2,
                inventory_moved=True, unit_cost_afn=10, packaging_cost_afn=0)
            second = Pool.objects.create(stock=stock, bottle_count=4, remaining_bottle_count=2,
                inventory_moved=True, unit_cost_afn=20, packaging_cost_afn=0)
            Pool.objects.filter(pk=first.pk).update(created_at=early)
            Pool.objects.filter(pk=second.pk).update(created_at=late)
            run = Run.objects.create(packing_number='MERGE-1', packing_return=second,
                quantity_liters=2, quantity_kg=2, bottle_volume_liters=1, bottle_count=2,
                liquid_cost_afn=0, packaging_cost_afn=0, returned_cost_afn=40,
                total_cost_afn=40, cost_per_bottle_afn=20)
            executor = MigrationExecutor(connection)
            executor.migrate(after)
            apps = executor.loader.project_state(after).apps
            Pool = apps.get_model('api', 'PackingReturn')
            Event = apps.get_model('api', 'PackingReturnEvent')
            Run = apps.get_model('api', 'PackingRun')
            self.assertEqual(Pool.objects.filter(stock_id=stock.pk).count(), 1)
            merged = Pool.objects.get(stock_id=stock.pk)
            self.assertEqual(merged.bottle_count, 10)
            self.assertEqual(merged.remaining_bottle_count, 4)
            self.assertEqual(merged.unit_cost_afn, Decimal('15'))
            self.assertEqual(merged.first_returned_at, early)
            self.assertEqual(merged.last_returned_at, late)
            self.assertEqual(Event.objects.filter(packing_return=merged).count(), 2)
            self.assertEqual(set(Event.objects.values_list('returned_at', flat=True)), {early, late})
            self.assertEqual(Run.objects.get(pk=run.pk).packing_return_id, merged.pk)
            self.assertEqual(Run.objects.get(pk=run.pk).returned_bottle_count, 2)
        finally:
            latest = MigrationExecutor(connection)
            latest.migrate(latest.loader.graph.leaf_nodes())
