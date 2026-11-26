"""Payment-linked sales and purchase invoice reporting."""
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q, Sum

from api.models.data.currency import BASE_CURRENCY_ID
from api.models.data.payment import Payment
from api.utils.date_filters import apply_date_range

FOUR = Decimal('0.0001')
ZERO = Decimal('0')


def _money(value):
    return max(Decimal(str(value or 0)), ZERO)


def invoice_balances(queryset, end_date=None):
    """Yield invoice, native paid/unpaid, and booked AFN paid/unpaid at cutoff.

    Settlement matches the sales/purchases list:
      billed = invoice total (falls back to paid when total was never stored)
      paid   = payments up to cutoff, else denormalized paid_amount
      unpaid = billed - paid

    Allocating the invoice's booked AFN value keeps total = paid + unpaid
    despite settlement FX. Actual payment-date cash is reported separately.
    """
    ct = ContentType.objects.get_for_model(queryset.model)
    payments = apply_date_range(
        Payment.objects.filter(content_type=ct, object_id__in=queryset.values('pk')),
        'payment_date', None, end_date,
    )
    paid_rows = payments.values('object_id').annotate(
        paid=Sum('amount'),
        paid_base=Sum('amount_base'),
    )
    paid_by_id = {
        row['object_id']: (_money(row['paid']), _money(row['paid_base']))
        for row in paid_rows
    }
    for invoice in queryset:
        stored_total = _money(invoice.total_amount)
        paid_field = _money(getattr(invoice, 'paid_amount', 0))
        pay_native, pay_base_sum = paid_by_id.get(invoice.pk, (ZERO, ZERO))
        # Prefer payment ledger; fall back to denormalized paid_amount (list UI).
        paid_native = pay_native if pay_native > 0 else paid_field

        # Broken/legacy rows sometimes store payments but leave total_amount=0.
        # Use paid as the bill so list paid/unpaid and the report stay aligned.
        total = stored_total if stored_total > 0 else paid_native
        if total <= 0 and paid_native <= 0:
            continue

        paid = min(paid_native, total)
        # Vendor-party sales settle supplier credit — never customer AR.
        if getattr(invoice, 'vendor_id', None) and invoice._meta.model_name == 'sales':
            paid = total
        unpaid = total - paid

        currency_id = int(getattr(invoice, 'currency', BASE_CURRENCY_ID) or BASE_CURRENCY_ID)
        total_base = _money(getattr(invoice, 'total_amount_base', 0))
        if not total_base:
            # Missing base: AFN uses native; otherwise scale from exchange_rate.
            if currency_id == BASE_CURRENCY_ID:
                total_base = total
            else:
                rate = _money(getattr(invoice, 'exchange_rate', 1) or 1) or Decimal('1')
                total_base = (total * rate).quantize(FOUR, rounding=ROUND_HALF_UP)
        elif stored_total <= 0 and total > 0:
            # Total was inferred from payments — keep base in the same units.
            if currency_id == BASE_CURRENCY_ID:
                total_base = total
            elif pay_base_sum > 0:
                total_base = pay_base_sum
            else:
                rate = _money(getattr(invoice, 'exchange_rate', 1) or 1) or Decimal('1')
                total_base = (total * rate).quantize(FOUR, rounding=ROUND_HALF_UP)

        if total > 0:
            paid_base = (total_base * paid / total).quantize(FOUR, rounding=ROUND_HALF_UP)
        else:
            paid_base = ZERO
        # AFN payments often have amount_base=0; keep collected non-zero.
        if paid > 0 and paid_base <= 0 and currency_id == BASE_CURRENCY_ID:
            paid_base = paid
        elif paid > 0 and paid_base <= 0 and pay_base_sum > 0:
            paid_base = min(pay_base_sum, total_base)

        yield invoice, paid, unpaid, paid_base, total_base - paid_base


def order_payment_queryset(queryset):
    ct = ContentType.objects.get_for_model(queryset.model)
    return Payment.objects.filter(content_type=ct, object_id__in=queryset.values('pk'))


