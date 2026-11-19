from django.core.management.base import BaseCommand

from account.maintenance import purge_old_activity_logs


class Command(BaseCommand):
    help = 'Permanently delete activity logs older than ACTIVITY_LOG_RETENTION_DAYS.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Count logs that would be deleted without deleting them.',
        )
        parser.add_argument(
            '--days',
            type=int,
            default=None,
            help='Override retention days for this run.',
        )

    def handle(self, *args, **options):
        result = purge_old_activity_logs(
            retention_days=options['days'],
            dry_run=options['dry_run'],
        )
        action = 'Would delete' if result['dry_run'] else 'Deleted'
        self.stdout.write(self.style.SUCCESS(
            f"{action} {result['deleted']} activity log(s) "
            f"(retention {result['retention_days']} days)."
        ))
