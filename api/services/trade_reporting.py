"""Trade purchase/sale reporting helpers."""
from decimal import Decimal
from api.models.data.purchases import Purchase
from api.models.data.sales import Sales


def _d(v):
    return Decimal(str(v or 0))


def purchase_totals(start_date=None, end_date=None):
    qs = Purchase.objects.exclude(status__in=['draft', 'cancelled'])
    if start_date:
        qs = qs.filter(purchase_date__date__gte=start_date)
    if end_date:
        qs = qs.filter(purchase_date__date__lte=end_date)
    return {
        'count': qs.count(),
        'total': sum((_d(p.total_amount) for p in qs), Decimal('0')),
        'total_base': sum((_d(p.total_amount_base) for p in qs), Decimal('0')),
    }


def sale_totals(start_date=None, end_date=None):
    qs = Sales.objects.exclude(status__in=['draft', 'cancelled'])
    if start_date:
        qs = qs.filter(sale_date__date__gte=start_date)
    if end_date:
        qs = qs.filter(sale_date__date__lte=end_date)
    return {
        'count': qs.count(),
        'total': sum((_d(s.total_amount) for s in qs), Decimal('0')),
        'total_base': sum((_d(s.total_amount_base) for s in qs), Decimal('0')),
    }
