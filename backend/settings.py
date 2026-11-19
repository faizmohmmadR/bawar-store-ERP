
import os
from pathlib import Path
from datetime import timedelta

import pymysql

from decouple import config, Csv

# =========================================================
# BASE DIRECTORY
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent

# =========================================================
# SECURITY
# =========================================================

SECRET_KEY = config(
    "SECRET_KEY",
    default="django-insecure-dev-only-replace-in-production"
)

DEBUG = config(
    "DEBUG",
    default=False,
    cast=bool
)

ALLOWED_HOSTS = config(
    "ALLOWED_HOSTS",
    default="localhost,127.0.0.1",
    cast=Csv()
)

# Hidden Django admin path (keep admin enabled; do not publish this URL).
# Example: ADMIN_URL_PATH=erp-console-x7k2m9
# Visiting /admin/ returns a normal 404 and does not reveal that admin exists.
ADMIN_URL_PATH = config(
    "ADMIN_URL_PATH",
    default="erp-console-x7k2m9",
).strip().strip("/")

# =========================================================
# APPLICATIONS
# =========================================================

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third-party apps
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "django_filters",
    "knox",

    # Local apps
    "api",
    "account",
]

# =========================================================
# MIDDLEWARE
# =========================================================

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",

    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",

    "api.middleware.activity_logger.ActivityLoggerMiddleware",
]

ROOT_URLCONF = "backend.urls"

# =========================================================
# TEMPLATES
# =========================================================

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "backend.wsgi.application"

# =========================================================
# DATABASE
# =========================================================

DB_ENGINE = config("DB_ENGINE", default="sqlite")

if DB_ENGINE == "mysql":

    pymysql.install_as_MySQLdb()

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",

            "NAME": config("DB_NAME"),
            "USER": config("DB_USER"),
            "PASSWORD": config("DB_PASSWORD"),
            "HOST": config("DB_HOST"),
            "PORT": config("DB_PORT"),

            "CONN_MAX_AGE": config(
                "DB_CONN_MAX_AGE",
                default=60,
                cast=int
            ),

            "OPTIONS": {
                "connect_timeout": config(
                    "DB_CONNECT_TIMEOUT",
                    default=60,
                    cast=int
                ),

                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
                "charset": "utf8mb4",
                "use_unicode": True,
            },
        }
    }

else:

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

ATOMIC_REQUESTS = True

# =========================================================
# PASSWORD VALIDATION
# =========================================================

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# =========================================================
# INTERNATIONALIZATION
# =========================================================

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

REPORT_TIME_ZONE = "Asia/Kabul"

USE_I18N = True
USE_TZ = True

# =========================================================
# STATIC FILES
# =========================================================

STATIC_URL = config(
    "STATIC_URL",
    default="/static/"
)

STATIC_ROOT = os.path.join(
    BASE_DIR,
    config("STATIC_ROOT", default="staticfiles")
)

MEDIA_URL = config(
    "MEDIA_URL",
    default="/media/"
)

MEDIA_ROOT = os.path.join(
    BASE_DIR,
    config("MEDIA_ROOT", default="media")
)

# =========================================================
# DEFAULT PRIMARY KEY
# =========================================================

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# =========================================================
# CUSTOM USER MODEL
# =========================================================

AUTH_USER_MODEL = "account.User"

# =========================================================
# CORS SETTINGS
# =========================================================

APPEND_SLASH = False

CORS_ALLOW_ALL_ORIGINS = config(
    "CORS_ALLOW_ALL_ORIGINS",
    default=False,
    cast=bool
)

CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:3000",
    cast=Csv()
)

CSRF_TRUSTED_ORIGINS = config(
    "CSRF_TRUSTED_ORIGINS",
    default="http://localhost:8080,http://127.0.0.1:8080",
    cast=Csv()
)

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

# =========================================================
# DJANGO REST FRAMEWORK
# =========================================================

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "knox.auth.TokenAuthentication",
    ),

    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],

    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],

    "DEFAULT_PAGINATION_CLASS":
        "rest_framework.pagination.PageNumberPagination",

    "PAGE_SIZE": config(
        "API_PAGE_SIZE",
        default=12,
        cast=int
    ),
}

# =========================================================
# KNOX TOKEN SETTINGS
# =========================================================

