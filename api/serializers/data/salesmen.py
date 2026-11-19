from django.db.models import DecimalField, ExpressionWrapper, F
from rest_framework import serializers

from api.models.data.salesmen import Salesman
from api.serializers.data.base import DataRootSerializer


def _commission_line_expression():
    return ExpressionWrapper(
        F('quantity') * F('commission_amount'),
        output_field=DecimalField(max_digits=18, decimal_places=4),
    )


class SalesmanSerializer(DataRootSerializer):
    total_commission = serializers.SerializerMethodField()
    commission_paid = serializers.SerializerMethodField()
    commission_balance = serializers.SerializerMethodField()
    sales_count = serializers.SerializerMethodField()

    class Meta:
        model = Salesman
        fields = '__all__'

    def _date_bounds(self):
        request = self.context.get('request')
        if not request:
            return None, None
        from api.utils.date_filters import date_range_params
        return date_range_params(request)

    def get_total_commission(self, obj):
        """Earned commission in AFN (optional date_from / date_to on request)."""
        from api.services.salesman_commission import salesman_commission_earned

        date_from, date_to = self._date_bounds()
        return float(salesman_commission_earned(obj, date_from=date_from, date_to=date_to))

    def get_commission_paid(self, obj):
        from api.services.salesman_commission import salesman_commission_paid

        date_from, date_to = self._date_bounds()
        return float(salesman_commission_paid(obj, date_from=date_from, date_to=date_to))

    def get_commission_balance(self, obj):
        from api.services.salesman_commission import salesman_commission_balance

        date_from, date_to = self._date_bounds()
        return float(salesman_commission_balance(obj, date_from=date_from, date_to=date_to))

    def get_sales_count(self, obj):
        qs = obj.sales.filter(deleted_at__isnull=True).exclude(status='cancelled')
        date_from, date_to = self._date_bounds()
        if date_from is not None:
            qs = qs.filter(sale_date__gte=date_from)
        if date_to is not None:
            qs = qs.filter(sale_date__lte=date_to)
        return qs.count()
