"""
Create or update the main superuser (safe to run multiple times).

Use this instead of createsuperuser when the account may already exist
(e.g. after test scripts or DB resets).

Examples:
  python manage.py ensure_superuser
  python manage.py ensure_superuser --email you@example.com --username admin --password 'YourSecurePass1!'
"""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from account.models import User


class Command(BaseCommand):
    help = 'Create or update a superuser (idempotent — updates password if user exists)'

    def add_arguments(self, parser):
        parser.add_argument('--email', default='rahmdel@gmail.com', help='Superuser email (login)')
        parser.add_argument('--username', default=None, help='Optional internal username (auto from email if omitted)')
        parser.add_argument('--password', default=None, help='Password (prompted if omitted)')
        parser.add_argument(
            '--no-input',
            action='store_true',
            help='Use defaults only; requires --password',
        )

    def handle(self, *args, **options):
        email = User.objects.normalize_email(options['email'].strip())
        username = (options['username'] or '').strip().lower() or None
        password = options['password']

        if not password:
            if options['no_input']:
                raise CommandError('--password is required with --no-input')
            password = self.get_pass('Password: ')
            password2 = self.get_pass('Password (again): ')
            if password != password2:
                raise CommandError('Passwords do not match.')

        try:
            validate_password(password)
        except ValidationError as exc:
            if options['no_input']:
                raise CommandError('Password validation failed: ' + '; '.join(exc.messages))
            self.stderr.write(self.style.WARNING('Password validation warnings: ' + '; '.join(exc.messages)))
            if input('Use this password anyway? [y/N]: ').strip().lower() != 'y':
                raise CommandError('Aborted.')

        user = User.objects.filter(email=email).first()
        if not user:
            user = User.objects.create_superuser(
                email=email,
                username=username,
                password=password,
            )
            user.role = 'admin'
            user.is_admin = True
            user.save(update_fields=['role', 'is_admin', 'updated_at'])
            self.stdout.write(self.style.SUCCESS(f'Created superuser {email}'))
            return

        if username:
            conflict = User.objects.filter(username=username).exclude(pk=user.pk).exists()
            if conflict:
                raise CommandError(
                    f"Email {email} exists but username '{username}' belongs to another account."
                )
            user.username = username
        user.is_active = True
        user.is_staff = True
        user.is_superuser = True
        user.is_admin = True
        user.role = 'admin'
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f'Updated superuser {email}'))
