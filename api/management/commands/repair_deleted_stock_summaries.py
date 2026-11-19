"""Restore only soft-deleted stock caches independently confirmed by live lots."""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models.data.inventory_batch import InventoryBatch
from api.models.data.stock import Stock

ZERO = Decimal('0')
PRICE_TOLERANCE = Decimal('0.0001')


def review_deleted_stock_summaries(*, apply=False):
    rows = []
    with transaction.atomic():
        stocks = Stock.all_objects.select_for_update().select_related('product').filter(
            deleted_at__isnull=False, piece_amount__gt=0,
        )
        for stock in stocks.iterator(chunk_size=1000):
            lots = list(InventoryBatch.objects.filter(
                product_id=stock.product_id, condition=stock.condition,
            ))
            live = [lot for lot in lots if lot.status in ('active', 'expired') and lot.remaining_pieces > ZERO]
            unsupported = any(lot.remaining_pieces > ZERO and lot.status not in ('active', 'expired')
                              for lot in lots)
            quantity = sum((lot.remaining_pieces for lot in live), ZERO)
            value = sum((lot.remaining_pieces * lot.unit_cost for lot in live), ZERO)
            average_cost = value / quantity if quantity > ZERO else ZERO
            issues = []
            if stock.product.deleted_at is not None:
                issues.append('product_soft_deleted')
            if stock.currency != 1 or any(lot.currency != 1 or lot.unit_cost <= ZERO for lot in live):
                issues.append('cost_unknown_or_non_afn')
            if unsupported or any(lot.remaining_pieces < ZERO for lot in lots):
                issues.append('batch_state_invalid')
            if not live or quantity != stock.piece_amount:
                issues.append('quantity_mismatch')
            if quantity > ZERO and (stock.buy_price - average_cost).copy_abs() > PRICE_TOLERANCE:
                issues.append('price_mismatch')
            if not issues and apply:
                Stock.all_objects.filter(pk=stock.pk, deleted_at__isnull=False).update(
                    deleted_at=None, deleted_by=None, updated_at=timezone.now(),
                )
            rows.append({'stock_id': stock.pk, 'batch_count': len(live),
                         'eligible': not issues, 'restored': not issues and apply,
                         'issues': issues})
    return rows


class Command(BaseCommand):
    help = 'Dry-run by default; --apply restores only deleted Stock caches that exactly match live AFN batches.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Restore eligible stock summaries.')

    def handle(self, *args, **options):
        rows = review_deleted_stock_summaries(apply=options['apply'])
        for row in rows:
            self.stdout.write(f"stock={row['stock_id']} eligible={row['eligible']} "
                              f"restored={row['restored']} issues={','.join(row['issues']) or '-'}")
        self.stdout.write(f"examined={len(rows)} eligible={sum(row['eligible'] for row in rows)} "
                          f"restored={sum(row['restored'] for row in rows)}")
