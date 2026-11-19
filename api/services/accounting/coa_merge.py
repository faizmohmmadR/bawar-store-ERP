"""Safe Chart of Accounts merge (Phase 5).

Currency-specific: Cash / Bank / Sarafi stay per currency.
Generic codes: remapped onto one home-currency (AFN) account.

Stops without inventing mappings when a row cannot be remapped safely.
"""
import logging

from django.db import transaction

from api.constants.gl_roles import CURRENCY_SPECIFIC_GL_CODES, is_currency_specific_gl_code
from api.models.data.currency import BASE_CURRENCY_ID

logger = logging.getLogger(__name__)


def _settings_fk_fields():
    from api.constants.gl_roles import SETTINGS_FIELD_TO_ROLE
    from api.models.data.journal import AccountingSettings

    model_fields = {field.name for field in AccountingSettings._meta.fields}
    return [
        field_name
        for field_name in SETTINGS_FIELD_TO_ROLE
        if field_name in model_fields
    ]


@transaction.atomic
def merge_generic_gl_accounts(*, apps_registry=None, dry_run=False):
    """
    Remap journal lines and settings from foreign-currency generic GLs onto
    the AFN (home) account for the same code, then deactivate empties.

    Returns a summary dict. Raises RuntimeError if mapping is unsafe.
    """
    if apps_registry is not None:
        GLAccount = apps_registry.get_model('api', 'GLAccount')
        JournalLine = apps_registry.get_model('api', 'JournalLine')
        AccountingSettings = apps_registry.get_model(
            'api', 'AccountingSettings')
    else:
        from api.models.data.journal import AccountingSettings, GLAccount, JournalLine

    from api.models.data.journal import DEFAULT_GL_ACCOUNTS

    generic_codes = {code for code, _,
                     _ in DEFAULT_GL_ACCOUNTS if code not in CURRENCY_SPECIFIC_GL_CODES}
    remapped_lines = 0
    remapped_settings = 0
    deactivated = 0
    created_canonical = 0
    audit = []

    # Handle global generics if any exist

    for code in sorted(generic_codes):
        qs = GLAccount.objects.filter(code=code)
        accounts = list(qs)
        if not accounts:
            continue

        canonical = next(
            (a for a in accounts if a.currency in (
                BASE_CURRENCY_ID, None) and a.is_active),
            None,
        )
        if canonical is None:
            canonical = next(
                (a for a in accounts if a.currency in (BASE_CURRENCY_ID, None)),
                None,
            )
        if canonical is None:
            # No AFN home row — create from a donor clone (same category/name)
            donor = accounts[0]
            if dry_run:
                audit.append({
                    'code': code,
                    'action': 'would_create_canonical',
                    'from': donor.id,
                })
                continue
            name = (donor.name or code)
            # Strip trailing (USD)/(AFN)/etc.
            import re
            name = re.sub(r'\s*\((AFN|USD|KDR)\)\s*$', '',
                          name, flags=re.I).strip() or donor.name
            canonical = GLAccount.objects.create(

                currency=BASE_CURRENCY_ID,
                code=code,
                name=name,
                category=donor.category,
                description=donor.description,
                is_system=True,
                is_active=True,
            )
            created_canonical += 1
            accounts.append(canonical)

        if canonical.currency not in (BASE_CURRENCY_ID, None):
            raise RuntimeError(
                f'has currency={canonical.currency}, expected AFN/home.'
            )

        # Prefer clean generic name
        if not dry_run and canonical.is_system:
            import re
            clean = re.sub(r'\s*\((AFN|USD|KDR)\)\s*$', '',
                           canonical.name or '', flags=re.I).strip()
            if clean and clean != canonical.name:
                canonical.name = clean
                canonical.save(update_fields=['name', 'updated_at'])

        for account in accounts:
            if account.pk == canonical.pk:
                continue
            if is_currency_specific_gl_code(account.code):
                continue
            if account.currency in (BASE_CURRENCY_ID, None) and account.pk != canonical.pk:
                # Duplicate home-currency row — remappable only if one is inactive or empty
                pass

            line_count = JournalLine.objects.filter(
                gl_account_id=account.pk).count()
            if line_count and dry_run:
                audit.append({
                    'code': code,
                    'action': 'would_remap_lines',
                    'from': account.id,
                    'to': canonical.id,
                    'lines': line_count,
                })
            elif line_count and not dry_run:
                updated = JournalLine.objects.filter(gl_account_id=account.pk).update(
                    gl_account_id=canonical.pk
                )
                remapped_lines += updated

            # Remap AccountingSettings FKs
            for field_name in _settings_fk_fields():
                filt = {field_name + '_id': account.pk}
                if dry_run:
                    if AccountingSettings.objects.filter(**filt).exists():
                        remapped_settings += AccountingSettings.objects.filter(
                            **filt).count()
                        audit.append({
                            'code': code,
                            'action': 'would_remap_settings',
                            'field': field_name,
                            'from': account.id,
                            'to': canonical.id,
                        })
                else:
                    updated = AccountingSettings.objects.filter(**filt).update(
                        **{field_name + '_id': canonical.pk}
                    )
                    remapped_settings += updated

            remaining = JournalLine.objects.filter(
                gl_account_id=account.pk).count()
            still_referenced = False
            for field_name in _settings_fk_fields():
                if AccountingSettings.objects.filter(**{field_name + '_id': account.pk}).exists():
                    still_referenced = True
                    break
            if remaining or still_referenced:
                raise RuntimeError(
                    f'Unsafe CoA merge: GLAccount id={account.pk} code={code} '
                    f'{remaining} journal line(s) or settings references after remap.'
                )
            if account.is_active:
                if dry_run:
                    audit.append({
                        'code': code,
                        'action': 'would_deactivate',
                        'id': account.id,
                        'currency': account.currency,
                    })
                else:
                    account.is_active = False
                    account.save(update_fields=['is_active', 'updated_at'])
                    deactivated += 1

    return {
        'remapped_lines': remapped_lines,
        'remapped_settings': remapped_settings,
        'deactivated': deactivated,
        'created_canonical': created_canonical,
        'audit': audit,
        'dry_run': dry_run,
    }
