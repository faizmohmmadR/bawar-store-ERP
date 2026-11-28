"""Disabled seed command (legacy realistic dataset builder)."""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Disabled — legacy full realistic seed is no longer maintained.'

    def handle(self, *args, **options):
        raise CommandError(
            'seed_full_realistic is disabled. Use the live UI or focused seed commands instead.'
        )
