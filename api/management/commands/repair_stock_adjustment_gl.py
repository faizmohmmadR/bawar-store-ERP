"""
Repair misposted stock-increase credits on expense account 5070.

Historically, stock qty increases credited 5070 (Stock Adjustments / expense),
which made operating expenses negative and inflated net profit. Increases
belong on opening equity (3000). Losses (debits on 5070) are left alone.

Usage:
  python manage.py repair_stock_adjustment_gl
"""

from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from api.constants.gl_roles import GL_ROLE_CODES
from api.models.data.journal import GLAccount, JournalLine
from api.services.accounting.coa import get_gl_account


class Command(BaseCommand):
    help = 'Move 5070 stock-increase credits to opening equity (3000)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would change without writing',
        )

    def handle(self, *args, **options):
        dry = options['dry_run']
        stock_code = GL_ROLE_CODES['stock_adjustment']
        equity_code = GL_ROLE_CODES['opening_balance_equity']

        lines = (
            JournalLine.objects.filter(
                gl_account__code=stock_code,
            )
            .filter(Q(credit__gt=0) | Q(base_credit__gt=0))
            .select_related('gl_account', 'journal_entry')
        )

        moved = 0
        amount = Decimal('0')
        with transaction.atomic():
            for line in lines.iterator():
                if not equity:
                    equity = GLAccount.objects.filter(
                    ).first()
                if not equity:
                    self.stderr.write(
                        self.style.ERROR(
                            f'skip line {line.id}'
                        )
                    )
                    continue

                credit = Decimal(str(line.credit or 0))
                base_credit = Decimal(str(line.base_credit or 0))
                amount += base_credit or credit
                moved += 1
                if dry:
                    continue

                line.gl_account = equity
                if line.description and 'income' in line.description.lower():
                    line.description = line.description.replace(
                        'income', 'opening equity'
                    ).replace('Income', 'Opening equity')
                elif not line.description:
                    line.description = 'Opening / inventory capitalization'
                line.save(update_fields=['gl_account', 'description', 'updated_at'])

            if dry:
                transaction.set_rollback(True)

        style = self.style.WARNING if dry else self.style.SUCCESS
        self.stdout.write(
            style(
                f"{'Would move' if dry else 'Moved'} {moved} journal line(s) "
                f"from {stock_code} → {equity_code} "
                f"(≈ {amount} AFN base credit)"
            )
        )
