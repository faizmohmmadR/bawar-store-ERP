from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _auto_configure_accounting():
    try:
        from api.services.accounting import ensure_accounting_ready
        ensure_accounting_ready()
        from api.services.fiscal_year import ensure_current_fiscal_year
        ensure_current_fiscal_year()
    except Exception:
        pass


def _post_migrate_init(sender, **kwargs):
    if sender.name != 'api':
        return
    _auto_configure_accounting()


class ApiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "api"

    def ready(self):
        # Journal posting signals (centralized)
        import api.signals  # noqa: F401

        post_migrate.connect(_post_migrate_init, dispatch_uid='api.post_migrate_init')