REST_KNOX = {
    "TOKEN_TTL": timedelta(
        days=config(
            "TOKEN_EXPIRY_DAYS",
            default=7,
            cast=int
        )
    ),

    "TOKEN_LIMIT_PER_USER": config(
        "TOKEN_LIMIT",
        default=5,
        cast=int
    ),

    "AUTO_REFRESH": False,
}

# =========================================================
# EMAIL SETTINGS
# =========================================================

EMAIL_BACKEND = config("EMAIL_BACKEND")

EMAIL_HOST = config("EMAIL_HOST")

EMAIL_PORT = config(
    "EMAIL_PORT",
    cast=int
)

EMAIL_USE_SSL = config(
    "EMAIL_USE_SSL",
    default=True,
    cast=bool
)

EMAIL_HOST_USER = config("EMAIL_HOST_USER")

EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD")

DEFAULT_FROM_EMAIL = config(
    "DEFAULT_FROM_EMAIL",
    default=config("EMAIL_HOST_USER")
)

EMAIL_TIMEOUT = config(
    "EMAIL_TIMEOUT",
    default=30,
    cast=int
)

# =========================================================
# CACHE SETTINGS
# =========================================================

CACHES = {
    "default": {
        "BACKEND": config(
            "CACHE_BACKEND",
            default="django.core.cache.backends.locmem.LocMemCache"
        ),

        "LOCATION": config(
            "CACHE_LOCATION",
            default="unique-snowflake"
        ),
    }
}

# =========================================================
# FILE UPLOAD SETTINGS
# =========================================================

MAX_UPLOAD_SIZE = config(
    "MAX_UPLOAD_SIZE",
    default=5242880,
    cast=int
)

ALLOWED_UPLOAD_EXTENSIONS = config(
    "ALLOWED_UPLOAD_EXTENSIONS",
    default=".pdf,.mp3,.epub"
).split(",")

# =========================================================
# SITE ADDRESS
# =========================================================

SITE_ADDRESS = config(
    "SITE_ADDRESS",
    default="http://127.0.0.1:3000"
)

# =========================================================
# MAINTENANCE (activity logs + auto backups)
# Hostinger: one cron → scripts/hostinger_cron.sh
# or HTTP cron → POST /api/maintenance/run/ with Bearer secret
# =========================================================

# Keep activity logs this many days, then hard-delete (standard ~12 months).
ACTIVITY_LOG_RETENTION_DAYS = config(
    "ACTIVITY_LOG_RETENTION_DAYS",
    default=365,
    cast=int,
)

# Keep automatic backups this many days; manual backups are never auto-deleted.
BACKUP_RETENTION_DAYS = config(
    "BACKUP_RETENTION_DAYS",
    default=30,
    cast=int,
)

# Optional override; default is <BASE_DIR>/backups
BACKUP_DIR = config("BACKUP_DIR", default="")

# UI/API restore is dangerous on production (can wipe newer data). Keep False.
BACKUP_RESTORE_ENABLED = config(
    "BACKUP_RESTORE_ENABLED",
    default=False,
    cast=bool,
)

# If set, enables unauthenticated HTTP cron at /api/maintenance/run/
# Use a long random string. Leave empty to disable the HTTP endpoint.
MAINTENANCE_CRON_SECRET = config("MAINTENANCE_CRON_SECRET", default="")

# =========================================================
# PRODUCTION SECURITY SETTINGS
# =========================================================

if not DEBUG:
    SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
    SESSION_COOKIE_SECURE = config("SESSION_COOKIE_SECURE", default=True, cast=bool)
    CSRF_COOKIE_SECURE = config("CSRF_COOKIE_SECURE", default=True, cast=bool)
    SECURE_HSTS_SECONDS = config("SECURE_HSTS_SECONDS", default=31536000, cast=int)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
else:
    SECURE_SSL_REDIRECT = False
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    SECURE_HSTS_SECONDS = 0

SECURE_CONTENT_TYPE_NOSNIFF = config("SECURE_CONTENT_TYPE_NOSNIFF", default=True, cast=bool)
SECURE_BROWSER_XSS_FILTER = config("SECURE_BROWSER_XSS_FILTER", default=True, cast=bool)
X_FRAME_OPTIONS = "DENY"
