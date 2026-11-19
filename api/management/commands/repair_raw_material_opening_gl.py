"""
Capitalize raw-material opening stock that exists operationally but was never
posted to Inventory (1100).

Direct stock creates historically updated RawMaterialStock without a journal.
Purchases post their own JE; this repair only covers the unposted opening
portion:

  opening_value = max(0, qty × MWA − sum(received purchase AFN for material))

Using value (not qty excess × MWA) avoids over-capitalizing when purchase unit
cost differs from the current moving average.

Usage:
  python manage.py repair_raw_material_opening_gl --dry-run
  python manage.py repair_raw_material_opening_gl
"""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models.data.raw_materials import RawMaterialPurchaseItem, RawMaterialStock
from api.services.accounting import sync_raw_material_stock_opening_journal
from api.services.accounting.posting import delete_journal_for_source
from api.services.weighted_average import d


class Command(BaseCommand):
    help = 'Post opening-equity journals for unposted raw material stock'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report capitalization amounts without writing journals',
        )

    def handle(self, *args, **options):
        dry = options['dry_run']
        purchase_value = defaultdict(lambda: Decimal('0'))
        for it in RawMaterialPurchaseItem.objects.filter(
            purchase__status='received',
            purchase__deleted_at__isnull=True,
            quantity__gt=0,
        ).only('raw_material_id', 'quantity', 'price_per_unit_base'):
            purchase_value[it.raw_material_id] += d(it.quantity) * d(it.price_per_unit_base)

        posted = 0
        skipped = 0
        total_value = Decimal('0')

        with transaction.atomic():
            for stock in RawMaterialStock.objects.select_related('raw_material').iterator():
                qty = d(stock.quantity)
                price = d(stock.last_purchase_price)
                ops_value = qty * price if qty > 0 and price > 0 else Decimal('0')
                bought_value = purchase_value.get(stock.raw_material_id, Decimal('0'))
                value = max(ops_value - bought_value, Decimal('0'))

                if value <= 0:
                    if not dry:
                        delete_journal_for_source(stock)
                    skipped += 1
                    continue

                reason = 'full_opening' if bought_value <= 0 else 'opening_above_purchases'
                total_value += value
                posted += 1
                name = stock.raw_material.name if stock.raw_material_id else stock.pk
                self.stdout.write(
                    f'{reason} material={name!r} id={stock.pk} '
                    f'ops={ops_value} purchased={bought_value} value={value}'
                )
                if dry:
                    continue
                sync_raw_material_stock_opening_journal(stock, value=value)

            if dry:
                transaction.set_rollback(True)

        verb = 'Would post' if dry else 'Posted'
        self.stdout.write(self.style.SUCCESS(
            f'{verb} {posted} opening journal(s) totaling {total_value}; skipped {skipped}'
        ))
