"""Item/return checks and native customer invoice positions at a cutoff.

No legacy report sums or cached paid amounts are used. These are invoice
positions, not a certified GL/customer statement (loans and manual GL entries
remain separate). Legacy return pricing is explicitly a review item.
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from api.models.data.sales import Sales, SalesItems
from api.models.data.raw_materials import RawMaterialPurchase, RawMaterialPurchaseItem
from api.models.data.returns import Return, ReturnItems
from api.models.data.payment import Payment
from api.models.data.journal import JournalLine
from api.utils.date_filters import apply_date_range
from .settlements import compare, leg, rate, q

ZERO = Decimal('0')
FOUR = Decimal('0.0001')


def amount4(value):
    return Decimal(value).quantize(FOUR, rounding=ROUND_HALF_UP)


def string4(value):
    return format(amount4(value), '.4f')


def invoice_reconciliation(scope):
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Invoice checks require the whole document.'})
    findings, checked = [], 0

    def finding(model, pk, errors, review=False):
        if errors:
            findings.append({'source_model': model, 'source_id': pk,
                             'kind': 'requires_review' if review else 'invoice_mismatch',
                             'errors': sorted(set(errors))})

    for model, item_model, parent, date in (
        (Sales, SalesItems, 'sales', 'sale_date'),
        (RawMaterialPurchase, RawMaterialPurchaseItem, 'purchase', 'purchase_date'),
    ):
        docs = apply_date_range(model.objects.all(), date, scope.start_date, scope.end_date)
        if scope.currency is not None:
            docs = docs.filter(currency=scope.currency)
        items = defaultdict(list)
        for item in item_model.objects.filter(**{f'{parent}_id__in': docs.values('pk')}).iterator(chunk_size=1000):
            items[getattr(item, f'{parent}_id')].append(item)
        for doc in docs.iterator(chunk_size=1000):
            checked += 1
            rows, errors, review = items[doc.pk], [], False
            if not rows:
                finding(doc._meta.model_name, doc.pk, ['missing_invoice_items'], True)
                continue
            subtotal = ZERO
            for row in rows:
                price = row.sell_price if model is Sales else row.price_per_unit
                if row.quantity <= 0 or price < 0:
                    errors.append('invalid_item_quantity_or_price')
                if model is Sales and row.quantity <= 0:
                    # Never infer old carton quantities from today's packaging.
                    review = True
                    errors.append('historical_quantity_basis_missing')
                value = amount4(row.quantity * price)
                subtotal += value
                if model is RawMaterialPurchase and row.total_price != value:
                    errors.append('purchase_line_total_mismatch')
                if doc.is_free and price != 0:
                    errors.append('free_item_nonzero_price')
            discount = doc.discount_percentage if model is Sales else ZERO
            if not ZERO <= discount <= Decimal('100'):
                errors.append('invalid_discount_percentage')
            expected = ZERO if doc.is_free else amount4(subtotal * (1 - discount / 100))
            if doc.total_amount != expected and not review:
                errors.append('invoice_total_mismatch')
            finding(doc._meta.model_name, doc.pk, errors, review)

    returns = apply_date_range(Return.objects.select_related('sales'), 'return_date', scope.start_date, scope.end_date)
    if scope.currency is not None:
        returns = returns.filter(currency=scope.currency)
    return_items = defaultdict(list)
    for item in ReturnItems.objects.filter(return_order_id__in=returns.values('pk')).select_related('sales_item').iterator(chunk_size=1000):
        return_items[item.return_order_id].append(item)
    # Cumulative quantities include earlier returns, excluding future and deleted
    # headers; per-document selection must not reset an item's returned quantity.
    all_returns = ReturnItems.objects.filter(return_order__deleted_at__isnull=True,
        sales_item_id__in=ReturnItems.objects.filter(return_order_id__in=returns.values('pk')).values('sales_item_id'))
    if scope.end_date:
        all_returns = all_returns.filter(return_order__return_date__lte=scope.end_date)
    cumulative = defaultdict(lambda: ZERO)
    for row in all_returns.select_related('sales_item').iterator(chunk_size=1000):
        cumulative[row.sales_item_id] += row.quantity_kg if row.sales_item.unit == 'kg' else row.liter_amount
    ct = ContentType.objects.filter(app_label='api', model='return').values_list('pk', flat=True).first()
    postings = defaultdict(list)
    if ct is not None:
        lines = JournalLine.objects.filter(journal_entry__content_type_id=ct,
            journal_entry__object_id__in=returns.values('pk'), journal_entry__deleted_at__isnull=True)
        if scope.end_date:
            lines = lines.filter(journal_entry__entry_date__lte=scope.end_date)
        for line in lines.select_related('journal_entry', 'gl_account').iterator(chunk_size=1000):
            postings[line.journal_entry.object_id].append(line)
    for doc in returns.iterator(chunk_size=1000):
        checked += 1
        errors, review = [], False
        rows, sale = return_items[doc.pk], doc.sales
        if sale.deleted_at or sale.status in ('draft', 'cancelled') or sale.vendor_id or sale.sale_date > doc.return_date:
            errors.append('invalid_return_sale')
        if doc.currency != sale.currency:
            errors.append('return_currency_mismatch')
        if doc.currency != 1 and doc.exchange_rate != sale.exchange_rate:
            review = True
            errors.append('foreign_return_carrying_rate_requires_review')
        if doc.total_amount < 0 or doc.refund_amount < 0 or doc.refund_amount > doc.total_amount:
            errors.append('invalid_return_or_refund_amount')
        if not rows:
            errors.append('missing_return_items')
        if sum((row.return_amount for row in rows), ZERO) != doc.total_amount:
            errors.append('return_header_total_mismatch')
        for row in rows:
            original = row.sales_item
            if original.sales_id != doc.sales_id or original.deleted_at:
                errors.append('return_item_wrong_or_deleted_sale_line')
            qty = row.quantity_kg if original.unit == 'kg' else row.liter_amount
            limit = original.quantity if original.unit == 'kg' else original.liter_amount
            if qty <= 0 or cumulative[original.pk] > limit:
                errors.append('return_quantity_exceeds_sale_or_is_invalid')
            if original.sale_source == 'raw_material' or original.unit == 'kg':
                if q(qty * row.return_price) != row.return_amount:
                    errors.append('return_line_amount_mismatch')
            else:
                # Legacy return_price uses a fixed carton convention, not a
                # saved selected-unit price. Do not certify its valuation.
                review = True
                errors.append('legacy_return_price_basis_requires_review')
        if sale.is_free:
            if doc.total_amount or doc.refund_amount:
                errors.append('free_sale_return_has_money')
            review = True  # Inventory restoration is checked in the inventory phase.
            errors.append('free_return_inventory_review_required')
        elif sale.employee_id:
            review = True
            errors.append('goods_return_payroll_reversal_requires_review')
        else:
            try:
                fx = rate(doc, doc.currency)
                expected = []
                if doc.total_amount:
                    expected.append(leg('4100', doc.currency, doc.total_amount, fx, True))
                if doc.total_amount > doc.refund_amount:
                    expected.append(leg('1200', doc.currency, doc.total_amount - doc.refund_amount, fx, False))
                if doc.refund_amount:
                    expected.append(leg('1000', doc.currency, doc.refund_amount, fx, False))
                errors += compare(postings[doc.pk], expected, ignored_codes=('1100', '5200', '5220'))
                if doc.total_amount_base != q(doc.total_amount * fx) or doc.refund_amount_base != q(doc.refund_amount * fx):
                    errors.append('return_base_snapshot_mismatch')
            except ValueError as exc:
                errors.append(str(exc))
                review = True
        finding('return', doc.pk, errors, review)
    return {'meta': {**scope.metadata(), 'report': 'invoice_reconciliation', 'source': 'invoice_items_and_journal_lines'},
            'checked_count': checked, 'finding_count': len(findings), 'findings': findings,
            'status': 'review_required' if findings else 'supported_invoice_checks_passed',
            'limitations': ['Legacy return price basis and goods payroll reversal need review.',
                            'Return inventory/COGS and actual delivered quantities are not certified.']}


def customer_invoice_balances(scope):
    if scope.account_id is not None:
        raise ValidationError({'account_id': 'Invoice positions do not filter by GL account.'})
    sales = Sales.objects.filter(customer__isnull=False).exclude(status__in=['draft', 'cancelled']).select_related('customer')
    if scope.currency is not None:
        sales = sales.filter(currency=scope.currency)
    if scope.end_date:
        sales = sales.filter(sale_date__lte=scope.end_date)
    ct = ContentType.objects.filter(app_label='api', model='sales').values_list('pk', flat=True).first()
    payments = Payment.objects.filter(content_type_id=ct, object_id__in=sales.values('pk'), payment_type='sale', is_advance=False) if ct else Payment.objects.none()
    returns = Return.objects.filter(sales_id__in=sales.values('pk'))
    if scope.end_date:
        payments = payments.filter(payment_date__lte=scope.end_date)
        returns = returns.filter(return_date__lte=scope.end_date)
    paid, returned = defaultdict(list), defaultdict(list)
    for payment in payments.select_related('general_payment').iterator(chunk_size=1000):
        paid[payment.object_id].append(payment)
    for doc in returns.iterator(chunk_size=1000):
        returned[doc.sales_id].append(doc)
    rows, parties = [], {}
    for sale in sales.iterator(chunk_size=1000):
        errors = []
        ps = [p for p in paid[sale.pk] if p.currency == sale.currency and (not p.general_payment_id or not p.general_payment.deleted_at)]
        rs = [r for r in returned[sale.pk] if r.currency == sale.currency]
        if len(ps) != len(paid[sale.pk]) or len(rs) != len(returned[sale.pk]):
            errors.append('invalid_currency_or_deleted_payment_header')
        if any(r.refund_amount < 0 or r.total_amount < r.refund_amount for r in rs):
            errors.append('invalid_return_refund')
        if any(p.amount <= 0 for p in ps):
            errors.append('invalid_payment_amount')
        if any(p.is_credit_application and (
            not p.general_payment_id or p.general_payment.currency != sale.currency
            or p.general_payment.customer_id != sale.customer_id
            or p.general_payment.payment_type != 'sale'
        ) for p in ps):
            errors.append('invalid_credit_application_header')
        if any(p.payment_method == 'intermediary_credit' for p in ps):
            errors.append('intermediary_settlement_requires_review')
        if any(r.return_date < sale.sale_date for r in rs):
            errors.append('return_before_invoice')
        if sale.is_free and (sale.total_amount != 0 or ps or any(r.total_amount or r.refund_amount for r in rs)):
            errors.append('free_invoice_has_money')
        def balance(cutoff=None):
            if cutoff is not None and sale.sale_date > cutoff:
                return ZERO
            receipts = sum((p.amount for p in ps if cutoff is None or p.payment_date <= cutoff), ZERO)
            credits = sum((r.total_amount - r.refund_amount for r in rs if cutoff is None or r.return_date <= cutoff), ZERO)
            return sale.total_amount - receipts - credits
        opening = balance(scope.start_date - timedelta(microseconds=1)) if scope.start_date else ZERO
        closing = balance()
        total_paid = sum((p.amount for p in ps), ZERO)
        total_returned = sum((r.total_amount for r in rs), ZERO)
        if total_returned > sale.total_amount:
            errors.append('returned_value_exceeds_invoice')
        refunds = sum((r.refund_amount for r in rs), ZERO)
        party = parties.setdefault((sale.customer_id, sale.currency), dict(customer_id=sale.customer_id,
            customer_name=sale.customer.name, currency_id=sale.currency, opening=ZERO, closing=ZERO, issue_count=0))
        party['opening'] += opening
        party['closing'] += closing
        party['issue_count'] += len(errors)
        rows.append({'sale_id': sale.pk, 'invoice_number': sale.invoice_number, 'customer_id': sale.customer_id,
                     'currency_id': sale.currency, 'invoice_amount': string4(sale.total_amount),
                     'settled_amount': string4(total_paid), 'returned_amount': string4(total_returned),
                     'refunded_amount': string4(refunds), 'opening_balance': string4(opening),
                     'period_change': string4(closing - opening), 'closing_balance': string4(closing),
                     'payment_ids': [p.pk for p in ps], 'return_ids': [r.pk for r in rs],
                     'issues': errors})
    return {'meta': {**scope.metadata(), 'report': 'customer_invoice_balances', 'source': 'invoices_payments_returns',
                     'amount_scale': 4, 'scope_note': 'All customer invoices through cutoff, including before start.'},
            'status': 'unverified_invoice_positions', 'rows': rows,
            'parties': [{'customer_id': p['customer_id'], 'customer_name': p['customer_name'], 'currency_id': p['currency_id'],
                         'opening_balance': string4(p['opening']), 'closing_balance': string4(p['closing']),
                         'issue_count': p['issue_count'],
                         'receivable': string4(max(p['closing'], ZERO)), 'customer_credit': string4(max(-p['closing'], ZERO))}
                        for p in parties.values()],
            'limitations': ['Invoice-only native balances; loans, manual GL adjustments and unapplied deposits are excluded.',
                            'Current document state cannot reconstruct historical edits/deletions.',
                            'Stored return amounts are used; inspect invoice-reconciliation findings before relying on balances.']}
