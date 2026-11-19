from django.core.management.base import BaseCommand

from api.services.soft_delete.service import purge_expired_trash


class Command(BaseCommand):
    help = 'Permanently delete trashed records older than the retention period (30 days).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='List items that would be purged without deleting them.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        purged = purge_expired_trash(dry_run=dry_run)
        action = 'Would purge' if dry_run else 'Purged'
        self.stdout.write(self.style.SUCCESS(f'{action} {len(purged)} trashed record(s).'))
