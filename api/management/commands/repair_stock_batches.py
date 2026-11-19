"""
Create missing InventoryBatch lots for Stock rows that have piece_amount
but no sellable batches (common after seed/demo scripts that update Stock
directly). Sales FEFO allocation requires batches.
"""
from django.core.management.base import BaseCommand
from django.db.models import Sum

from api.models.data.stock import Stock
from api.models.data.inventory_batch import InventoryBatch
from api.services.batch_inventory import sync_manual_stock_batch
from api.services.batch_queries import sellable_batch_q


class Command(BaseCommand):
    help = 'Repair Stock rows missing InventoryBatch lots so sales can allocate inventory'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only report mismatches; do not create batches',
        )

    def handle(self, *args, **options):
        dry = options['dry_run']
        fixed = 0
        skipped = 0

        qs = Stock.objects.filter(piece_amount__gt=0).select_related('product')
        for stock in qs.iterator():
            if not stock.product_id:
                skipped += 1
                continue

            sellable = (
                InventoryBatch.objects.filter(
                    product_id=stock.product_id,
                    condition=stock.condition,
                )
                .filter(sellable_batch_q())
                .aggregate(t=Sum('remaining_pieces'))['t']
                or 0
            )
            if float(sellable) >= float(stock.piece_amount):
                continue

            self.stdout.write(
                f"{'[dry] ' if dry else ''}"
                f"stock={stock.id} {stock.product.name} "
                f"stock_pieces={stock.piece_amount} batch_sellable={sellable}"
            )
            if dry:
                fixed += 1
                continue

            sync_manual_stock_batch(
                stock,
                pieces=stock.piece_amount,
                expire_date=stock.expire_date,
            )
            fixed += 1

        self.stdout.write(self.style.SUCCESS(f'Done. repaired/reported={fixed} skipped={skipped}'))
