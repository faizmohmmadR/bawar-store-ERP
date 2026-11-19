import json

from django.core.management.base import BaseCommand

from account.maintenance import run_nightly_maintenance


class Command(BaseCommand):
    help = (
        'Run nightly maintenance: auto backup, prune old auto backups, '
        'purge old activity logs, purge expired trash. '
        'Best single cron entry for Hostinger.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would happen without changing data/files.',
        )
        parser.add_argument(
            '--json',
            action='store_true',
            help='Print machine-readable JSON summary.',
        )

    def handle(self, *args, **options):
        result = run_nightly_maintenance(dry_run=options['dry_run'])

        if options['json']:
            self.stdout.write(json.dumps(result, default=str, indent=2))
        else:
            backup = result.get('backup') or {}
            if backup.get('filename'):
                self.stdout.write(self.style.SUCCESS(f"Backup: {backup['filename']}"))
            elif backup.get('skipped'):
                self.stdout.write('Backup: skipped (dry-run)')

            prune = result.get('backup_prune') or {}
            self.stdout.write(
                f"Backup prune: deleted={prune.get('deleted', 0)} "
                f"kept={prune.get('kept', 'n/a')} "
                f"days={prune.get('retention_days', '?')}"
            )

            logs = result.get('activity_logs') or {}
            self.stdout.write(
                f"Activity logs: deleted={logs.get('deleted', 0)} "
                f"days={logs.get('retention_days', '?')} "
                f"dry_run={logs.get('dry_run', False)}"
            )

            trash = result.get('trash') or {}
            self.stdout.write(f"Trash: purged={trash.get('purged', 0)}")

            if result.get('errors'):
                for err in result['errors']:
                    self.stderr.write(self.style.ERROR(err))

        if not result.get('ok'):
            raise SystemExit(1)
