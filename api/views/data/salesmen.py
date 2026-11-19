from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.sales import Sales, SalesItems
from api.models.data.salesmen import Salesman
from api.serializers.data.sales import sales_item_commission_total
from api.serializers.data.salesmen import SalesmanSerializer
from api.services.salesman_commission import (
    salesman_commission_balance,
    salesman_commission_earned,
    salesman_commission_paid,
    salesman_unit_breakdown,
)
from api.views.data.base import DataRootViewSet


class SalesmanViewSet(DataRootViewSet):
    permission_module = 'salesmen'
    queryset = Salesman.objects.all().order_by('-id')
    serializer_class = SalesmanSerializer
    filterset_fields = ['is_active']
    search_fields = ['name', 'phone', 'email']

    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        if status_filter == 'active':
            queryset = queryset.filter(is_active=True)
        elif status_filter == 'inactive':
            queryset = queryset.filter(is_active=False)
        outstanding = self.request.query_params.get('outstanding')
        if outstanding in ('1', 'true', 'True'):
            from api.utils.date_filters import date_range_params
            date_from, date_to = date_range_params(self.request)
            ids = []
            for s in queryset:
                if salesman_commission_balance(
                    s,
                    date_from=date_from,
                    date_to=date_to,
                ) > 0:
                    ids.append(s.id)
            queryset = queryset.filter(id__in=ids)
        return queryset

    @action(detail=True, methods=['get'], url_path='commission-statement')
    def commission_statement(self, request, pk=None):
        from api.utils.date_filters import date_range_params
        from api.services.salesman_commission import salesman_commission_statement
        salesman = self.get_object()
        date_from, date_to = date_range_params(request)
        return Response(salesman_commission_statement(salesman, date_from=date_from, date_to=date_to))

    @action(detail=True, methods=['get'], url_path='commission-summary')
    def commission_summary(self, request, pk=None):
        """Commission earned / paid / balance and recent sale lines (AFN)."""
        from api.utils.date_filters import date_range_params

        salesman = self.get_object()
        date_from, date_to = date_range_params(request)

        items = SalesItems.objects.filter(
            sales__salesman=salesman,
            sales__deleted_at__isnull=True,
            deleted_at__isnull=True,
        ).exclude(sales__status='cancelled').select_related('sales', 'stock__product')
        if date_from:
            items = items.filter(sales__sale_date__gte=date_from)
        if date_to:
            items = items.filter(sales__sale_date__lte=date_to)

        earned = salesman_commission_earned(salesman, date_from=date_from, date_to=date_to)
        paid = salesman_commission_paid(salesman, date_from=date_from, date_to=date_to)
        balance = salesman_commission_balance(salesman, date_from=date_from, date_to=date_to)

        sales_qs = Sales.objects.filter(
            salesman=salesman,
            deleted_at__isnull=True,
        ).exclude(status='cancelled')
        if date_from:
            sales_qs = sales_qs.filter(sale_date__gte=date_from)
        if date_to:
            sales_qs = sales_qs.filter(sale_date__lte=date_to)

        recent = []
        for item in items.order_by('-sales__sale_date', '-id')[:50]:
            product_name = ''
            if item.stock_id and item.stock and item.stock.product_id:
                product_name = item.stock.product.name
            elif item.storage_tank_id and item.storage_tank:
                product_name = item.storage_tank.name
            line_total = sales_item_commission_total(item)
            recent.append({
                'sale_id': item.sales_id,
                'invoice_number': item.sales.invoice_number,
                'sale_date': item.sales.sale_date,
                'product_name': product_name,
                'commission_amount': str(item.commission_amount or 0),
                'commission_total': str(line_total),
                'sell_price': str(item.sell_price or 0),
                'quantity': str(item.quantity or 0),
                'unit': item.unit,
            })

        unit_breakdown = salesman_unit_breakdown(
            salesman,
            date_from=date_from,
            date_to=date_to,
        )

        return Response({
            'salesman_id': salesman.id,
            'total_commission': float(earned),
            'commission_earned': float(earned),
            'commission_paid': float(paid),
            'commission_balance': float(balance),
            'lifetime_commission_balance': float(salesman_commission_balance(salesman)),
            'sales_count': sales_qs.count(),
            'unit_breakdown': unit_breakdown,
            'recent_commissions': recent,
        })
