"""Payment-linked sales and purchase invoice reporting."""
from decimal import Decimal, ROUND_HALF_UP

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q, Sum

from api.models.data.payment import Payment
from api.utils.date_filters import apply_date_range

FOUR = Decimal('0.0001')
ZERO = Decimal('0')


def invoice_balances(queryset, end_date=None):
    """Yield invoice, native paid/unpaid, and booked AFN paid/unpaid at cutoff.

    Payments are joined by both content type and object id. Allocating the
    invoice's booked AFN value keeps total = paid + unpaid despite settlement FX.
    Actual payment-date cash values are reported separately.
    """
    ct = ContentType.objects.get_for_model(queryset.model)
    payments = apply_date_range(
        Payment.objects.filter(content_type=ct, object_id__in=queryset.values('pk')),
        'payment_date', None, end_date,
    )
    paid_by_id = dict(payments.values('object_id').annotate(paid=Sum('amount')).values_list('object_id', 'paid'))
    for invoice in queryset:
        total = max(Decimal(invoice.total_amount or 0), ZERO)
        paid = min(max(Decimal(paid_by_id.get(invoice.pk) or 0), ZERO), total)
        if getattr(invoice, 'vendor_id', None) and invoice._meta.model_name == 'sales':
            paid = total  # Settled against supplier credit, never customer AR.
        unpaid = total - paid
        total_base = Decimal(invoice.total_amount_base or 0)
        paid_base = (total_base * paid / total).quantize(FOUR, rounding=ROUND_HALF_UP) if total else ZERO
        yield invoice, paid, unpaid, paid_base, total_base - paid_base


def order_payment_queryset(queryset):
    ct = ContentType.objects.get_for_model(queryset.model)
    return Payment.objects.filter(content_type=ct, object_id__in=queryset.values('pk'))


def trade_summary(period_orders, all_orders, start_date=None, end_date=None, *, native=False, currency=None):
    if period_orders.model._meta.model_name == 'sales':
        period_orders = period_orders.exclude(vendor_transaction='purchase_return')
        all_orders = all_orders.exclude(vendor_transaction='purchase_return')
    summary = {key: ZERO for key in ('total', 'paid', 'unpaid', 'payments_in_period', 'payments_for_period_invoices', 'payments_for_other_invoices', 'credit_settlements_in_period')}
    summary.update(count=0, paid_count=0, partial_count=0, unpaid_count=0, free_count=0)
    for invoice, paid, unpaid, paid_base, unpaid_base in invoice_balances(period_orders, end_date):
        if invoice.is_free:
            # Free invoices are tracked separately — never mix into billed/settlement.
            summary['free_count'] += 1
            continue
        summary['count'] += 1
        summary['total'] += Decimal(invoice.total_amount if native else invoice.total_amount_base)
        summary['paid'] += paid if native else paid_base
        summary['unpaid'] += unpaid if native else unpaid_base
        status = 'paid' if unpaid <= 0 else 'unpaid' if paid <= 0 else 'partial'
        summary[f'{status}_count'] += 1
    # Cash flow includes payments on older invoices, but never orphaned/deleted orders.
    payments = apply_date_range(order_payment_queryset(all_orders), 'payment_date', start_date, end_date)
    field = 'amount' if native else 'amount_base'
    cash = payments.exclude(payment_method='intermediary_credit').filter(is_credit_application=False, general_payment__source_sale__isnull=True)
    kind = 'sale' if all_orders.model._meta.model_name == 'sales' else 'purchase'
    advances = Payment.objects.filter(is_advance=True, payment_type=kind, general_payment__source_sale__isnull=True)
    if currency is not None:
        advances = advances.filter(currency=currency)
    advances = apply_date_range(advances, 'payment_date', start_date, end_date)
    advance_total = advances.aggregate(total=Sum(field))['total'] or ZERO
    period_cash = cash.filter(object_id__in=period_orders.values('pk'))
    summary['payments_in_period'] = (cash.aggregate(total=Sum(field))['total'] or ZERO) + advance_total
    summary['payments_for_period_invoices'] = period_cash.aggregate(total=Sum(field))['total'] or ZERO
    summary['payments_for_other_invoices'] = summary['payments_in_period'] - summary['payments_for_period_invoices']
    summary['credit_settlements_in_period'] = payments.filter(Q(payment_method='intermediary_credit') | Q(is_credit_application=True)).aggregate(total=Sum(field))['total'] or ZERO
    # Totals are JSON-friendly, while counts remain integers.
    return {key: float(value) if isinstance(value, Decimal) else value for key, value in summary.items()}


def get_trade_report(start_date=None, end_date=None, *, currency=None):
    from api.models.data.sales import Sales
    from api.models.data.raw_materials import RawMaterialPurchase
    sales = Sales.objects.exclude(status__in=['draft', 'cancelled'])
    purchases = RawMaterialPurchase.objects.exclude(status__in=['draft', 'cancelled'])
    if currency is not None:
        sales = sales.filter(currency=currency)
        purchases = purchases.filter(currency=currency)
    result = {
        'sales': trade_summary(apply_date_range(sales, 'sale_date', start_date, end_date), sales, start_date, end_date, native=currency is not None, currency=currency),
        'purchases': trade_summary(apply_date_range(purchases.filter(status='received'), 'purchase_date', start_date, end_date), purchases, start_date, end_date, native=currency is not None, currency=currency),
    }
    from api.models.data.returns import Return
    returns = apply_date_range(Return.objects.filter(sales__deleted_at__isnull=True), 'return_date', start_date, end_date)
    if currency is not None:
        returns = returns.filter(currency=currency)
    field = 'total_amount' if currency is not None else 'total_amount_base'
    vendor_returns = apply_date_range(Sales.objects.filter(vendor_transaction='purchase_return').exclude(status__in=['draft', 'cancelled']), 'sale_date', start_date, end_date)
    if currency is not None:
        vendor_returns = vendor_returns.filter(currency=currency)
    result['purchases']['returns_in_period'] = float(vendor_returns.aggregate(total=Sum(field))['total'] or 0)
    result['purchases']['net_invoiced_in_period'] = result['purchases']['total'] - result['purchases']['returns_in_period']
    result['sales']['returns_in_period'] = float(returns.aggregate(total=Sum(field))['total'] or 0)
    result['sales']['net_invoiced_in_period'] = result['sales']['total'] - result['sales']['returns_in_period']
    return result
