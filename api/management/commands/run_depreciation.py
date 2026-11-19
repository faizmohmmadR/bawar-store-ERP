from datetime import date

from django.core.management.base import BaseCommand, CommandError

from api.services.accounting.depreciation import run_monthly_depreciation


class Command(BaseCommand):
    help = 'Post monthly straight-line depreciation journals for active equipment.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--as-of',
            dest='as_of',
            help='Period date YYYY-MM-DD (defaults to today; uses that month end).',
        )

    def handle(self, *args, **options):
        as_of = options.get('as_of')
        as_of_date = None
        if as_of:
            try:
                as_of_date = date.fromisoformat(as_of)
            except ValueError as exc:
                raise CommandError('Use --as-of YYYY-MM-DD') from exc
        result = run_monthly_depreciation(as_of_date=as_of_date)
        self.stdout.write(
            self.style.SUCCESS(
                f"Depreciation {result['period_end']}: "
                f"posted={result['posted']} skipped={result['skipped']}"
            )
        )
