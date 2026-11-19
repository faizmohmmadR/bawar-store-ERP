"""Recorded customer deposits at cutoff, separate from invoice applications."""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.payment import GeneralPayment, Payment
from api.models.data.sales import Sales
from .invoices import string4

ZERO = Decimal('0')


def customer_advance_balances(scope):
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Customer deposits require complete receipt allocations.'})
    types = dict(ContentType.objects.filter(app_label='api', model__in=['generalpayment', 'sales']).values_list('model', 'pk'))
    headers = GeneralPayment.objects.filter(payment_type='sale').select_related('customer')
    if scope.currency is not None:
        headers = headers.filter(currency=scope.currency)
    if scope.end_date:
        headers = headers.filter(payment_date__lte=scope.end_date)
    allocations = Payment.objects.filter(general_payment_id__in=headers.values('pk'))
    if scope.end_date:
        allocations = allocations.filter(payment_date__lte=scope.end_date)
    grouped = defaultdict(list)
    for payment in allocations.iterator(chunk_size=1000):
        grouped[payment.general_payment_id].append(payment)
    targets = Sales.all_objects.filter(pk__in=allocations.filter(
        content_type_id=types.get('sales'), is_credit_application=True).values('object_id')).in_bulk()
    rows, parties = [], {}
    cutoff = scope.start_date - timedelta(microseconds=1) if scope.start_date else None
    for header in headers.iterator(chunk_size=1000):
        errors, advances, applied = [], [], []
        if header.source_sale_id:
            errors.append('unexpected_customer_goods_credit')
        for payment in grouped[header.pk]:
            if payment.currency != header.currency or payment.payment_type != 'sale' or payment.amount <= 0:
                errors.append('invalid_allocation_currency_type_or_amount')
                continue
            if payment.is_advance and not payment.is_credit_application:
                if payment.content_type_id != types.get('generalpayment') or payment.object_id != header.pk:
                    errors.append('invalid_advance_target')
                    continue
                advances.append(payment)
                if payment.payment_method != header.payment_method:
                    errors.append('receipt_payment_method_mismatch')
            elif payment.is_credit_application and not payment.is_advance:
                sale = targets.get(payment.object_id) if payment.content_type_id == types.get('sales') else None
                if (sale is None or sale.deleted_at or sale.customer_id != header.customer_id
                        or sale.currency != header.currency or sale.status in ('draft', 'cancelled')
                        or sale.employee_id or sale.vendor_id or sale.is_free):
                    errors.append('invalid_credit_application_target')
                    continue
                if payment.payment_date < sale.sale_date:
                    errors.append('application_before_invoice')
                applied.append(payment)
            else:
                errors.append('invalid_credit_flags')
            if payment.payment_date < header.payment_date:
                errors.append('allocation_before_receipt')
        received = sum((p.amount for p in advances), ZERO)
        used = sum((p.amount for p in applied), ZERO)
        if len(advances) != 1 or received != header.amount:
            errors.append('receipt_allocation_mismatch')
        if used > received:
            errors.append('credit_overapplied')
        def unused(at):
            if at is not None and header.payment_date > at:
                return ZERO
            return (sum((p.amount for p in advances if at is None or p.payment_date <= at), ZERO)
                    - sum((p.amount for p in applied if at is None or p.payment_date <= at), ZERO))
        closing, opening = unused(None), unused(cutoff) if cutoff else ZERO
        p = parties.setdefault((header.customer_id, header.currency), dict(customer_id=header.customer_id,
            customer_name=header.customer.name, currency_id=header.currency, opening=ZERO, closing=ZERO, issue_count=0))
        p['opening'] += opening
        p['closing'] += closing
        p['issue_count'] += len(set(errors))
        rows.append(dict(receipt_id=header.pk, customer_id=header.customer_id, currency_id=header.currency,
            payment_method=header.payment_method, received_amount=string4(received), applied_amount=string4(used),
            opening_balance=string4(opening), period_change=string4(closing - opening), closing_balance=string4(closing),
            allocation_ids=[payment.pk for payment in grouped[header.pk]], issues=sorted(set(errors))))
    unlinked = Payment.objects.filter(payment_type='sale', is_advance=True, general_payment_id=None)
    if scope.currency is not None:
        unlinked = unlinked.filter(currency=scope.currency)
    if scope.end_date:
        unlinked = unlinked.filter(payment_date__lte=scope.end_date)
    return dict(meta={**scope.metadata(), 'report': 'customer_advance_balances', 'source': 'customer_receipts_and_allocations',
                      'amount_scale': 4, 'sign_convention': 'positive_unused_customer_credit'},
        status='unverified_customer_advance_positions', rows=rows,
        parties=[dict(customer_id=p['customer_id'], customer_name=p['customer_name'], currency_id=p['currency_id'],
            opening_balance=string4(p['opening']), closing_balance=string4(p['closing']),
            period_change=string4(p['closing'] - p['opening']), issue_count=p['issue_count']) for p in parties.values()],
        unlinked_advance_count=unlinked.count(),
        limitations=['Recorded customer deposits only; invalid allocations are flagged and are not certified.',
                    'Unlinked advance payments are counted but not assigned to a customer by guesswork.',
                    'Negative unused credit remains visible when overapplied; current edits/deletions are not reconstructed.'])
