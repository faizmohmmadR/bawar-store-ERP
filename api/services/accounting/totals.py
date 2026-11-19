"""Recalculate order totals and paid amounts."""
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType

from api.services.accounting.amounts import d


def recalculate_sale_totals(sale):
    from api.models.data.sales import Sales
    from api.utils.packaging import sales_item_line_total

    subtotal = sum(sales_item_line_total(item) for item in sale.sales_items.all())
    discount = (subtotal * d(sale.discount_percentage)) / Decimal('100')
    total = subtotal - discount
    from api.services.currency_conversion import populate_base_amounts

    sale.total_amount = total
    populate_base_amounts(
        sale,
        amount_fields=['total_amount', 'paid_amount'],
        at_datetime=sale.sale_date,
        raise_if_missing=True,
    )
    Sales.objects.filter(pk=sale.pk).update(
        total_amount=total,
        total_amount_base=sale.total_amount_base,
        paid_amount_base=getattr(sale, 'paid_amount_base', 0),
        exchange_rate=getattr(sale, 'exchange_rate', 1),
    )
    sale.total_amount = total
    return total


def recalculate_return_totals(return_order):
    from api.models.data.returns import Return
    from api.services.currency_conversion import populate_base_amounts

    total = sum(d(item.return_amount) for item in return_order.return_items.all())
    return_order.total_amount = total
    populate_base_amounts(
        return_order,
        amount_fields=['total_amount', 'refund_amount'],
        at_datetime=return_order.return_date,
        raise_if_missing=True,
    )
    Return.objects.filter(pk=return_order.pk).update(
        total_amount=total,
        total_amount_base=return_order.total_amount_base,
        refund_amount_base=getattr(return_order, 'refund_amount_base', 0),
        exchange_rate=getattr(return_order, 'exchange_rate', 1),
    )
    return_order.total_amount = total
    return total


def sync_order_paid_amount(order):
    """Recalculate paid_amount for sales (and other payment-linked orders)."""
    from django.db.models import Sum
    from api.models.data.payment import Payment
    from api.services.currency_conversion import _quantize_money

    content_type = ContentType.objects.get_for_model(order)
    total_paid = Payment.objects.filter(
        content_type=content_type,
        object_id=order.pk,
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    total_paid_base = Payment.objects.filter(
        content_type=content_type,
        object_id=order.pk,
    ).aggregate(total=Sum('amount_base'))['total'] or Decimal('0')

    update_fields = {'paid_amount': total_paid}
    if hasattr(order, 'paid_amount_base'):
        update_fields['paid_amount_base'] = _quantize_money(total_paid_base)

    order.__class__.objects.filter(pk=order.pk).update(**update_fields)
    order.paid_amount = total_paid
    if hasattr(order, 'paid_amount_base'):
        order.paid_amount_base = _quantize_money(total_paid_base)
    return total_paid
