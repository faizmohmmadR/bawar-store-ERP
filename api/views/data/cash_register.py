from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from api.models.data.cash_register import CashRegister, CashSession, CashTransaction
from api.serializers.data.cash_register import (
    CashCountPreviewSerializer,
    CashRegisterSerializer,
    CashSessionSerializer,
    CashTransactionSerializer,
    CloseSessionSerializer,
    DepositCashSerializer,
    ManualCashTransactionSerializer,
    OpenSessionSerializer,
)
from api.services import cash_register as cash_svc
from api.views.data.base import DataRootViewSet


class CashRegisterViewSet(DataRootViewSet):
    """Single cash drawer (دخل) — dashboard, sessions, transactions."""

    permission_module = 'cash_register'
    queryset = CashRegister.objects.all().select_related('linked_cash_account')
    serializer_class = CashRegisterSerializer
    http_method_names = ['get', 'post', 'head', 'options']
    permission_action_map = {
        'list': 'view_cash_register',
        'retrieve': 'view_cash_register',
        'dashboard': 'view_cash_register',
        'current': 'view_cash_register',
        'open_session': 'open_cash_session',
        'close_session': 'close_cash_session',
        'sessions': 'view_cash_register',
        'session_detail': 'view_cash_register',
        'transactions': 'view_cash_transactions',
        'manual_transaction': 'record_cash_adjustment',
        'deposit_cash': 'record_cash_adjustment',
        'count_preview': 'close_cash_session',
        'denominations': 'view_cash_register',
        'reports_summary': 'view_cash_reports',
    }

    def list(self, request, *args, **kwargs):
        register = cash_svc.get_or_create_default_register()
        return Response(CashRegisterSerializer(register).data)

    def retrieve(self, request, *args, **kwargs):
        register = cash_svc.get_or_create_default_register()
        return Response(CashRegisterSerializer(register).data)

    @action(detail=False, methods=['get'], url_path='current')
    def current(self, request):
        register = cash_svc.get_or_create_default_register()
        return Response(CashRegisterSerializer(register).data)

    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request):
        register = cash_svc.get_or_create_default_register()
        session = cash_svc.get_open_session(register)
        payload = {
            'register': CashRegisterSerializer(register).data,
            'open_session': CashSessionSerializer(session).data if session else None,
            'has_open_session': session is not None,
            'denominations': [str(d) for d in cash_svc.AFN_DENOMINATIONS],
        }
        if session:
            totals = cash_svc.session_totals(session)
            payload['totals'] = {
                k: (str(v) if hasattr(v, 'quantize') else v) for k, v in totals.items()
            }
        else:
            prev = (
                CashSession.objects.filter(
                    cash_register=register, status=CashSession.STATUS_CLOSED,
                )
                .order_by('-closed_at', '-id')
                .first()
            )
            payload['previous_carry_forward'] = (
                str(prev.carry_forward_amount) if prev else '0'
            )
            payload['has_previous_session'] = prev is not None
            payload['totals'] = None
        return Response(payload)

    @action(detail=False, methods=['post'], url_path='open-session')
    def open_session(self, request):
        ser = OpenSessionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        session = cash_svc.open_session(
            opening_balance=ser.validated_data.get('opening_balance'),
            opening_deposit=ser.validated_data.get('opening_deposit'),
            user=request.user,
            notes=ser.validated_data.get('notes') or '',
            currency=ser.validated_data.get('currency'),
        )
        return Response(CashSessionSerializer(session).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='close-session')
    def close_session(self, request):
        session = cash_svc.get_open_session()
        if session is None:
            return Response({'detail': 'No open cash session.'}, status=status.HTTP_400_BAD_REQUEST)
        ser = CloseSessionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        closed = cash_svc.close_session(
            session=session,
            actual_closing_balance=ser.validated_data['actual_closing_balance'],
            carry_forward_amount=ser.validated_data['carry_forward_amount'],
            count_lines=ser.validated_data.get('count_lines'),
            difference_reason=ser.validated_data.get('difference_reason') or '',
            removals=ser.validated_data.get('removals'),
            user=request.user,
            notes=ser.validated_data.get('notes') or '',
        )
        return Response(CashSessionSerializer(closed).data)

    @action(detail=False, methods=['get'], url_path='sessions')
    def sessions(self, request):
        qs = CashSession.objects.select_related(
            'cash_register', 'opened_by', 'closed_by',
        ).all()
        status_filter = request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(CashSessionSerializer(page, many=True).data)
        return Response(CashSessionSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path=r'sessions/(?P<session_id>[^/.]+)')
    def session_detail(self, request, session_id=None):
        session = CashSession.objects.select_related(
            'cash_register', 'opened_by', 'closed_by',
        ).prefetch_related('count_lines').filter(pk=session_id).first()
        if not session:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(CashSessionSerializer(session).data)

    @action(detail=False, methods=['get'], url_path='transactions')
    def transactions(self, request):
        qs = CashTransaction.objects.select_related(
            'cash_session', 'cash_register', 'created_by', 'content_type',
        ).filter(deleted_at__isnull=True)
        session_id = request.query_params.get('session')
        if session_id:
            qs = qs.filter(cash_session_id=session_id)
        else:
            open_s = cash_svc.get_open_session()
            if open_s and request.query_params.get('current') in ('1', 'true', 'yes'):
                qs = qs.filter(cash_session=open_s)
        direction = request.query_params.get('direction')
        if direction:
            qs = qs.filter(direction=direction)
        category = request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        search = (request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(description__icontains=search)
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(CashTransactionSerializer(page, many=True).data)
        return Response(CashTransactionSerializer(qs, many=True).data)

    @action(detail=False, methods=['post'], url_path='deposit-cash')
    def deposit_cash(self, request):
        """Put cash into the open drawer at any time (not only at morning open)."""
        ser = DepositCashSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        txn = cash_svc.deposit_cash_to_drawer(
            amount=ser.validated_data['amount'],
            description=ser.validated_data.get('description') or '',
            user=request.user,
            currency=ser.validated_data.get('currency'),
        )
        return Response(CashTransactionSerializer(txn).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='manual-transaction')
    def manual_transaction(self, request):
        ser = ManualCashTransactionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        session = cash_svc.get_open_session()
        if session is None:
            return Response({'detail': 'No open cash session.'}, status=status.HTTP_400_BAD_REQUEST)
        cat = ser.validated_data['category']
        from api.models.data.cash_register import CashTransaction as CT
        direction = (
            CT.DIRECTION_IN if cat in {
                CT.CAT_OWNER_CAPITAL, CT.CAT_OTHER_RECEIPT,
            } else CT.DIRECTION_OUT
        )
        txn = cash_svc.record_transaction(
            session=session,
            direction=direction,
            category=cat,
            amount=ser.validated_data['amount'],
            description=ser.validated_data.get('description') or '',
            user=request.user,
            currency=ser.validated_data.get('currency'),
            posts_own_journal=True,
            skip_session_check=True,
        )
        return Response(CashTransactionSerializer(txn).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='count-preview')
    def count_preview(self, request):
        ser = CashCountPreviewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return Response(ser.create_total())

    @action(detail=False, methods=['get'], url_path='denominations')
    def denominations(self, request):
        return Response({'denominations': [str(d) for d in cash_svc.AFN_DENOMINATIONS]})

    @action(detail=False, methods=['get'], url_path='reports/summary')
    def reports_summary(self, request):
        """Historical session report rows for the reports screen."""
        qs = CashSession.objects.select_related('cash_register', 'opened_by', 'closed_by').all()
        rows = []
        for session in qs[:200]:
            totals = cash_svc.session_totals(session)
            rows.append({
                'session_id': session.id,
                'session_number': session.session_number,
                'status': session.status,
                'opened_at': session.opened_at,
                'closed_at': session.closed_at,
                'opening_balance': str(totals['opening_balance']),
                'cash_sales': str(totals['cash_sales']),
                'customer_debt_collections': str(totals['customer_debt_collections']),
                'total_cash_in': str(totals['total_cash_in']),
                'total_cash_out': str(totals['total_cash_out']),
                'expected_closing_balance': str(totals['expected_closing_balance']),
                'actual_closing_balance': (
                    str(session.actual_closing_balance)
                    if session.actual_closing_balance is not None else None
                ),
                'cash_difference': str(session.cash_difference or 0),
                'carry_forward_amount': str(session.carry_forward_amount or 0),
            })
        return Response({'results': rows, 'count': len(rows)})
