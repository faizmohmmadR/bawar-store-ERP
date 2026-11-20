"""Document reconciliation helpers."""
from api.models.data.purchases import Purchase
from api.models.data.sales import Sales


def reconcile_documents(**kwargs):
    return {
        'sales': Sales.objects.exclude(status__in=['draft', 'cancelled']).count(),
        'purchases': Purchase.objects.exclude(status__in=['draft', 'cancelled']).count(),
        'issues': [],
    }
