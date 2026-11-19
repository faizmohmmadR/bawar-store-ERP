from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.stock_bottle_damage import StockBottleDamage
from api.serializers.data.stock_bottle_damage import StockBottleDamageSerializer
from api.services.stock_bottle_damage import reverse_bottle_damage, update_bottle_damage
from api.views.data.base import DataRootViewSet


class StockBottleDamageViewSet(DataRootViewSet):
    """History of damaged filled bottles (remaining liquid → tank, spill → damaged)."""

    permission_module = 'stock'
    permission_action_map = {
        'list': 'view_stock',
        'retrieve': 'view_stock',
        'partial_update': 'edit_stock',
        'update': 'edit_stock',
        'destroy': 'edit_stock',
        'reverse': 'edit_stock',
    }
    queryset = StockBottleDamage.objects.select_related(
        'stock__product',
        'product',
        'storage_tank',
        'damaged_record',
        'performed_by',
    ).all().order_by('-recorded_at', '-id')
    serializer_class = StockBottleDamageSerializer
    http_method_names = ['get', 'put', 'patch', 'delete', 'head', 'options']
    search_fields = [
        'product__name',
        'notes',
        'damaged_record__damaged_number',
        'storage_tank__name',
    ]
    filterset_fields = ['stock', 'product', 'storage_tank']

    def get_queryset(self):
        qs = super().get_queryset()
        stock_id = self.request.query_params.get('stock')
        if stock_id:
            qs = qs.filter(stock_id=stock_id)
        search = (self.request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(product__name__icontains=search)
                | Q(notes__icontains=search)
                | Q(damaged_record__damaged_number__icontains=search)
                | Q(storage_tank__name__icontains=search)
            )
        return qs

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        instance = self.get_object()

        class Payload(serializers.Serializer):
            bottle_count = serializers.IntegerField(min_value=1)
            remaining_liquid_kg = serializers.DecimalField(
                max_digits=14, decimal_places=4, min_value=Decimal('0'),
            )
            storage_tank = serializers.IntegerField(required=False, allow_null=True, min_value=1)
            notes = serializers.CharField(required=False, allow_blank=True, default='')

        payload = Payload(data=request.data)
        payload.is_valid(raise_exception=True)
        values = payload.validated_data
        record = update_bottle_damage(
            damage_id=instance.pk,
            bottle_count=values['bottle_count'],
            remaining_liquid_kg=values['remaining_liquid_kg'],
            storage_tank_id=values.get('storage_tank'),
            notes=values.get('notes') or '',
            user=request.user,
        )
        return Response(self.get_serializer(record).data)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        reverse_bottle_damage(instance, user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='reverse')
    def reverse(self, request, pk=None):
        instance = self.get_object()
        reverse_bottle_damage(instance, user=request.user)
        return Response({'detail': 'Bottle damage reversed.'})
