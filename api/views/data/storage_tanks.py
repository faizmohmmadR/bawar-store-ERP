from decimal import Decimal

from django.db.models import (
    Case,
    DecimalField,
    ExpressionWrapper,
    F,
    OuterRef,
    Subquery,
    Sum,
    Value,
    When,
)
from django.db.models.functions import Coalesce
from rest_framework.exceptions import ValidationError

from api.models.data.packing import PackingRun
from api.models.data.returns import ReturnItems
from api.models.data.sales import SalesItems
from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.serializers.data.storage_tank import (
    StorageTankDetailSerializer,
    StorageTankSerializer,
)
from api.services.tank_inventory import TANK_SALE_ACTIVE_STATUSES
from api.views.data.base import DataRootViewSet


class StorageTankViewSet(DataRootViewSet):
    permission_module = 'storage_tanks'
    transfer_totals = ProductionStorageTransfer.objects.filter(
        storage_tank_id=OuterRef('pk'),
        deleted_at__isnull=True,
        production__deleted_at__isnull=True,
        production__status='moved_to_storage',
    ).order_by().values('storage_tank_id').annotate(
        liters=Sum('quantity_liters'),
        liquid_value=Sum(ExpressionWrapper(
            F('quantity_liters') * F('production__cost_per_liter_afn'),
            output_field=DecimalField(max_digits=24, decimal_places=8),
        )),
    )
    packing_totals = PackingRun.objects.filter(
        storage_tank_id=OuterRef('pk'),
        deleted_at__isnull=True,
    ).order_by().values('storage_tank_id').annotate(
        liters=Sum('quantity_liters'),
        liquid_value=Sum('liquid_cost_afn'),
    )
    sale_totals = SalesItems.objects.filter(
        storage_tank_id=OuterRef('pk'),
        sale_source=SalesItems.SOURCE_TANK,
        deleted_at__isnull=True,
        sales__deleted_at__isnull=True,
        sales__status__in=TANK_SALE_ACTIVE_STATUSES,
    ).order_by().values('storage_tank_id').annotate(
        liters=Sum('liter_amount'),
        liquid_value=Sum(ExpressionWrapper(
            Case(
                When(unit='kg', then=F('quantity') * F('unit_cost')),
                default=F('liter_amount') * F('unit_cost'),
                output_field=DecimalField(max_digits=24, decimal_places=8),
            ),
            output_field=DecimalField(max_digits=24, decimal_places=8),
        )),
    )
    return_totals = ReturnItems.objects.filter(
        sales_item__storage_tank_id=OuterRef('pk'),
        sales_item__sale_source=SalesItems.SOURCE_TANK,
        sales_item__deleted_at__isnull=True,
        sales_item__sales__deleted_at__isnull=True,
        sales_item__sales__status__in=TANK_SALE_ACTIVE_STATUSES,
        deleted_at__isnull=True,
        return_order__deleted_at__isnull=True,
    ).order_by().values('sales_item__storage_tank_id').annotate(
        liters=Sum('liter_amount'),
        liquid_value=Sum(ExpressionWrapper(
            Case(
                When(
                    sales_item__unit='kg',
                    then=F('quantity_kg') * F('sales_item__unit_cost'),
                ),
                default=F('liter_amount') * F('sales_item__unit_cost'),
                output_field=DecimalField(max_digits=24, decimal_places=8),
            ),
            output_field=DecimalField(max_digits=24, decimal_places=8),
        )),
    )
    zero = Value(Decimal('0'), output_field=DecimalField(
        max_digits=24, decimal_places=8))
    queryset = StorageTank.objects.annotate(
        incoming_liters=Coalesce(
            Subquery(transfer_totals.values('liters')[:1]), zero),
        incoming_liquid_value=Coalesce(
            Subquery(transfer_totals.values('liquid_value')[:1]), zero),
        packed_liters=Coalesce(
            Subquery(packing_totals.values('liters')[:1]), zero),
        packed_liquid_value=Coalesce(
            Subquery(packing_totals.values('liquid_value')[:1]), zero),
        sold_liters_gross=Coalesce(
            Subquery(sale_totals.values('liters')[:1]), zero),
        sold_liquid_value_gross=Coalesce(
            Subquery(sale_totals.values('liquid_value')[:1]), zero),
        returned_liters=Coalesce(
            Subquery(return_totals.values('liters')[:1]), zero),
        returned_liquid_value=Coalesce(
            Subquery(return_totals.values('liquid_value')[:1]), zero),
    ).annotate(
        sold_liters=ExpressionWrapper(
            F('sold_liters_gross') - F('returned_liters'),
            output_field=DecimalField(max_digits=12, decimal_places=4),
        ),
        sold_liquid_value=ExpressionWrapper(
            F('sold_liquid_value_gross') - F('returned_liquid_value'),
            output_field=DecimalField(max_digits=24, decimal_places=8),
        ),
    ).annotate(
        current_liters=ExpressionWrapper(
            F('incoming_liters') - F('packed_liters') - F('sold_liters'),
            output_field=DecimalField(max_digits=12, decimal_places=4),
        ),
        current_liquid_value_afn=ExpressionWrapper(
            F('incoming_liquid_value') - F('packed_liquid_value') - F('sold_liquid_value'),
            output_field=DecimalField(max_digits=24, decimal_places=8),
        ),
    ).annotate(
        liquid_cost_per_liter_afn=Case(
            When(
                current_liters__gt=0,
                then=ExpressionWrapper(
                    F('current_liquid_value_afn') / F('current_liters'),
                    output_field=DecimalField(max_digits=18, decimal_places=6),
                ),
            ),
            default=Value(Decimal('0')),
            output_field=DecimalField(max_digits=18, decimal_places=6),
        )
    )
    serializer_class = StorageTankSerializer
    search_fields = ['name']
    http_method_names = ['get', 'post', 'put',
                         'patch', 'delete', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return StorageTankDetailSerializer
        return StorageTankSerializer

    def get_queryset(self):
        qs = super().get_queryset().select_related('product')
        fill_status = (self.request.query_params.get('fill_status') or '').strip().lower()
        if fill_status == 'empty':
            qs = qs.filter(current_liters__lte=0)
        elif fill_status in ('has_liquid', 'in_use'):
            qs = qs.filter(current_liters__gt=0)
        elif fill_status == 'full':
            from api.services.tank_inventory import get_tank_mass_quantity
            full_ids = [tank.pk for tank in qs if (
                get_tank_mass_quantity(tank) >= tank.capacity_kg
                if tank.capacity_kg is not None else tank.current_liters >= tank.capacity_liters > 0
            )]
            qs = qs.filter(pk__in=full_ids)
        return qs

    def destroy(self, request, *args, **kwargs):
        tank = self.get_object()
        if tank.current_liters > 0:
            raise ValidationError({
                'detail': 'Empty the storage tank before deleting it.'
            })
        return super().destroy(request, *args, **kwargs)
