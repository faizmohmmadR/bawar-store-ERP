from django.core.management.base import BaseCommand

from account.maintenance import create_database_backup, prune_auto_backups


class Command(BaseCommand):
    help = 'Create an automatic database backup and prune old auto backups.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--no-prune',
            action='store_true',
            help='Create backup only; do not delete old auto backups.',
        )

    def handle(self, *args, **options):
        try:
            info = create_database_backup(prefix='auto_backup')
            self.stdout.write(self.style.SUCCESS(
                f"Automatic backup created: {info['filename']} ({info['size']} bytes)"
            ))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'Backup failed: {e}'))
            raise SystemExit(1)

        if options['no_prune']:
            return

        pruned = prune_auto_backups()
        self.stdout.write(self.style.SUCCESS(
            f"Pruned {pruned['deleted']} old auto backup(s); "
            f"kept {pruned['kept']} (retention {pruned['retention_days']} days)."
        ))
