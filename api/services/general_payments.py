"""One receipt for the exact cash amount; open bills settle from retained credit."""
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from api.models.data.customers import Customer
from api.models.data.vendors import Vendor
from api.models.data.sales import Sales
from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.payment import Payment, GeneralPayment

CENT = Decimal('0.01')


def lock_payment_party(order):
    """Use the same lock for general and bill payments, including different bills."""
    model, pk = (Customer, order.customer_id) if isinstance(order, Sales) and not order.vendor_id else (Vendor, order.vendor_id)
    model.objects.select_for_update().get(pk=pk)


def open_bills(payment_type, party_id, currency, *, lock=False, exclude_general_payment=None):
    if payment_type == 'sale':
        orders = Sales.objects.filter(
            customer_id=party_id, currency=currency, employee__isnull=True, vendor__isnull=True,
        ).exclude(status__in=['draft', 'cancelled'])
        date_field = 'sale_date'
    else:
        orders = RawMaterialPurchase.objects.filter(vendor_id=party_id, currency=currency, status='received')
        date_field = 'purchase_date'
    orders = orders.order_by(date_field, 'pk')
    if lock:
        orders = orders.select_for_update()
    orders = list(orders)
    ct = ContentType.objects.get_for_model(Sales if payment_type == 'sale' else RawMaterialPurchase)
    payments = Payment.objects.filter(content_type=ct, object_id__in=[o.pk for o in orders])
    if exclude_general_payment:
        payments = payments.exclude(general_payment_id=exclude_general_payment)
    paid = dict(payments.values('object_id').annotate(total=Sum('amount')).values_list('object_id', 'total'))
    return [(order, (max(Decimal('0'), order.total_amount - paid.get(order.pk, Decimal('0')))).quantize(CENT, rounding=ROUND_DOWN))
            for order in orders if order.total_amount - paid.get(order.pk, Decimal('0')) >= CENT]


def balance_data(payment_type, party_id, currency, exclude_general_payment=None):
    rows = open_bills(payment_type, party_id, currency, exclude_general_payment=exclude_general_payment)
    return {'total_due': sum((due for _, due in rows), Decimal('0')),
            'bills': [{'id': order.pk, 'invoice_number': order.invoice_number,
                       'date': getattr(order, 'sale_date' if payment_type == 'sale' else 'purchase_date'),
                       'remaining': due} for order, due in rows]}


def _remove_allocations(receipt):
    # Per-payment delete signals reverse journals and refresh each bill's paid total.
    for payment in receipt.allocations.all().order_by('pk'):
        payment.delete()


def _create_payment(receipt, order, amount, *, advance=False, credit_application=False):
    from api.services.accounting import sync_order_paid_amount
    bill_date = getattr(order, 'sale_date', getattr(order, 'purchase_date', receipt.payment_date))
    when = max(receipt.payment_date, bill_date) if credit_application else receipt.payment_date
    payment = Payment.objects.create(
        general_payment=receipt, content_object=order, payment_type=receipt.payment_type,
        is_advance=advance, is_credit_application=credit_application,
        payment_method=receipt.payment_method, payment_date=when,
        amount=amount, amount_base=(amount * receipt.exchange_rate).quantize(CENT, rounding=ROUND_HALF_UP),
        currency=receipt.currency, exchange_rate=receipt.exchange_rate,
        reference_number=receipt.reference_number or f'GPAY-{receipt.pk}', notes=receipt.notes,
    )
    if not advance:
        sync_order_paid_amount(order)
    return payment


@transaction.atomic
def save_general_payment(validated_data, instance=None):
    data = dict(validated_data)
    if instance:
        for field in ('payment_type', 'customer', 'vendor', 'currency'):
            if field in data and data[field] != getattr(instance, field):
                raise ValidationError({field: 'The party, payment type and currency cannot change. Delete this receipt and record a new payment.'})
    payment_type = data.get('payment_type', getattr(instance, 'payment_type', None))
    party = data.get('customer' if payment_type == 'sale' else 'vendor') or getattr(instance, 'customer' if payment_type == 'sale' else 'vendor', None)
    type(party).objects.select_for_update().get(pk=party.pk)
    if instance:
        instance = GeneralPayment.objects.select_for_update().get(pk=instance.pk)
        _remove_allocations(instance)
        for field, value in data.items():
            setattr(instance, field, value)
        receipt = instance
    else:
        receipt = GeneralPayment(**data)
    if receipt.amount <= 0:
        raise ValidationError({'amount': 'Enter an amount greater than zero.'})
    receipt.save()
    # Keep the cash movement exact: one on-account payment for the full amount.
    # Do not split cash across bills — bills are settled below as non-cash credit applications.
    _create_payment(receipt, receipt, receipt.amount, advance=True)
    receipt.amount_base = (
        receipt.allocations.filter(is_credit_application=False)
        .aggregate(total=Sum('amount_base'))['total']
    ) or Decimal('0')
    receipt.save(update_fields=['amount_base', 'updated_at'])
    for order, _ in open_bills(payment_type, party.pk, receipt.currency, lock=True):
        apply_credit_to_order(order)
    return receipt


