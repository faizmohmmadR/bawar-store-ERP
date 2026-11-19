"""
Journal-line functional (AFN) amounts.

Rate convention (locked): 1 unit of line currency = exchange_rate AFN.
AFN rate is always 1. Historical rates are stored on the line at posting
and are never recalculated from a later ExchangeRate row.
"""
from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError

from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS, get_currency
from api.services.accounting.amounts import d

TWOPLACES = Decimal('0.01')
SIXPLACES = Decimal('0.000001')
ZERO = Decimal('0')
ONE = Decimal('1')

SOURCE_AMOUNT_FIELDS = ('amount', 'total_amount', 'net_salary', 'refund_amount')


def quantize_money(value):
    return d(value).quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def quantize_rate(value):
    return d(value).quantize(SIXPLACES, rounding=ROUND_HALF_UP)


def is_base_currency(currency_id):
    if currency_id is None:
        return True
    return int(currency_id) == int(BASE_CURRENCY_ID)


def gl_currency_id(gl_account):
    if gl_account is None:
        return BASE_CURRENCY_ID
    cid = getattr(gl_account, 'currency', None)
    if cid is None:
        return BASE_CURRENCY_ID
    return int(cid)


def validate_native_sides(debit, credit, *, allow_zero=False):
    debit = d(debit)
    credit = d(credit)
    if debit < 0 or credit < 0:
        raise ValidationError('Journal debit and credit must be >= 0.')
    if debit > 0 and credit > 0:
        raise ValidationError('A journal line cannot have both debit and credit.')
    if debit == 0 and credit == 0 and not allow_zero:
        raise ValidationError('A journal line must have a debit or a credit.')
    return debit, credit


def validate_base_sides(base_debit, base_credit):
    if base_debit is None and base_credit is None:
        return None, None
    base_debit = d(base_debit)
    base_credit = d(base_credit)
    if base_debit < 0 or base_credit < 0:
        raise ValidationError('Journal base debit and base credit must be >= 0.')
    if base_debit > 0 and base_credit > 0:
        raise ValidationError('A journal line cannot have both base debit and base credit.')
    return base_debit, base_credit


def functional_from_native(debit, credit, exchange_rate):
    """AFN equivalent of a native debit/credit at a stored historical rate."""
    rate = quantize_rate(exchange_rate)
    if rate <= 0:
        raise ValidationError('exchange_rate must be positive.')
    debit, credit = validate_native_sides(debit, credit)
    return quantize_money(debit * rate), quantize_money(credit * rate), rate


def _source_amount_pair(source):
    """Best native/base pair on a source document, if both are populated."""
    if source is None:
        return None, None
    for field in SOURCE_AMOUNT_FIELDS:
        if not hasattr(source, field):
            continue
        native = d(getattr(source, field, 0))
        base_field = f'{field}_base'
        if native <= 0 or not hasattr(source, base_field):
            continue
        base = getattr(source, base_field, None)
        if base is None:
            continue
        base = d(base)
        if base > 0:
            return native, base
    return None, None


def trusted_source_rate(source, currency_id):
    """
    Historical rate from the source document only.

    Never returns a guessed rate. Foreign exchange_rate=1 (model default)
    is untrusted unless stored *_base implies a real conversion.
    """
    if is_base_currency(currency_id):
        return ONE
    if source is None:
        return None

    native, base = _source_amount_pair(source)
    stored = d(getattr(source, 'exchange_rate', 0) or 0)

    if native and base and native > 0:
        implied = quantize_rate(base / native)
        if implied > 0:
            return implied

    if stored > 0 and stored != ONE:
        return quantize_rate(stored)
    return None


def historical_table_rate(currency_id, at_datetime, *, exchange_rate_model=None):
    """Rate in force on or before at_datetime. None if no row exists — never a default."""
    if is_base_currency(currency_id):
        return ONE
    if at_datetime is None:
        return None
    from api.services.currency_conversion import _rate_lookup_cutoff

    cutoff = _rate_lookup_cutoff(at_datetime)
    if exchange_rate_model is None:
        from api.models.data.currency import ExchangeRate
        exchange_rate_model = ExchangeRate
    row = (
        exchange_rate_model.objects.filter(
            from_currency=int(currency_id),
            to_currency=BASE_CURRENCY_ID,
            date__lte=cutoff,
            is_active=True,
        )
        .order_by('-date')
        .first()
    )
    if row is None:
        return None
    rate = quantize_rate(row.rate)
    return rate if rate > 0 else None


