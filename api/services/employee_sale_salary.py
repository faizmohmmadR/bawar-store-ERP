"""Employee product sales settle as paid salary (goods, no cash movement)."""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from api.models.data.payroll import Payroll
from api.models.data.sales import Sales
from api.utils.calendar_period import payroll_period_from_datetime

CENT = Decimal('0.01')


def _quantize(amount) -> Decimal:
    return Decimal(str(amount or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def _should_settle(sale: Sales) -> bool:
    if not sale or not sale.pk or not sale.employee_id:
        return False
    if sale.customer_id or sale.vendor_id:
        return False
    if sale.is_free:
        return False
    if sale.status in ('draft', 'cancelled'):
        return False
    return _quantize(sale.total_amount) > 0


def _remove_settlement(sale: Sales):
    payroll = getattr(sale, 'salary_settlement', None)
    if payroll is None:
        payroll = Payroll.objects.filter(source_sale_id=sale.pk).first()
    if payroll:
        payroll.delete()
    if sale.pk and _quantize(sale.paid_amount) != 0:
        Sales.objects.filter(pk=sale.pk).update(paid_amount=0, paid_amount_base=0)
        sale.paid_amount = Decimal('0')
        sale.paid_amount_base = Decimal('0')


def _returned_goods_amount(sale: Sales) -> Decimal:
    """Current value of live return notes for an employee goods sale.

    A goods sale is salary already paid in products.  A return therefore
    reduces that settlement; it is never a customer receivable or cash refund.
    The default manager deliberately excludes returned documents in Trash.
    """
    from api.models.data.returns import Return

    total = Return.objects.filter(sales_id=sale.pk).aggregate(
        total=Sum('total_amount')
    )['total']
    return _quantize(total)


@transaction.atomic
def sync_employee_sale_salary_settlement(sale: Sales, *, period_calendar: str | None = None):
    """
    Keep a goods payroll row in sync with an employee product sale.

    - Creates/updates Payroll(source_sale=sale) for the net goods amount on the sale date
    - Marks the sale fully paid (no cash Payment row)
    - Removes the settlement when the sale is free/cancelled/unlinked
    """
    sale = Sales.objects.select_for_update().select_related('employee', 'salary_settlement').get(pk=sale.pk)

    if not _should_settle(sale):
        _remove_settlement(sale)
        return None

    employee = sale.employee
    gross_amount = _quantize(sale.total_amount)
    returned_amount = _returned_goods_amount(sale)
    if returned_amount > gross_amount:
        # The serializer prevents this for new data.  Do not create a negative
        # salary settlement if older/imported records violate that rule.
        _remove_settlement(sale)
        return None
    amount = gross_amount - returned_amount
    amount_base = _quantize(amount * Decimal(str(sale.exchange_rate or 1)))
    if amount == 0:
        # A fully returned goods sale has no remaining salary settlement.
        _remove_settlement(sale)
        return None
    calendar = period_calendar or getattr(sale, '_salary_period_calendar', None) or 'jalali'
    period = payroll_period_from_datetime(sale.sale_date, calendar)
    basic = _quantize(getattr(employee, 'salary', 0) or 0)
    note = f'Salary settlement for sale {sale.invoice_number}'
    reference = (sale.invoice_number or '')[:100]

    payroll = getattr(sale, 'salary_settlement', None)
    if payroll is None:
        payroll = Payroll.objects.filter(source_sale_id=sale.pk).first()

    values = dict(
        employee=employee,
        payroll_type=Payroll.PAYROLL_TYPE_SALARY,
        salary_type=getattr(employee, 'salary_type', None) or 'monthly',
        month=period['month'],
        year=period['year'],
        period_calendar=period['period_calendar'],
        amount=amount,
        net_salary=amount,
        gross_amount=amount,
        basic_salary=basic or amount,
        bonus=Decimal('0'),
        overtime=Decimal('0'),
        salary_deduction=Decimal('0'),
        deduction_days=0,
        working_days=30,
        currency=sale.currency,
        exchange_rate=sale.exchange_rate or 1,
        payment_method=Payroll.PAYMENT_GOODS,
        payment_date=sale.sale_date,
        reference_number=reference,
        notes=note,
        manual_net=True,
        source_sale=sale,
    )

    if payroll:
        for field, value in values.items():
            setattr(payroll, field, value)
        payroll.amount_base = amount_base
        payroll.net_salary_base = amount_base
        payroll.save()
    else:
        payroll = Payroll(**values)
        payroll.amount_base = amount_base
        payroll.net_salary_base = amount_base
        payroll.save()

    Sales.objects.filter(pk=sale.pk).update(
        paid_amount=amount,
        paid_amount_base=amount_base,
    )
    sale.paid_amount = amount
    sale.paid_amount_base = amount_base
    return payroll


def validate_employee_sale_party(*, customer, vendor, employee):
    parties = [bool(customer), bool(vendor), bool(employee)]
    if sum(1 for present in parties if present) != 1:
        raise ValidationError({
            'employee': 'Select exactly one of customer, vendor, or employee.',
        })
