from api.models.data.sales import Sales, SalesItems
from api.serializers.data.sales import SalesItemsSerializer, SalesSerializer
from api.views.data.base import DataRootViewSet


class SalesViewSet(DataRootViewSet):
    permission_module = 'sales'
    queryset = (
        Sales.objects.select_related('customer', 'vendor', 'employee', 'salesman', 'warehouse')
        .prefetch_related('sales_items__product', 'sales_items__packaging')
        .all()
        .order_by('-sale_date', '-id')
    )
    serializer_class = SalesSerializer
    search_fields = ['invoice_number', 'bill_no', 'customer__name', 'vendor__name', 'notes']
    filterset_fields = ['status', 'customer', 'vendor', 'employee', 'currency', 'transaction_type', 'warehouse']


class SalesItemsViewSet(DataRootViewSet):
    permission_module = 'sales'
    queryset = SalesItems.objects.select_related('product', 'packaging', 'sales').all()
    serializer_class = SalesItemsSerializer
    filterset_fields = ['sales', 'product', 'packaging']
