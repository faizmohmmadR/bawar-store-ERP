"""
Yearly depreciation journal service for EquipmentDepreciation entries.

Each entry posts:
  Dr  5150  Depreciation Expense        amount
  Cr  1410  Accumulated Depreciation    amount

Journal date: Dec 31 of the depreciation year (end-of-year recognition).
Source object: the EquipmentDepreciation instance (not the Equipment), so
  each yearly entry owns its own journal and replace_journal_for_source
  never touches the acquisition journal on Equipment.

On save:  equipment.accumulated_depreciation is recalculated.
On delete: journal is removed and accumulated_depreciation is recalculated.
"""
import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from api.services.accounting.amounts import d
from api.services.accounting.coa import gl_for_source
from api.services.accounting.posting import delete_journal_for_source, replace_journal_for_source


def _entry_date(year):
    """Dec 31 of the given year, timezone-aware."""
    return timezone.make_aware(
        datetime.datetime(year, 12, 31, 23, 59, 59),
        timezone.get_current_timezone(),
    )


def _ref(dep_entry):
    return f'DEP-YEARLY-{dep_entry.equipment_id}-{dep_entry.year}'


def _desc(dep_entry):
    eq = dep_entry.equipment
    return (
        f'Depreciation — {eq.name} '
        f'[{eq.serial_number or eq.pk}] '
        f'Year {dep_entry.year}'
    )


def sync_depreciation_journal(dep_entry):
    """Post or replace the yearly depreciation journal for one EquipmentDepreciation entry."""
    amount = d(dep_entry.amount)
    if amount <= 0:
        delete_journal_for_source(dep_entry)
        return

    expense_gl = gl_for_source('depreciation_expense', dep_entry.equipment)
    accum_gl = gl_for_source('accumulated_depreciation', dep_entry.equipment)
    if not expense_gl or not accum_gl:
        return

    desc = _desc(dep_entry)
    replace_journal_for_source(
        dep_entry,
        entry_date=_entry_date(dep_entry.year),
        reference_number=_ref(dep_entry),
        description=desc,
        lines=[
            {
                'gl_account': expense_gl,
                'currency': dep_entry.equipment.currency,
                'debit': amount,
                'credit': Decimal('0'),
                'description': desc,
            },
            {
                'gl_account': accum_gl,
                'currency': dep_entry.equipment.currency,
                'debit': Decimal('0'),
                'credit': amount,
                'description': desc,
            },
        ],
    )


@transaction.atomic
def recalculate_equipment_accumulated_depreciation(equipment):
    """
    Recompute equipment.accumulated_depreciation as:
        opening_accumulated_depreciation + sum(all yearly EquipmentDepreciation entries)

    opening_accumulated_depreciation is the value at acquisition time and is
    never overwritten by yearly runs.
    """
    from api.models.data.equipment import Equipment, EquipmentDepreciation

    yearly_total = sum(
        d(e.amount)
        for e in EquipmentDepreciation.objects.filter(equipment=equipment)
    )
    opening = d(equipment.opening_accumulated_depreciation or 0)
    new_acc = opening + yearly_total

    Equipment.objects.filter(pk=equipment.pk).update(accumulated_depreciation=new_acc)
    equipment.accumulated_depreciation = new_acc
