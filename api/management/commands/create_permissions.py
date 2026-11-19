from django.core.management.base import BaseCommand

from api.services.default_permissions import initialize_default_permissions


class Command(BaseCommand):
    help = 'Create or update default permissions for the system'

    def handle(self, *args, **options):
        result = initialize_default_permissions()
        self.stdout.write(
            self.style.SUCCESS(
                f"Permissions ready: {result['total']} total "
                f"({result['created']} created, {result['updated']} updated)"
            )
        )