@transaction.atomic
def delete_general_payment(instance):
    party = instance.customer if instance.payment_type == 'sale' else instance.vendor
    type(party).objects.select_for_update().get(pk=party.pk)
    receipt = GeneralPayment.objects.select_for_update().get(pk=instance.pk)
    _remove_allocations(receipt)
    receipt.delete()


@transaction.atomic
def apply_credit_to_order(order):
    """Use retained credit when a bill becomes payable; return it on cancellation.

    Invoice payments stay bounded by the invoice total. Applications transfer
    advances into AR/AP and never book another cash receipt or disbursement.
    """
    if isinstance(order, Sales) and order.vendor_id:
        return
    if not order.pk:
        return
    sale = isinstance(order, Sales)
    kind, party_field = ('sale', 'customer') if sale else ('purchase', 'vendor')
    party_id = getattr(order, party_field + '_id')
    ct = ContentType.objects.get_for_model(order)
    has_applications = Payment.objects.filter(content_type=ct, object_id=order.pk, is_credit_application=True).exists()
    if not has_applications and not Payment.objects.filter(is_advance=True, general_payment__payment_type=kind, **{'general_payment__' + party_field + '_id': party_id}).exists():
        return
    previous_parties = Payment.objects.filter(content_type=ct, object_id=order.pk, is_credit_application=True).values_list('general_payment__' + party_field + '_id', flat=True)
    party_model = Customer if sale else Vendor
    list(party_model.objects.select_for_update().filter(pk__in={party_id, *previous_parties}).order_by('pk'))
    order.refresh_from_db()
    applications = Payment.objects.filter(content_type=ct, object_id=order.pk, is_credit_application=True).order_by('-pk')
    eligible = order.deleted_at is None and (order.status not in ['draft', 'cancelled'] if sale else order.status == 'received')
    # Currency/party changes cannot carry an application into another account.
    for payment in list(applications.select_related('general_payment')):
        receipt = payment.general_payment
        if not eligible or receipt.currency != order.currency or getattr(receipt, party_field + '_id') != party_id:
            payment.delete()
        else:
            bill_date = getattr(order, 'sale_date' if sale else 'purchase_date')
            effective_date = max(receipt.payment_date, bill_date)
            payment.payment_date = effective_date
            payment.save(update_fields=['payment_date', 'updated_at'])
    paid = Payment.objects.filter(content_type=ct, object_id=order.pk).aggregate(total=Sum('amount'))['total'] or Decimal('0')
    excess = max(Decimal('0'), paid - max(Decimal('0'), order.total_amount).quantize(CENT, rounding=ROUND_DOWN))
    for payment in applications:
        if excess <= 0:
            break
        release = min(excess, payment.amount)
        if release == payment.amount:
            payment.delete()
        else:
            payment.amount -= release
            payment.amount_base = (payment.amount * payment.exchange_rate).quantize(CENT, rounding=ROUND_HALF_UP)
            payment.save(update_fields=['amount', 'amount_base', 'updated_at'])
        excess -= release
    if not eligible:
        return
    remaining = dict((o.pk, due) for o, due in open_bills(kind, party_id, order.currency, lock=True)).get(order.pk, Decimal('0'))
    if remaining <= 0:
        return
    receipts = GeneralPayment.objects.select_for_update().filter(payment_type=kind, currency=order.currency, **{party_field + '_id': party_id}).order_by('payment_date', 'pk')
    for receipt in receipts:
        amount = min(remaining, receipt.available_credit)
        if amount > 0:
            _create_payment(receipt, order, amount, credit_application=True)
            remaining -= amount
        if remaining <= 0:
            break
