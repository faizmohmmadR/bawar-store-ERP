from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status

from api.models.data.fiscal_year import FiscalYear
from api.serializers.data.fiscal_year import CloseFiscalYearSerializer, FiscalYearSerializer
from api.services.fiscal_year import (
    build_carry_forward_snapshot,
    ensure_current_fiscal_year,
    serialize_fiscal_year,
)
from api.views.data.base import DataRootViewSet


class FiscalYearViewSet(DataRootViewSet):
    soft_delete_enabled = False
    permission_module = 'fiscal_years'
    queryset = FiscalYear.objects.all().order_by('-start_date')
    serializer_class = FiscalYearSerializer
    filterset_fields = ['status', 'is_current']
    search_fields = ['name']
    http_method_names = ['get', 'head', 'options', 'post']

    @action(detail=False, methods=['get'])
    def current(self, request):
        fy = ensure_current_fiscal_year()
        return Response(serialize_fiscal_year(fy))

    @action(detail=True, methods=['get'], url_path='carry-forward')
    def carry_forward(self, request, pk=None):
        fy = self.get_object()
        return Response(build_carry_forward_snapshot(fy))

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        fy = self.get_object()
        serializer = CloseFiscalYearSerializer(
            data=request.data,
            context={'request': request, 'fiscal_year': fy},
        )
        serializer.is_valid(raise_exception=True)
        result = serializer.save()
        return Response(result, status=status.HTTP_200_OK)
