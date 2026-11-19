"""Salesman commission earned / paid / balance helpers (always AFN)."""
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum

from api.serializers.data.salesmen import _commission_line_expression
from api.utils.date_filters import normalize_date_from, normalize_date_to

# Display order for packing units (then liter / other).
UNIT_BREAKDOWN_ORDER = ('carton', 'bottle', 'plastic', 'kg')


def _d(value):
    return Decimal(str(value or 0))


def _normalize_unit(unit: str | None) -> str:
    raw = (unit or '').strip().lower()
    if raw in ('dana', 'piece', 'pieces'):
        return 'bottle'
    return raw or 'other'


def _sales_items_qs(salesman_id, *, date_from=None, date_to=None):
    from api.models.data.sales import SalesItems

    qs = SalesItems.objects.filter(
        sales__salesman_id=salesman_id,
        sales__deleted_at__isnull=True,
        deleted_at__isnull=True,
    ).exclude(sales__status='cancelled')
    start = normalize_date_from(date_from)
    end = normalize_date_to(date_to)
    if start:
        qs = qs.filter(sales__sale_date__gte=start)
    if end:
        qs = qs.filter(sales__sale_date__lte=end)
    return qs


def _payments_qs(salesman_id, *, exclude_payment_id=None, date_from=None, date_to=None):
    from api.models.data.salesman_commission_payment import SalesmanCommissionPayment

    qs = SalesmanCommissionPayment.objects.filter(
        salesman_id=salesman_id,
        deleted_at__isnull=True,
    )
    if exclude_payment_id:
        qs = qs.exclude(pk=exclude_payment_id)
    start = normalize_date_from(date_from)
    end = normalize_date_to(date_to)
    if start:
        qs = qs.filter(payment_date__gte=start)
    if end:
        qs = qs.filter(payment_date__lte=end)
    return qs


def salesman_commission_earned(salesman, *, date_from=None, date_to=None) -> Decimal:
    salesman_id = getattr(salesman, 'pk', salesman)
    total = _sales_items_qs(
        salesman_id,
        date_from=date_from,
        date_to=date_to,
    ).aggregate(total=Sum(_commission_line_expression()))['total']
    return _d(total)


def salesman_commission_paid(
    salesman,
    *,
    exclude_payment_id=None,
    date_from=None,
    date_to=None,
) -> Decimal:
    salesman_id = getattr(salesman, 'pk', salesman)
    total = _payments_qs(
        salesman_id,
        exclude_payment_id=exclude_payment_id,
        date_from=date_from,
        date_to=date_to,
    ).aggregate(total=Sum('amount'))['total']
    return _d(total)


def salesman_commission_balance(
    salesman,
    *,
    exclude_payment_id=None,
    date_from=None,
    date_to=None,
) -> Decimal:
    return max(
        salesman_commission_earned(salesman, date_from=date_from, date_to=date_to)
        - salesman_commission_paid(
            salesman,
            exclude_payment_id=exclude_payment_id,
            date_from=date_from,
            date_to=date_to,
        ),
        Decimal('0'),
    )


