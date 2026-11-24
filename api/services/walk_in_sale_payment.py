"""Auto cash settlement for walk-in (no-party) supermarket sales."""
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Sum

from api.models.data.payment import Payment
from api.services.accounting import sync_order_paid_amount
from api.services.currency_conversion import populate_base_amounts


def is_walk_in_sale(sale) -> bool:
    return not (
        getattr(sale, 'customer_id', None)
        or getattr(sale, 'vendor_id', None)
        or getattr(sale, 'employee_id', None)
    )


@transaction.atomic
def auto_pay_walk_in_sale(sale, *, user=None):
    """
    Walk-in paid sales settle immediately as cash — no customer AR.

    Safe to call repeatedly: only pays the remaining unpaid balance.
    """
    if not is_walk_in_sale(sale):
        return None
    if getattr(sale, 'is_free', False) or sale.status in ('draft', 'cancelled'):
        return None

    total = Decimal(str(sale.total_amount or 0))
    if total <= 0:
        return None

    ct = ContentType.objects.get_for_model(sale)
    already = (
        Payment.objects.filter(content_type=ct, object_id=sale.pk).aggregate(
            total=Sum('amount'),
        )['total']
        or Decimal('0')
    )
    remaining = total - already
    if remaining <= 0:
        return None

    payment = Payment(
        content_type=ct,
        object_id=sale.pk,
        payment_type='sale',
        payment_method='cash',
        payment_date=sale.sale_date,
        amount=remaining,
        currency=sale.currency,
        notes='Walk-in cash sale (auto)',
    )
    populate_base_amounts(
        payment,
        amount_fields=['amount'],
        at_datetime=payment.payment_date,
        raise_if_missing=False,
    )
    payment.save()
    sync_order_paid_amount(sale)
    return payment
