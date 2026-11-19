"""Isolated Django settings for accounting tests.

Forces sqlite in-memory so tests never touch the development MySQL/sqlite file.
"""
import os

# backend.settings reads DB_ENGINE via python-decouple. Force sqlite before import.
os.environ['DB_ENGINE'] = 'sqlite'

from .settings import *  # noqa: E402,F401,F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.MD5PasswordHasher',
]

EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