def salesman_unit_breakdown(salesman, *, date_from=None, date_to=None) -> dict:
    """
    Qty sold and commission totals by sale unit (carton / bottle / plastic / liter).

    Commission is always AFN: quantity × commission_amount per line, then summed.
    """
    salesman_id = getattr(salesman, 'pk', salesman)
    qs = _sales_items_qs(salesman_id, date_from=date_from, date_to=date_to)

    buckets: dict[str, dict] = {}
    for item in qs.only('unit', 'quantity', 'commission_amount', 'kilogram_amount', 'storage_tank_id'):
        unit = _normalize_unit(item.unit)
        qty = _d(item.quantity)
        commission = qty * _d(item.commission_amount)
        if unit == 'liter':
            from api.services.tank_inventory import get_tank_density
            qty = _d(item.kilogram_amount) or (qty * get_tank_density(item.storage_tank) if item.storage_tank_id else qty)
            unit = 'kg'
        bucket = buckets.setdefault(
            unit,
            {
                'unit': unit,
                'quantity': Decimal('0'),
                'commission_total': Decimal('0'),
                'line_count': 0,
            },
        )
        bucket['quantity'] += qty
        bucket['commission_total'] += commission
        bucket['line_count'] += 1

    rows = []
    for unit in UNIT_BREAKDOWN_ORDER:
        if unit not in buckets:
            continue
        rows.append(buckets.pop(unit))
    # Any unexpected units last (stable by name)
    for unit in sorted(buckets.keys()):
        rows.append(buckets[unit])

    total_qty = sum((r['quantity'] for r in rows), Decimal('0'))
    total_commission = sum((r['commission_total'] for r in rows), Decimal('0'))

    serialized = []
    for row in rows:
        qty = row['quantity']
        commission = row['commission_total']
        avg = (
            (commission / qty).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
            if qty > 0
            else Decimal('0')
        )
        serialized.append({
            'unit': row['unit'],
            'quantity': float(qty),
            'commission_total': float(commission),
            'commission_per_unit_avg': float(avg),
            'line_count': row['line_count'],
        })

    return {
        'rows': serialized,
        'total_quantity': float(total_qty),
        'total_commission': float(total_commission),
    }


def salesman_commission_statement(salesman, *, date_from=None, date_to=None):
    """A read-only statement: one earned entry per invoice and one per payment."""
    from django.db.models import F, Q, DecimalField, ExpressionWrapper
    from api.models.data.sales import Sales
    salesman_id = getattr(salesman, 'pk', salesman)
    start, end = normalize_date_from(date_from), normalize_date_to(date_to)
    sales = Sales.objects.filter(salesman_id=salesman_id).exclude(status='cancelled').select_related('customer').annotate(
        earned=Sum(ExpressionWrapper(F('sales_items__quantity') * F('sales_items__commission_amount'),
            output_field=DecimalField(max_digits=24, decimal_places=4)),
            filter=Q(sales_items__deleted_at__isnull=True)))
    payments = _payments_qs(salesman_id)
    opening = Decimal('0')
    if start:
        opening_earned = sum((_d(sale.earned) for sale in sales.filter(sale_date__lt=start)), Decimal('0'))
        opening_paid = _d(payments.filter(payment_date__lt=start).aggregate(total=Sum('amount'))['total'])
        opening = opening_earned - opening_paid
        sales = sales.filter(sale_date__gte=start)
        payments = payments.filter(payment_date__gte=start)
    if end:
        sales = sales.filter(sale_date__lte=end)
        payments = payments.filter(payment_date__lte=end)
    entries = []
    earned, paid = Decimal('0'), Decimal('0')
    for sale in sales:
        amount = _d(sale.earned)
        earned += amount
        entries.append({'id': f'sale-{sale.pk}', 'entry_type': 'sale', 'date': sale.sale_date,
            'sale_id': sale.pk, 'invoice_number': sale.invoice_number, 'commission_amount': str(amount),
            'payment_amount': '0', 'customer_name': sale.customer.name,
            'sale_total': str(sale.total_amount), 'sale_currency': sale.currency,
            'sale_status': sale.status, 'notes': sale.notes or ''})
    sales_count = len(entries)
    for payment in payments:
        paid += payment.amount
        entries.append({'id': f'payment-{payment.pk}', 'entry_type': 'payment', 'date': payment.payment_date,
            'sale_id': None, 'invoice_number': '', 'commission_amount': '0', 'payment_amount': str(payment.amount),
            'payment_id': payment.pk, 'payment_method': payment.payment_method,
            'reference_number': payment.reference_number or '', 'notes': payment.notes or ''})
    entries.sort(key=lambda row: (row['date'], row['entry_type'] != 'sale', int(row['id'].split('-')[-1])))
    closing = opening + earned - paid
    return {'salesman_id': salesman_id, 'entries': entries, 'sales_count': sales_count,
        'total_commission': str(earned), 'commission_earned': str(earned), 'commission_paid': str(paid),
        'commission_balance': str(closing), 'opening_balance': str(opening),
        'lifetime_commission_balance': str(salesman_commission_balance(salesman_id))}
