"""Operational summary report (product trading ERP)."""
from api.models.data.purchases import Purchase
from api.models.data.sales import Sales
from api.models.data.inventory_ledger import InventoryBalance


def get_operational_report(start_date=None, end_date=None, **kwargs):
    sales = Sales.objects.exclude(status__in=['draft', 'cancelled'])
    purchases = Purchase.objects.exclude(status__in=['draft', 'cancelled'])
    if start_date:
        sales = sales.filter(sale_date__date__gte=start_date)
        purchases = purchases.filter(purchase_date__date__gte=start_date)
    if end_date:
        sales = sales.filter(sale_date__date__lte=end_date)
        purchases = purchases.filter(purchase_date__date__lte=end_date)
    return {
        'sales_count': sales.count(),
        'purchase_count': purchases.count(),
        'sku_with_stock': InventoryBalance.objects.filter(quantity_on_hand__gt=0).count(),
        'period': {'start': start_date, 'end': end_date},
    }