def resolve_posting_rate(currency_id, *, source=None, entry_date=None, explicit_rate=None, require_rate=True):
    """
    Rate to store on a newly posted journal line.

    Order: explicit line rate → source document → ExchangeRate at entry_date.
    AFN is always 1. Does not use a hardcoded fallback such as 87.20.
    """
    if is_base_currency(currency_id):
        return ONE

    if explicit_rate is not None:
        rate = quantize_rate(explicit_rate)
        if rate <= 0:
            raise ValidationError('exchange_rate must be positive.')
        return rate

    rate = trusted_source_rate(source, currency_id)
    if rate is not None:
        return rate

    rate = historical_table_rate(currency_id, entry_date)
    if rate is not None:
        return rate

    if require_rate:
        code = (get_currency(currency_id) or {}).get('code', str(currency_id))
        raise ValidationError(
            f'No historical exchange rate for {code} → AFN on this transaction. '
            f'Record the rate on the source document or add an ExchangeRate on/before the date.'
        )
    return None


def _coerce_gl(gl):
    if gl is None:
        raise ValidationError('Journal line is missing a GL account.')
    if isinstance(gl, int):
        from api.models.data.journal import GLAccount
        gl = GLAccount.objects.get(pk=gl)
    return gl


def prepare_posted_line(line, *, source=None, entry_date=None, require_rate=True):
    """
    Return kwargs for JournalLine.objects.create (excluding journal_entry).

    Native debit/credit stay in the line currency. base_* are AFN at the
    historical rate stored on this line.

    Base-only lines (native debit=credit=0 with nonzero base_*) are allowed for
    period-end FX revaluation so native cash is unchanged while AFN carrying moves.
    """
    gl = _coerce_gl(line.get('gl_account'))
    raw_debit = d(line.get('debit', 0))
    raw_credit = d(line.get('credit', 0))
    provided_base_debit = line.get('base_debit', None)
    provided_base_credit = line.get('base_credit', None)
    base_only = (
        raw_debit == ZERO
        and raw_credit == ZERO
        and (provided_base_debit is not None or provided_base_credit is not None)
    )
    if base_only:
        base_debit, base_credit = validate_base_sides(
            provided_base_debit or 0,
            provided_base_credit or 0,
        )
        if d(base_debit) == ZERO and d(base_credit) == ZERO:
            raise ValidationError('A base-only journal line must have a base debit or base credit.')
    debit, credit = validate_native_sides(raw_debit, raw_credit, allow_zero=base_only)

    currency_id = line.get('currency')
    if currency_id is None:
        from api.constants.gl_roles import is_currency_specific_gl_code

        if is_currency_specific_gl_code(getattr(gl, 'code', None)):
            currency_id = gl_currency_id(gl)
        elif source is not None:
            from api.services.accounting.amounts import source_currency_id

            currency_id = source_currency_id(source)
        else:
            currency_id = gl_currency_id(gl)
    currency_id = int(currency_id)
    if currency_id not in CURRENCY_DEFINITIONS:
        raise ValidationError('Invalid journal line currency.')

    explicit = line.get('exchange_rate', None)
    rate = resolve_posting_rate(
        currency_id,
        source=source,
        entry_date=entry_date,
        explicit_rate=explicit,
        require_rate=require_rate and not base_only,
    )

    if base_only:
        if rate is None:
            if explicit is not None and d(explicit) > 0:
                rate = quantize_rate(explicit)
            elif is_base_currency(currency_id):
                rate = ONE
            else:
                raise ValidationError(
                    'Base-only revaluation lines require an explicit closing exchange_rate.'
                )
        if is_base_currency(currency_id):
            rate = ONE
        return {
            'gl_account': gl,
            'debit': debit,
            'credit': credit,
            'description': (line.get('description') or '') or '',
            'currency': currency_id,
            'exchange_rate': rate,
            'base_debit': base_debit,
            'base_credit': base_credit,
            'needs_rate_review': False,
        }

    if rate is None:
        return {
            'gl_account': gl,
            'debit': debit,
            'credit': credit,
            'description': (line.get('description') or '') or '',
            'currency': currency_id,
            'exchange_rate': None,
            'base_debit': None,
            'base_credit': None,
            'needs_rate_review': True,
        }

    if is_base_currency(currency_id):
        rate = ONE

    if provided_base_debit is not None or provided_base_credit is not None:
        base_debit, base_credit = validate_base_sides(
            provided_base_debit or 0,
            provided_base_credit or 0,
        )
    else:
        base_debit, base_credit, rate = functional_from_native(debit, credit, rate)
        native, source_base = _source_amount_pair(source)
        line_native = debit if debit > 0 else credit
        if native and source_base and line_native == native:
            aligned = quantize_money(source_base)
            if debit > 0:
                base_debit = aligned
                base_credit = ZERO
            else:
                base_debit = ZERO
                base_credit = aligned

    validate_base_sides(base_debit, base_credit)
    return {
        'gl_account': gl,
        'debit': debit,
        'credit': credit,
        'description': (line.get('description') or '') or '',
        'currency': currency_id,
        'exchange_rate': rate,
        'base_debit': base_debit,
        'base_credit': base_credit,
        'needs_rate_review': False,
    }


