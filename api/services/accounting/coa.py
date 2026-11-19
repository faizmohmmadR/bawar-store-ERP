"""Chart of accounts bootstrap and GL account resolution for journal posting.

Single-tenant mode: accounts are created by currency only.
"""
import logging

from api.constants.gl_roles import (
    CURRENCY_SPECIFIC_GL_CODES,
    GL_ROLE_CODES,
    PAYMENT_METHOD_ROLES,
    REQUIRED_CURRENCY_SPECIFIC_CODES,
    REQUIRED_GENERIC_GL_CODES,
    SETTINGS_FIELD_TO_ROLE,
    is_currency_specific_gl_code,
)

logger = logging.getLogger(__name__)


def get_settings():
    from api.models.data.journal import AccountingSettings
    return AccountingSettings.get_solo()


def posting_currency_id():
    """Default reporting currency when none is selected (AFN)."""
    from api.models.data.currency import BASE_CURRENCY_ID
    return BASE_CURRENCY_ID


def _resolve_lookup_currency(code, currency_id=None):
    """Currency key used to find the GLAccount row for a code."""
    from api.models.data.currency import BASE_CURRENCY_ID

    if is_currency_specific_gl_code(code):
        return currency_id if currency_id is not None else BASE_CURRENCY_ID
    # Generic accounts live under the functional/home currency.
    return BASE_CURRENCY_ID


def is_accounting_ready(currency_id=None):
    from api.models.data.journal import GLAccount
    from api.models.data.currency import BASE_CURRENCY_ID

    cid = currency_id if currency_id is not None else posting_currency_id()

    specific_count = GLAccount.objects.filter(
        currency=cid,
        code__in=REQUIRED_CURRENCY_SPECIFIC_CODES,
        is_active=True,
    ).count()
    if specific_count != len(REQUIRED_CURRENCY_SPECIFIC_CODES):
        return False

    generic_count = GLAccount.objects.filter(
        currency=BASE_CURRENCY_ID,
        code__in=REQUIRED_GENERIC_GL_CODES,
        is_active=True,
    ).count()
    return generic_count == len(REQUIRED_GENERIC_GL_CODES)


def get_gl_account(base_code, currency_id=None):
    """
    Resolve a GL account by code.

    Generic codes ignore transaction currency and resolve the single
    home-currency account.
    """
    from api.models.data.journal import GLAccount

    bare = (base_code or '').split('-')[0]
    cid = _resolve_lookup_currency(bare, currency_id)

    account = GLAccount.objects.filter(
        currency=cid, code=bare, is_active=True
    ).first()
    if account:
        return account

    if is_currency_specific_gl_code(bare):
        accounts = ensure_default_gl_accounts(currency_id=cid)
        return accounts.get(bare)

    # Ensure generics (home currency) plus the requested currency-specific set.
    ensure_all_gl_accounts()
    return GLAccount.objects.filter(
        currency=cid, code=bare, is_active=True
    ).first()


def get_gl_for_role(role, currency_id=None):
    """Resolve GL by business role, with optional AccountingSettings override."""
    code = GL_ROLE_CODES.get(role)
    if not code:
        raise ValueError(f'Unknown GL role: {role}')

    settings = get_settings()
    for field_name, field_role in SETTINGS_FIELD_TO_ROLE.items():
        if field_role != role:
            continue
        override = getattr(settings, field_name, None)
        if override and override.is_active and override.code == code:
            # Accept override regardless of currency
            if is_currency_specific_gl_code(code):
                cid = currency_id if currency_id is not None else posting_currency_id()
                if override.currency in (None, cid):
                    return override
            else:
                # Generic: accept override regardless of currency
                return override

    return get_gl_account(code, currency_id=currency_id)


def get_payment_asset_account(payment_method='cash', currency_id=None):
    role = PAYMENT_METHOD_ROLES.get(payment_method or 'cash', 'cash')
    return (
        get_gl_for_role(role, currency_id=currency_id)
        or get_gl_for_role('cash', currency_id=currency_id)
    )


