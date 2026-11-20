from api.models.data.purchases import Purchase, PurchaseItem
from api.serializers.data.purchases import PurchaseItemSerializer, PurchaseSerializer
from api.views.data.base import DataRootViewSet


class PurchaseViewSet(DataRootViewSet):
    permission_module = 'purchases'
    queryset = (
        Purchase.objects.select_related('vendor', 'warehouse')
        .prefetch_related('items__product', 'items__packaging')
        .all()
        .order_by('-purchase_date', '-id')
    )
    serializer_class = PurchaseSerializer
    search_fields = ['invoice_number', 'bill_number', 'vendor__name', 'notes']
    filterset_fields = ['status', 'vendor', 'warehouse', 'currency', 'transaction_type']


class PurchaseItemViewSet(DataRootViewSet):
    permission_module = 'purchases'
    queryset = PurchaseItem.objects.select_related('product', 'packaging', 'purchase').all()
    serializer_class = PurchaseItemSerializer
    filterset_fields = ['purchase', 'product', 'packaging']
