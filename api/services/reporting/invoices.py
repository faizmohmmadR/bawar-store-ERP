from decimal import Decimal


def string4(value):
    return f"{Decimal(str(value or 0)):.4f}"

"""Invoice reconciliation for sales and purchases."""
from api.models.data.purchases import Purchase, PurchaseItem
from api.models.data.sales import Sales, SalesItems


def invoice_reconciliation(**kwargs):
    return {
        'sales': Sales.objects.exclude(status__in=['draft', 'cancelled']).count(),
        'purchases': Purchase.objects.exclude(status__in=['draft', 'cancelled']).count(),
    }


def customer_invoice_balances(**kwargs):
    rows = []
    for sale in Sales.objects.exclude(status__in=['draft', 'cancelled']).select_related('customer'):
        rows.append({
            'invoice': sale.invoice_number,
            'customer': getattr(sale.customer, 'name', None),
            'total': sale.total_amount,
            'paid': sale.paid_amount,
            'balance': (sale.total_amount or 0) - (sale.paid_amount or 0),
        })
    return {'rows': rows}