def _load_source_from_journal(journal, *, apps_registry=None):
    ct_id = getattr(journal, 'content_type_id', None)
    object_id = getattr(journal, 'object_id', None)
    if not ct_id or not object_id:
        return None
    get_model = apps_registry.get_model if apps_registry is not None else None
    if get_model is None:
        from django.contrib.contenttypes.models import ContentType
        from django.apps import apps
        get_model = apps.get_model
        try:
            ct = ContentType.objects.get(pk=ct_id)
        except ContentType.DoesNotExist:
            return None
        app_label, model = ct.app_label, ct.model
    else:
        ContentType = apps_registry.get_model('contenttypes', 'ContentType')
        try:
            ct = ContentType.objects.get(pk=ct_id)
        except ContentType.DoesNotExist:
            return None
        app_label, model = ct.app_label, ct.model
    try:
        Model = get_model(app_label, model)
    except LookupError:
        return None
    return Model.objects.filter(pk=object_id).first()


def backfill_existing_journal_lines(*, journal_line_model=None, apps_registry=None, exchange_rate_model=None):
    """
    Fill currency / rate / base on historical lines.

    Does not invent rates. Unmappable foreign-currency lines are flagged
    with needs_rate_review and left with null rate/base.
    """
    if journal_line_model is None:
        from api.models.data.journal import JournalLine
        journal_line_model = JournalLine

    filled = 0
    reviewed = 0
    audit = []

    from api.constants.gl_roles import is_currency_specific_gl_code
    from api.services.accounting.amounts import source_currency_id

    qs = journal_line_model.objects.select_related('gl_account', 'journal_entry').order_by('id')
    for line in qs.iterator(chunk_size=500):
        gl = line.gl_account
        debit = d(line.debit)
        credit = d(line.credit)
        journal = line.journal_entry
        currency_id = gl_currency_id(gl)
        try:
            source = _load_source_from_journal(journal, apps_registry=apps_registry)
            entry_date = getattr(journal, 'entry_date', None)

            # Phase 5: generic GLs are home-currency; transaction currency is on the line
            # (or the source). Prefer stored line currency, then source, then GL.
            existing_currency = getattr(line, 'currency', None)
            if existing_currency is not None:
                currency_id = int(existing_currency)
            elif is_currency_specific_gl_code(getattr(gl, 'code', None)):
                currency_id = gl_currency_id(gl)
            elif source is not None:
                currency_id = int(source_currency_id(source))
            else:
                currency_id = gl_currency_id(gl)

            if is_base_currency(currency_id):
                rate = ONE
                base_debit = quantize_money(debit)
                base_credit = quantize_money(credit)
                needs_review = False
            else:
                rate = trusted_source_rate(source, currency_id)
                if rate is None:
                    rate = historical_table_rate(
                        currency_id,
                        entry_date,
                        exchange_rate_model=exchange_rate_model,
                    )
                if rate is None:
                    needs_review = True
                    base_debit = None
                    base_credit = None
                else:
                    needs_review = False
                    base_debit, base_credit, rate = functional_from_native(debit, credit, rate)
                    native, source_base = _source_amount_pair(source)
                    line_native = debit if debit > 0 else credit
                    if native and source_base and line_native == native:
                        aligned = quantize_money(source_base)
                        if debit > 0:
                            base_debit, base_credit = aligned, ZERO
                        else:
                            base_debit, base_credit = ZERO, aligned
        except Exception as exc:
            needs_review = True
            rate = None
            base_debit = None
            base_credit = None
            reviewed += 1
            audit.append({
                'journal_line_id': line.id,
                'journal_id': getattr(journal, 'id', None),
                'gl_account_id': getattr(gl, 'id', None),
                'gl_code': getattr(gl, 'code', None),
                'currency': currency_id,
                'debit': str(debit),
                'credit': str(credit),
                'reason': f'Backfill stopped for this row: {exc}',
            })
            line.currency = currency_id
            line.exchange_rate = None
            line.base_debit = None
            line.base_credit = None
            line.needs_rate_review = True
            line.save(update_fields=[
                'currency', 'exchange_rate', 'base_debit', 'base_credit', 'needs_rate_review',
            ])
            continue

        line.currency = currency_id
        line.exchange_rate = rate
        line.base_debit = base_debit
        line.base_credit = base_credit
        line.needs_rate_review = needs_review
        line.save(update_fields=[
            'currency', 'exchange_rate', 'base_debit', 'base_credit', 'needs_rate_review',
        ])
        if needs_review:
            reviewed += 1
            audit.append({
                'journal_line_id': line.id,
                'journal_id': getattr(journal, 'id', None),
                'gl_account_id': getattr(gl, 'id', None),
                'gl_code': getattr(gl, 'code', None),
                'currency': currency_id,
                'debit': str(debit),
                'credit': str(credit),
                'reason': 'No stored source rate, implied *_base, or historical ExchangeRate on/before entry_date.',
            })
        else:
            filled += 1

    return {'filled': filled, 'needs_review': reviewed, 'audit': audit}


def journals_are_single_native_currency(prepared_lines):
    currencies = {int(line['currency']) for line in prepared_lines}
    return len(currencies) <= 1
