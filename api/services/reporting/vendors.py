"""Native supplier positions: received bills minus settlement and unused credit.

Supplier goods/returns fund a GeneralPayment credit. Applied credit reduces the
bill; only UNUSED credit reduces the remaining party balance, preventing a
supplier return from being deducted twice. No arbitrary bill allocation occurs.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.raw_materials import RawMaterialPurchase
from api.models.data.payment import GeneralPayment, Payment
from api.models.data.sales import Sales
from .invoices import string4
from .settlements import q

ZERO = Decimal('0')


def vendor_invoice_balances(scope):
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Supplier positions require complete documents.'})
    types = dict(ContentType.objects.filter(app_label='api', model__in=['rawmaterialpurchase', 'generalpayment']).values_list('model', 'pk'))
    purchases = RawMaterialPurchase.objects.filter(status='received').select_related('vendor')
    headers = GeneralPayment.objects.filter(payment_type='purchase').select_related('vendor', 'source_sale')
    returns = Sales.objects.filter(vendor__isnull=False, vendor_transaction='purchase_return').exclude(status__in=['draft', 'cancelled']).select_related('vendor')
    for name, query, date in (('purchases', purchases, 'purchase_date'), ('headers', headers, 'payment_date'), ('returns', returns, 'sale_date')):
        if scope.currency is not None:
            query = query.filter(currency=scope.currency)
        if scope.end_date:
            query = query.filter(**{f'{date}__lte': scope.end_date})
        if name == 'purchases':
            purchases = query
        elif name == 'headers':
            headers = query
        else:
            returns = query
    bills = {bill.pk: bill for bill in purchases.iterator(chunk_size=1000)}
    selected_headers = {header.pk: header for header in headers.iterator(chunk_size=1000)}
    bill_payments = Payment.objects.filter(payment_type='purchase', is_advance=False,
        content_type_id=types.get('rawmaterialpurchase'), object_id__in=bills) if types.get('rawmaterialpurchase') else Payment.objects.none()
    allocations = Payment.objects.filter(general_payment_id__in=selected_headers)
    if scope.end_date:
        bill_payments = bill_payments.filter(payment_date__lte=scope.end_date)
        allocations = allocations.filter(payment_date__lte=scope.end_date)
    by_bill, by_header = defaultdict(list), defaultdict(list)
    for payment in bill_payments.select_related('general_payment').iterator(chunk_size=1000):
        by_bill[payment.object_id].append(payment)
    for payment in allocations.iterator(chunk_size=1000):
        by_header[payment.general_payment_id].append(payment)
    opening_at = scope.start_date - timedelta(microseconds=1) if scope.start_date else None
    parties, rows, credit_rows, return_rows = {}, [], [], []

    def party(vendor, cid):
        return parties.setdefault((vendor.pk, cid), dict(vendor_id=vendor.pk, vendor_name=vendor.name,
            currency_id=cid, opening=ZERO, bills=ZERO, unused_credit=ZERO, issue_count=0))

    for bill in bills.values():
        errors, valid = [], []
        for payment in by_bill[bill.pk]:
            header = payment.general_payment
            eligible = payment.currency == bill.currency and payment.amount > 0
            if header is not None and (header.deleted_at or header.currency != bill.currency or header.vendor_id != bill.vendor_id or header.payment_type != 'purchase'):
                eligible = False
            if payment.is_credit_application and (header is None or header.pk not in selected_headers):
                eligible = False
            if not eligible:
                errors.append('invalid_bill_payment_or_credit_header')
            else:
                valid.append(payment)
            if payment.payment_method == 'intermediary_credit':
                errors.append('intermediary_credit_requires_loan_reconciliation')
        def balance(cutoff):
            if cutoff is not None and bill.purchase_date > cutoff:
                return ZERO
            return bill.total_amount - sum((p.amount for p in valid if cutoff is None or p.payment_date <= cutoff), ZERO)
        closing, opening = balance(None), balance(opening_at) if opening_at else ZERO
        p = party(bill.vendor, bill.currency)
        p['bills'] += closing
        p['opening'] += opening
        p['issue_count'] += len(set(errors))
        rows.append(dict(purchase_id=bill.pk, invoice_number=bill.invoice_number, vendor_id=bill.vendor_id,
            currency_id=bill.currency, invoice_amount=string4(bill.total_amount), settled_amount=string4(bill.total_amount - closing),
            opening_balance=string4(opening), period_change=string4(closing - opening), closing_balance=string4(closing),
            payment_ids=[payment.pk for payment in valid], issues=sorted(set(errors))))

    source_receipts = defaultdict(list)
    for header in selected_headers.values():
        p = party(header.vendor, header.currency)
        errors, advances, applications = [], [], []
        if header.source_sale_id:
            source_receipts[header.source_sale_id].append(header.pk)
            origin = header.source_sale
            if (origin.deleted_at or origin.status in ('draft', 'cancelled') or origin.vendor_id != header.vendor_id
                    or origin.currency != header.currency or origin.is_free or origin.total_amount <= 0
                    or q(origin.total_amount) != header.amount
                    or origin.sale_date > header.payment_date
                    or (scope.end_date and origin.sale_date > scope.end_date)):
                errors.append('invalid_supplier_goods_credit_origin')
        for payment in by_header[header.pk]:
            if payment.currency != header.currency or payment.payment_type != 'purchase' or payment.amount <= 0:
                errors.append('invalid_credit_allocation')
                continue
            if payment.is_advance and not payment.is_credit_application:
                if payment.content_type_id != types.get('generalpayment') or payment.object_id != header.pk:
                    errors.append('invalid_advance_target')
                    continue
                advances.append(payment)
            elif payment.is_credit_application and not payment.is_advance:
                target = bills.get(payment.object_id) if payment.content_type_id == types.get('rawmaterialpurchase') else None
                if target is None or target.vendor_id != header.vendor_id or target.currency != header.currency:
                    errors.append('invalid_credit_application_target')
                    continue
                applications.append(payment)
            else:
                errors.append('invalid_credit_flags')
            if payment.payment_date < header.payment_date:
                errors.append('allocation_before_receipt')
        received = sum((p.amount for p in advances), ZERO)
        applied = sum((p.amount for p in applications), ZERO)
        if received != header.amount or len(advances) != 1:
            errors.append('credit_receipt_allocation_mismatch')
        if applied > received:
            errors.append('credit_overapplied')
        def unused(cutoff):
            if cutoff is not None and header.payment_date > cutoff:
                return ZERO
            return (sum((p.amount for p in advances if cutoff is None or p.payment_date <= cutoff), ZERO)
                    - sum((p.amount for p in applications if cutoff is None or p.payment_date <= cutoff), ZERO))
        remaining = unused(None)
        p['unused_credit'] += remaining
        p['opening'] -= unused(opening_at) if opening_at else ZERO
        p['issue_count'] += len(set(errors))
        credit_rows.append(dict(receipt_id=header.pk, vendor_id=header.vendor_id, currency_id=header.currency,
            source_sale_id=header.source_sale_id,
            origin=('purchase_return' if header.source_sale.vendor_transaction == 'purchase_return' else 'supplier_goods_sale') if header.source_sale_id else 'money_advance',
            received_amount=string4(received), applied_amount=string4(applied), unused_amount=string4(remaining),
            allocation_ids=[payment.pk for payment in by_header[header.pk]], issues=sorted(set(errors))))
    for doc in returns.iterator(chunk_size=1000):
        errors = [] if source_receipts[doc.pk] or doc.total_amount == 0 else ['purchase_return_without_credit_receipt']
        p = party(doc.vendor, doc.currency)
        p['issue_count'] += len(errors)
        return_rows.append(dict(sale_id=doc.pk, vendor_id=doc.vendor_id, currency_id=doc.currency,
            amount=string4(doc.total_amount), receipt_ids=source_receipts[doc.pk], issues=errors))
    return {
        'meta': {**scope.metadata(), 'report': 'vendor_invoice_balances', 'source': 'purchase_invoices_and_supplier_credit',
                 'amount_scale': 4, 'scope_note': 'All received bills and retained supplier credits through cutoff.'},
        'status': 'unverified_invoice_positions', 'rows': rows, 'credits': credit_rows, 'purchase_returns': return_rows,
        'parties': [dict(vendor_id=p['vendor_id'], vendor_name=p['vendor_name'], currency_id=p['currency_id'],
            opening_balance=string4(p['opening']), outstanding_bills=string4(p['bills']), unused_credit=string4(p['unused_credit']),
            closing_balance=string4(p['bills'] - p['unused_credit']),
            period_change=string4(p['bills'] - p['unused_credit'] - p['opening']),
            payable=string4(max(p['bills'] - p['unused_credit'], ZERO)),
            supplier_credit=string4(max(p['unused_credit'] - p['bills'], ZERO)), issue_count=p['issue_count']) for p in parties.values()],
        'limitations': ['Invoice/retained-credit positions only; loans, manual GL adjustments and direct payments on pending purchases are excluded.',
                        'Purchase returns fund supplier credit, not an arbitrary bill allocation; missing credit receipts are flagged, not invented.',
                        'Current state cannot reconstruct historical edits/deletions; inspect reconciliation issues before relying on balances.'],
    }