def trade_summary(
    period_orders,
    all_orders,
    start_date=None,
    end_date=None,
    *,
    native=False,
    currency=None,
):
    summary = {
        key: ZERO
        for key in (
            'total',
            'paid',
            'unpaid',
            'payments_in_period',
            'payments_for_period_invoices',
            'payments_for_other_invoices',
            'credit_settlements_in_period',
        )
    }
    summary.update(
        count=0, paid_count=0, partial_count=0, unpaid_count=0, free_count=0,
    )
    for invoice, paid, unpaid, paid_base, unpaid_base in invoice_balances(period_orders, end_date):
        if getattr(invoice, 'is_free', False):
            # Free invoices are tracked separately — never mix into billed/settlement.
            summary['free_count'] += 1
            continue
        billed_native = paid + unpaid
        billed_base = paid_base + unpaid_base
        if billed_native <= 0 and billed_base <= 0:
            continue
        summary['count'] += 1
        summary['total'] += billed_native if native else billed_base
        summary['paid'] += paid if native else paid_base
        summary['unpaid'] += unpaid if native else unpaid_base
        status = 'paid' if unpaid <= 0 else 'unpaid' if paid <= 0 else 'partial'
        summary[f'{status}_count'] += 1

    # Cash flow includes payments on older invoices, but never orphaned/deleted orders.
    payments = apply_date_range(
        order_payment_queryset(all_orders), 'payment_date', start_date, end_date,
    )
    field = 'amount' if native else 'amount_base'
    cash = payments.exclude(payment_method='intermediary_credit').filter(
        is_credit_application=False,
        general_payment__source_sale__isnull=True,
    )
    kind = 'sale' if all_orders.model._meta.model_name == 'sales' else 'purchase'
    advances = Payment.objects.filter(
        is_advance=True,
        payment_type=kind,
        general_payment__source_sale__isnull=True,
    )
    if currency is not None:
        advances = advances.filter(currency=currency)
    advances = apply_date_range(advances, 'payment_date', start_date, end_date)
    advance_total = advances.aggregate(total=Sum(field))['total'] or ZERO
    period_cash = cash.filter(object_id__in=period_orders.values('pk'))
    summary['payments_in_period'] = (
        (cash.aggregate(total=Sum(field))['total'] or ZERO) + advance_total
    )
    summary['payments_for_period_invoices'] = (
        period_cash.aggregate(total=Sum(field))['total'] or ZERO
    )
    summary['payments_for_other_invoices'] = (
        summary['payments_in_period'] - summary['payments_for_period_invoices']
    )
    summary['credit_settlements_in_period'] = payments.filter(
        Q(payment_method='intermediary_credit') | Q(is_credit_application=True)
    ).aggregate(total=Sum(field))['total'] or ZERO
    return {
        key: float(value) if isinstance(value, Decimal) else value
        for key, value in summary.items()
    }


def get_trade_report(start_date=None, end_date=None, *, currency=None):
    """Sales + purchases invoice settlement summary for reports."""
    from api.models.data.purchases import Purchase
    from api.models.data.returns import Return
    from api.models.data.sales import Sales

    sales = Sales.objects.exclude(status__in=['draft', 'cancelled'])
    purchases = Purchase.objects.exclude(status__in=['draft', 'cancelled'])
    if currency is not None:
        sales = sales.filter(currency=currency)
        purchases = purchases.filter(currency=currency)

    period_sales = apply_date_range(sales, 'sale_date', start_date, end_date)
    period_purchases = apply_date_range(
        purchases.filter(status='received'), 'purchase_date', start_date, end_date,
    )
    result = {
        'sales': trade_summary(
            period_sales, sales, start_date, end_date,
            native=currency is not None, currency=currency,
        ),
        'purchases': trade_summary(
            period_purchases, purchases, start_date, end_date,
            native=currency is not None, currency=currency,
        ),
    }

    returns = apply_date_range(
        Return.objects.filter(sales__deleted_at__isnull=True),
        'return_date', start_date, end_date,
    )
    if currency is not None:
        returns = returns.filter(currency=currency)
    field = 'total_amount' if currency is not None else 'total_amount_base'
    result['purchases']['returns_in_period'] = 0.0
    result['purchases']['net_invoiced_in_period'] = (
        result['purchases']['total'] - result['purchases']['returns_in_period']
    )
    result['sales']['returns_in_period'] = float(
        returns.aggregate(total=Sum(field))['total'] or 0
    )
    result['sales']['net_invoiced_in_period'] = (
        result['sales']['total'] - result['sales']['returns_in_period']
    )
    return result


def purchase_totals(start_date=None, end_date=None):
    from api.models.data.purchases import Purchase

    qs = Purchase.objects.exclude(status__in=['draft', 'cancelled'])
    if start_date:
        qs = qs.filter(purchase_date__date__gte=start_date)
    if end_date:
        qs = qs.filter(purchase_date__date__lte=end_date)
    return {
        'count': qs.count(),
        'total': sum((Decimal(str(p.total_amount or 0)) for p in qs), ZERO),
        'total_base': sum((Decimal(str(p.total_amount_base or 0)) for p in qs), ZERO),
    }


def sale_totals(start_date=None, end_date=None):
    from api.models.data.sales import Sales

    qs = Sales.objects.exclude(status__in=['draft', 'cancelled'])
    if start_date:
        qs = qs.filter(sale_date__date__gte=start_date)
    if end_date:
        qs = qs.filter(sale_date__date__lte=end_date)
    return {
        'count': qs.count(),
        'total': sum((Decimal(str(s.total_amount or 0)) for s in qs), ZERO),
        'total_base': sum((Decimal(str(s.total_amount_base or 0)) for s in qs), ZERO),
    }
