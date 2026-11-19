"""Core journal create/replace/delete helpers."""
import logging
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import transaction

from api.services.accounting.amounts import d
from api.services.accounting.journal_fx import (
    journals_are_single_native_currency,
    prepare_posted_line,
)

logger = logging.getLogger(__name__)


def _native_totals(prepared_lines):
    debit = sum((d(line['debit']) for line in prepared_lines), Decimal('0'))
    credit = sum((d(line['credit']) for line in prepared_lines), Decimal('0'))
    return debit, credit


def _base_totals(prepared_lines):
    debit = sum((d(line['base_debit']) for line in prepared_lines if line.get('base_debit') is not None), Decimal('0'))
    credit = sum((d(line['base_credit']) for line in prepared_lines if line.get('base_credit') is not None), Decimal('0'))
    return debit, credit


@transaction.atomic
def replace_journal_for_source(
    source,
    *,
    entry_date,
    reference_number,
    description,
    lines,
    replace_all=True,
):
    """Replace auto journal for a source object. Raises if lines do not balance.

    When replace_all is False, only journals with the same reference_number are
    replaced (allows accrual + settlement journals on one source object).
    """
    from api.models.data.journal import JournalEntry, JournalLine
    from api.services.fiscal_year import assert_fiscal_year_open_for_date, get_fiscal_year_for_date

    assert_fiscal_year_open_for_date(entry_date)
    fiscal_year = get_fiscal_year_for_date(entry_date)

    content_type = ContentType.objects.get_for_model(source)
    qs = JournalEntry.objects.filter(
        content_type=content_type,
        object_id=source.pk,
        is_auto=True,
    )
    if not replace_all:
        qs = qs.filter(reference_number=reference_number)
    qs.delete()

    raw_lines = [
        line for line in lines
        if line.get('gl_account') and (
            d(line.get('debit', 0)) > 0
            or d(line.get('credit', 0)) > 0
            or d(line.get('base_debit', 0)) > 0
            or d(line.get('base_credit', 0)) > 0
        )
    ]
    if not raw_lines:
        return None

    prepared = [
        prepare_posted_line(line, source=source, entry_date=entry_date, require_rate=True)
        for line in raw_lines
    ]

    # Native Dr=Cr is only meaningful when every line shares one currency.
    if journals_are_single_native_currency(prepared):
        total_debit, total_credit = _native_totals(prepared)
        if total_debit != total_credit:
            raise ValidationError(
                f'Unbalanced journal for {content_type.model}:{source.pk} '
                f'Dr={total_debit} Cr={total_credit}'
            )
        base_debit, base_credit = _base_totals(prepared)
        if base_debit != base_credit:
            raise ValidationError(
                f'Unbalanced AFN journal for {content_type.model}:{source.pk} '
                f'base Dr={base_debit} Cr={base_credit}'
            )
    else:
        # Multi-currency journals (exchange / FX) are validated in AFN, including FX lines.
        base_debit, base_credit = _base_totals(prepared)
        if base_debit != base_credit:
            raise ValidationError(
                f'Unbalanced functional-currency journal for {content_type.model}:{source.pk} '
                f'base Dr={base_debit} Cr={base_credit}'
            )

    journal = JournalEntry.objects.create(
        entry_date=entry_date,
        reference_number=reference_number,
        description=description,
        is_auto=True,
        fiscal_year=fiscal_year,
        content_type=content_type,
        object_id=source.pk,
    )
    for line in prepared:
        JournalLine.objects.create(journal_entry=journal, **line)

    return journal


def delete_journal_for_source(source):
    from django.db import transaction
    from api.models.data.journal import JournalEntry

    content_type = ContentType.objects.get_for_model(source)
    with transaction.atomic():
        JournalEntry.objects.filter(
            content_type=content_type,
            object_id=source.pk,
            is_auto=True,
        ).delete()
