"""Remove auto journals still linked to soft-deleted source documents."""
from django.apps import apps
from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand

from api.models.data.journal import JournalEntry
from api.services.accounting.posting import delete_journal_for_source


# Models that soft-delete and own auto journals.
SOURCE_LABELS = (
    ('api.Sales', 'sale'),
    ('api.Return', 'return'),
    ('api.RawMaterialPurchase', 'purchase'),
    ('api.Payment', 'payment'),
    ('api.Payroll', 'payroll'),
    ('api.Expense', 'expense'),
    ('api.Withdrawal', 'withdrawal'),
    ('api.Loan', 'loan'),
    ('api.LoanPayment', 'loan_payment'),
    ('api.SalesmanCommissionPayment', 'commission'),
    ('api.PackingRun', 'packing'),
    ('api.StockBottleDamage', 'bottle_damage'),
    ('api.StorageTankLeak', 'tank_leak'),
    ('api.CurrencyExchange', 'currency_exchange'),
)


class Command(BaseCommand):
    help = 'Delete auto journals whose source document is soft-deleted.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report orphans without deleting them.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        removed_sources = 0
        orphan_journals = 0

        for model_label, kind in SOURCE_LABELS:
            try:
                model = apps.get_model(model_label)
            except LookupError:
                self.stdout.write(self.style.WARNING(f'Skip missing model {model_label}'))
                continue
            if not hasattr(model, 'all_objects') or 'deleted_at' not in {
                f.name for f in model._meta.get_fields()
            }:
                continue

            ct = ContentType.objects.get_for_model(model)
            deleted_ids = set(
                model.all_objects.filter(deleted_at__isnull=False).values_list('pk', flat=True)
            )
            if not deleted_ids:
                continue

            orphan_ids = sorted(set(
                JournalEntry.objects.filter(
                    content_type=ct,
                    object_id__in=deleted_ids,
                    is_auto=True,
                    deleted_at__isnull=True,
                ).values_list('object_id', flat=True)
            ))
            for source_id in orphan_ids:
                journal_count = JournalEntry.objects.filter(
                    content_type=ct, object_id=source_id, is_auto=True, deleted_at__isnull=True,
                ).count()
                orphan_journals += journal_count
                self.stdout.write(f'{kind} id={source_id} live_auto_journals={journal_count}')
                if dry_run:
                    continue
                source = model.all_objects.filter(pk=source_id).first()
                if source is not None:
                    delete_journal_for_source(source)
                else:
                    JournalEntry.objects.filter(
                        content_type=ct, object_id=source_id, is_auto=True,
                    ).delete()
                removed_sources += 1

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'Dry run complete — {orphan_journals} orphan auto journal(s) found.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Removed auto journals for {removed_sources} soft-deleted source(s) '
                f'({orphan_journals} journal entries).'
            ))