def ensure_default_gl_accounts(currency_id=None):
    """Ensure GL rows for one currency book in single-tenant mode."""
    from api.models.data.journal import DEFAULT_GL_ACCOUNTS, GLAccount
    from api.models.data.currency import BASE_CURRENCY_ID

    if currency_id is None:
        currency_id = BASE_CURRENCY_ID
    currency_id = int(currency_id)
    home_id = BASE_CURRENCY_ID
    created = {}
    for code, name, category in DEFAULT_GL_ACCOUNTS:
        if is_currency_specific_gl_code(code):
            account, _ = GLAccount.objects.get_or_create(
                currency=currency_id,
                code=code,
                defaults={
                    'name': name,
                    'category': category,
                    'is_system': True,
                },
            )
            if account.is_system and account.name != name:
                account.name = name
                account.save(update_fields=['name', 'updated_at'])
            created[code] = account
        elif currency_id == home_id or code not in created:
            # Create generics once under home currency; also when ensuring AFN book.
            account, _ = GLAccount.objects.get_or_create(
                currency=home_id,
                code=code,
                defaults={
                    'name': name,
                    'category': category,
                    'is_system': True,
                },
            )
            if account.is_system and account.name != name:
                account.name = name
                account.save(update_fields=['name', 'updated_at'])
            created[code] = account
    return created


def ensure_all_gl_accounts():
    """Ensure all GL accounts for all currencies."""
    from api.models.data.currency import CURRENCY_DEFINITIONS, BASE_CURRENCY_ID

    result = {}
    # Generics + AFN cash books first
    result[BASE_CURRENCY_ID] = ensure_default_gl_accounts(currency_id=BASE_CURRENCY_ID)
    for currency_id in CURRENCY_DEFINITIONS:
        if int(currency_id) == int(BASE_CURRENCY_ID):
            continue
        result[currency_id] = ensure_default_gl_accounts(currency_id=currency_id)
    return result


def ensure_accounting_ready(currency_id=None):
    """Ensure CoA exists."""
    cid = currency_id if currency_id is not None else posting_currency_id()
    if is_accounting_ready(currency_id=cid):
        return True
    try:
        ensure_all_gl_accounts()
        settings = get_settings()
        if not settings.is_configured:
            settings.is_configured = True
            settings.save(update_fields=['is_configured', 'updated_at'])
    except Exception:
        logger.exception('Auto-initialize accounting failed')
        return False
    return is_accounting_ready(currency_id=cid)


def initialize_accounting_settings():
    ensure_accounting_ready()

    # Re-run provisioning so system names stay generic (Cash, not Cash AFN).
    ensure_all_gl_accounts()
    return get_settings()


def gl_for_source(role, obj):
    """Resolve role GL for a source transaction."""
    from api.services.accounting.amounts import source_currency_id

    return get_gl_for_role(
        role,
        currency_id=source_currency_id(obj),
    )


def _pick_default_account(accounts, base_code):
    return accounts.get(base_code)


def _fill_missing_accounting_settings(accounts=None):
    return get_settings()


def _remap_settings_to_bare_gl(accounts):
    pass


def resolve_gl_for_currency(gl_account, currency=None):
    """Map a GL account to the posting account for a currency context."""
    if not gl_account:
        return None
    from api.models.data.currency import BASE_CURRENCY_ID

    base_code = (gl_account.code or '').split('-')[0]
    cid = currency if currency is not None else posting_currency_id()
    if cid is None:
        cid = BASE_CURRENCY_ID
    return get_gl_account(
        base_code,
        currency_id=int(cid),
    )


def remap_gl_account_to_currency(gl_account, preferred_code='AFN'):
    from api.models.data.currency import get_currency_by_code, BASE_CURRENCY_ID

    c = get_currency_by_code(preferred_code)
    cid = c['id'] if c else BASE_CURRENCY_ID
    return resolve_gl_for_currency(gl_account, currency=cid)


def cleanup_base_gl_accounts(preferred_code='AFN'):
    from api.models.data.journal import GLAccount, JournalLine
    from api.models.data.journal import DEFAULT_GL_ACCOUNTS

    base_codes = {code for code, _, _ in DEFAULT_GL_ACCOUNTS}
    for line in JournalLine.objects.filter(gl_account__code__contains='-').iterator():
        bare_code = line.gl_account.code.split('-')[0]
        if bare_code not in base_codes:
            continue
        replacement = GLAccount.objects.filter(code=bare_code, is_active=True).first()
        if replacement:
            line.gl_account = replacement
            line.save(update_fields=['gl_account'])
