from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.withdrawal import Withdrawal
from api.serializers.data.withdrawal import WithdrawalSerializer
from api.views.data.base import DataRootViewSet


class WithdrawalViewSet(DataRootViewSet):
    permission_module = 'withdrawals'
    queryset = Withdrawal.objects.all().order_by('-withdrawal_date', '-id')
    serializer_class = WithdrawalSerializer
    filterset_fields = ['payment_method', 'currency', 'gl_account']
    search_fields = ['reference_number', 'description', 'gl_account__code', 'gl_account__name']

    @action(detail=False, methods=['get'], url_path='account-preview')
    def account_preview(self, request):
        """
        Show GL Cash/Bank/Sarafi info + current balance for the selected book.

        Query: payment_method=cash|bank|sarafi, currency=<id>
        """
        from api.constants.gl_roles import GL_ROLE_CODES, PAYMENT_METHOD_ROLES
        from api.models.data.currency import BASE_CURRENCY_ID, CURRENCY_DEFINITIONS, currency_details
        from api.services.accounting.coa import get_payment_asset_account
        from api.services.gl_account_ledger import get_gl_account_totals

        method = (request.query_params.get('payment_method') or 'cash').strip().lower()
        if method not in PAYMENT_METHOD_ROLES:
            return Response(
                {'error': 'payment_method must be cash, bank, or sarafi'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_currency = request.query_params.get('currency')
        try:
            currency_id = int(raw_currency) if raw_currency not in (None, '') else BASE_CURRENCY_ID
        except (TypeError, ValueError):
            return Response({'error': 'Invalid currency'}, status=status.HTTP_400_BAD_REQUEST)

        role = PAYMENT_METHOD_ROLES[method]
        code = GL_ROLE_CODES[role]
        account = get_payment_asset_account(
            method,
            currency_id=currency_id,
        )
        if not account:
            return Response(
                {
                    'payment_method': method,
                    'code': code,
                    'name': None,
                    'found': False,
                    'balance': 0,
                    'message': 'GL account not found',
                }
            )

        totals = get_gl_account_totals(account)
        cdef = CURRENCY_DEFINITIONS.get(currency_id) or {}
        return Response(
            {
                'found': True,
                'payment_method': method,
                'payment_method_label': dict(Withdrawal.PAYMENT_METHOD_CHOICES).get(method, method),
                'gl_account_id': account.id,
                'code': account.code,
                'name': account.name,
                'category': account.category,
                'currency': currency_id,
                'currency_details': currency_details(currency_id),
                'balance': totals.get('balance', 0),
                'base_balance': totals.get('base_balance', totals.get('balance', 0)),
                'total_debit': totals.get('total_debit', 0),
                'total_credit': totals.get('total_credit', 0),
                'line_count': totals.get('line_count', 0),
                'symbol': cdef.get('symbol') or cdef.get('code') or '',
            }
        )

    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        instance.delete()
