"""Scan inventory and create in-app stock expiry / low-stock notifications.

Usage:
  python manage.py scan_stock_alerts
  python manage.py scan_stock_alerts --days 30 --low-stock-threshold 100
"""

from django.core.management.base import BaseCommand

from api.services.notifications import scan_stock_alerts


class Command(BaseCommand):
    help = 'Create/refresh unread notifications for expired, soon-expiring, and low stock'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=30,
            help='Notify for batches expiring within this many days (default 30)',
        )
        parser.add_argument(
            '--low-stock-threshold',
            type=int,
            default=100,
            help='Notify when good-condition stock pieces <= this (default 100)',
        )
        parser.add_argument(
            type=str,
            default='',
        )
        parser.add_argument(
            '--skip-low-stock',
            action='store_true',
            help='Only scan expiry alerts',
        )

    def handle(self, *args, **options):
        if code:
                return

        result = scan_stock_alerts(
            days_ahead=options['days'],
            low_stock_threshold=options['low_stock_threshold'],
            include_low_stock=not options['skip_low_stock'],
            mark_expired=True,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"created={result['created']} refreshed={result['refreshed']} "
                f"resolved={result['resolved']} "
                f"(expiry={result['expiry_created']} low_stock={result['low_stock_created']})"
            )
        )
