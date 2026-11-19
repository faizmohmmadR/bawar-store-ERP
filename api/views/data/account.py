from rest_framework.decorators import action
from rest_framework.response import Response

from api.constants.accounting_constants import STATIC_ENTRY_TYPES
from api.models.data.account import Account
from api.serializers.data.account import AccountSerializer, AccountWriteSerializer
from api.views.data.base import DataRootViewSet


class AccountViewSet(DataRootViewSet):
    permission_module = 'accounting'
    queryset = Account.objects.all().order_by('-id')
    serializer_class = AccountSerializer
    filterset_fields = ['currency', 'account_number']
    search_fields = ['account_number', 'name']

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return AccountWriteSerializer
        return AccountSerializer

    @action(detail=False, methods=['get'])
    def entry_types(self, request):
        return Response([
            {'code': code, 'name': label}
            for code, label in STATIC_ENTRY_TYPES
        ])
