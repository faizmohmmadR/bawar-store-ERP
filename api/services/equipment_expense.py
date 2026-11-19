"""Link equipment acquisitions to the Expenses module when recorded as expense."""
from datetime import datetime, time

from django.db import transaction
from django.utils import timezone

from api.services.accounting.amounts import d

EQUIPMENT_EXPENSE_CATEGORY_NAME = 'Equipment'


def _equipment_acquisition_type(equipment):
    acq = getattr(equipment, 'acquisition_type', None)
    if acq:
        return acq
    if getattr(equipment, 'record_as_expense', False):
        return 'expense'
    if getattr(equipment, 'is_opening_balance', False):
        return 'opening'
    return 'new_purchase'


def get_or_create_equipment_expense_category():
    from api.models.data.expenses import ExpenseCategory

    category, _ = ExpenseCategory.objects.get_or_create(
        name=EQUIPMENT_EXPENSE_CATEGORY_NAME,
        defaults={
            'description': 'Equipment purchases recorded as operating expense',
        },
    )
    return category


def _expense_datetime(equipment):
    acquired = getattr(equipment, 'acquired_date', None)
    if not acquired:
        return timezone.now()
    if isinstance(acquired, datetime):
        return acquired
    return timezone.make_aware(
        datetime.combine(acquired, time.min),
        timezone.get_current_timezone(),
    )


def _clear_linked_expense(equipment):
    expense_id = getattr(equipment, 'expense_id', None)
    if not expense_id:
        return
    from api.models.data.equipment import Equipment
    from api.models.data.expenses import Expense

    Equipment.objects.filter(pk=equipment.pk).update(expense_id=None)
    equipment.expense_id = None
    Expense.objects.filter(pk=expense_id).delete()


def sync_equipment_linked_expense(equipment):
    """
    When record_as_expense is on (and not opening balance), create/update a linked
    Expense under the auto "Equipment" category. Otherwise remove any linked expense.

    The Expense post_save signal posts the operating-expense journal.
    """
    if getattr(equipment, '_skip_linked_expense_sync', False):
        return

    from api.models.data.equipment import Equipment
    from api.models.data.expenses import Expense
    from api.services.currency_conversion import populate_base_amounts

    wants_expense = _equipment_acquisition_type(equipment) == 'expense'
    amount = d(equipment.quantity) * d(equipment.unit_cost)

    if not wants_expense or amount <= 0:
        _clear_linked_expense(equipment)
        return

    category = get_or_create_equipment_expense_category()
    description = (equipment.notes or '').strip() or f'Equipment: {equipment.name}'
    serial = (equipment.serial_number or '').strip()
    if serial and serial not in description:
        description = f'{description} [{serial}]'

    payment_method = getattr(equipment, 'payment_method', None) or 'cash'
    expense_date = _expense_datetime(equipment)

    with transaction.atomic():
        if equipment.expense_id:
            expense = Expense.objects.select_for_update().filter(pk=equipment.expense_id).first()
            if expense is None:
                equipment.expense_id = None
            else:
                expense.category = category
                expense.amount = amount
                expense.currency = equipment.currency
                expense.expense_date = expense_date
                expense.description = description
                if hasattr(expense, 'payment_method'):
                    expense.payment_method = payment_method
                populate_base_amounts(
                    expense,
                    amount_fields=('amount',),
                    currency=expense.currency,
                    at_datetime=expense_date,
                )
                expense.save()
                return

        expense = Expense(
            category=category,
            amount=amount,
            currency=equipment.currency,
            expense_date=expense_date,
            description=description,
        )
        if hasattr(expense, 'payment_method'):
            expense.payment_method = payment_method
        populate_base_amounts(
            expense,
            amount_fields=('amount',),
            currency=expense.currency,
            at_datetime=expense_date,
        )
        expense.save()
        Equipment.objects.filter(pk=equipment.pk).update(expense_id=expense.pk)
        equipment.expense_id = expense.pk
