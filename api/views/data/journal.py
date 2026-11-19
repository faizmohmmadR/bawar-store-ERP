from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError
from api.services.report_period import format_report_period_response, resolve_report_period

from api.models.data.journal import AccountingSettings, GLAccount, JournalEntry
from api.serializers.data.journal import (
    AccountingSettingsSerializer,
    GLAccountSerializer,
    InitializeAccountingSerializer,
    JournalEntrySerializer,
    JournalEntryWriteSerializer,
)
from api.services.accounting import (
    get_balance_sheet,
    get_journals_for_source,
    get_profit_and_loss,
    get_trial_balance,
)
from api.services.gl_account_ledger import (
    build_gl_account_ledger_history,
    get_gl_account_lines,
    get_gl_account_totals,
    get_gl_accounts_totals_bulk,
    serialize_gl_journal_line,
)
from api.views.data.base import DataRootViewSet


class GLAccountViewSet(DataRootViewSet):
    soft_delete_enabled = False
    permission_module = 'gl_accounts'
    queryset = GLAccount.objects.all().order_by('code')
    serializer_class = GLAccountSerializer
    filterset_fields = ['category', 'is_active', 'is_system']
    search_fields = ['code', 'name']

    def get_queryset(self):
        qs = GLAccount.objects.order_by('code')

        from django.db.models import Q

        from api.constants.gl_roles import CURRENCY_SPECIFIC_GL_CODES
        from api.models.data.currency import BASE_CURRENCY_ID
        from api.services.accounting import posting_currency_id

        # Detail by id must see every currency book (USD Cash, etc.). List pickers
        # still default to AFN unless currency=all / posting_currency is passed.
        action = getattr(self, 'action', None)
        if action in (
            'retrieve',
            'update',
            'partial_update',
            'destroy',
            'entries',
            'ledger_history',
        ):
            return qs

        # Withdrawals / cash pickers: only Cash, Bank, Sarafi books.
        if self.request.query_params.get('cash_books') in ('1', 'true', 'True'):
            qs = qs.filter(code__in=CURRENCY_SPECIFIC_GL_CODES, is_active=True)
            currency = self.request.query_params.get('currency')
            if currency not in (None, '', 'all'):
                try:
                    qs = qs.filter(currency=int(currency))
                except (TypeError, ValueError):
                    pass
            return qs

        # Phase 5/6: posting_currency returns cash/bank/sarafi for that currency
        # plus home-currency (AFN) generic GLs — what a normal journal needs.
        posting_currency = self.request.query_params.get('posting_currency')
        if posting_currency not in (None, '', 'all'):
            try:
                posting_id = int(posting_currency)
            except (TypeError, ValueError):
                posting_id = None
            if posting_id is not None:
                home = int(BASE_CURRENCY_ID)
                if posting_id == home:
                    qs = qs.filter(Q(currency=home) | Q(currency__isnull=True))
                else:
                    qs = qs.filter(
                        Q(code__in=CURRENCY_SPECIFIC_GL_CODES, currency=posting_id)
                        | (
                            ~Q(code__in=CURRENCY_SPECIFIC_GL_CODES)
                            & (Q(currency=home) | Q(currency__isnull=True))
                        )
                    )
                return qs.filter(is_active=True)

        # Default to base (AFN) CoA. Pass currency=all to browse every chart.
        currency = self.request.query_params.get('currency')
        if currency in (None, ''):
            posting = posting_currency_id()
            qs = qs.filter(Q(currency=posting) | Q(currency__isnull=True))
        elif currency not in ('all',):
            try:
                qs = qs.filter(currency=int(currency))
            except (TypeError, ValueError):
                pass

        return qs

    def perform_create(self, serializer):
        from api.models.data.currency import BASE_CURRENCY_ID

        currency = serializer.validated_data.get('currency')
        if currency is None:
            currency = BASE_CURRENCY_ID
        serializer.save(currency=currency)

    def perform_update(self, serializer):
        instance = self.get_object()
        from api.models.data.currency import BASE_CURRENCY_ID

        currency = serializer.validated_data.get('currency', instance.currency)
        if currency is None:
            currency = BASE_CURRENCY_ID
        # Currency is locked after create for system cash books and any posted history.
        if instance.is_system and 'currency' in serializer.validated_data:
            if int(serializer.validated_data['currency'] or BASE_CURRENCY_ID) != int(
                instance.currency if instance.currency is not None else BASE_CURRENCY_ID
            ):
                raise ValidationError('System account currency cannot be changed.')
        if instance.journal_lines.exists() and 'currency' in serializer.validated_data:
            if int(serializer.validated_data['currency'] or BASE_CURRENCY_ID) != int(
                instance.currency if instance.currency is not None else BASE_CURRENCY_ID
            ):
                raise ValidationError(
                    'Currency cannot be changed on an account that already has journal lines.'
                )
        serializer.save(currency=currency)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        accounts = list(page) if page is not None else list(queryset)
        totals_map = get_gl_accounts_totals_bulk(accounts)

        serializer = self.get_serializer(accounts, many=True)
        data = serializer.data
        for item in data:
            item['all_time_totals'] = totals_map.get(
                item['id'],
                {'total_debit': 0.0, 'total_credit': 0.0, 'balance': 0.0, 'line_count': 0},
            )

        if page is not None:
            return self.get_paginated_response(data)
        return Response(data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        data = serializer.data
        from api.utils.date_filters import date_range_params
        start_date, end_date = date_range_params(request)
        data['totals'] = get_gl_account_totals(instance, start_date=start_date, end_date=end_date)
        data['all_time_totals'] = get_gl_account_totals(instance)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='by-code')
    def by_code(self, request):
        code = (request.query_params.get('code') or '').strip()
        if not code:
            return Response({'detail': 'code query parameter is required'}, status=status.HTTP_400_BAD_REQUEST)

        from api.services.accounting import posting_currency_id

        currency = request.query_params.get('currency')
        if currency not in (None, '', 'all'):
            try:
                currency_id = int(currency)
            except (TypeError, ValueError):
                currency_id = posting_currency_id()
        else:
            currency_id = posting_currency_id()

        qs = GLAccount.objects.filter(code=code, currency=currency_id)
        account = qs.first()
        if not account:
            return Response({'detail': 'GL account not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = self.get_serializer(account)
        data = serializer.data
        from api.utils.date_filters import date_range_params
        start_date, end_date = date_range_params(request)
        data['totals'] = get_gl_account_totals(account, start_date=start_date, end_date=end_date)
        data['all_time_totals'] = get_gl_account_totals(account)
        return Response(data)

    @action(detail=True, methods=['get'])
    def entries(self, request, pk=None):
        account = self.get_object()
        lines = get_gl_account_lines(
            account,
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            source_model=request.query_params.get('source_model'),
            search=request.query_params.get('search'),
        )
        page = self.paginate_queryset(lines)
        if page is not None:
            data = [serialize_gl_journal_line(line) for line in page]
            return self.get_paginated_response(data)
        return Response([serialize_gl_journal_line(line) for line in lines])

    @action(detail=True, methods=['get'], url_path='ledger_history')
    def ledger_history(self, request, pk=None):
        """Paginated journal lines with running balance and source references."""
        account = self.get_object()
        rows, period_totals = build_gl_account_ledger_history(
            account,
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            source_model=request.query_params.get('source_model'),
            search=request.query_params.get('search'),
        )

        page = self.paginate_queryset(rows)
        if page is not None:
            response = self.get_paginated_response(page)
            response.data['totals'] = period_totals
            response.data['all_time_totals'] = get_gl_account_totals(account)
            return response

        return Response({
            'results': rows,
            'totals': period_totals,
            'all_time_totals': get_gl_account_totals(account),
        })

    def perform_destroy(self, instance):
        if instance.is_system:
            raise ValidationError('System accounts cannot be deleted.')
        if instance.journal_lines.exists():
            raise ValidationError('This account has journal entries and cannot be deleted.')
        instance.delete()


class JournalEntryViewSet(DataRootViewSet):
    soft_delete_enabled = False
    permission_module = 'journal_entries'
    queryset = JournalEntry.objects.select_related('fiscal_year').prefetch_related(
        'lines__gl_account'
    ).all()
    serializer_class = JournalEntrySerializer
    filterset_fields = ['is_auto', 'content_type']
    search_fields = ['reference_number', 'description']

    def get_queryset(self):
        return super().get_queryset()

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return JournalEntryWriteSerializer
        return JournalEntrySerializer

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        instance = self.get_object()
        if instance.is_auto or instance.content_type_id:
            raise ValidationError(
                'Automatic or source-linked journal entries cannot be edited. '
                'Correct the source document, or post a reversing/adjustment journal.'
            )
        serializer.save()

    def perform_destroy(self, instance):
        if instance.is_auto or instance.content_type_id:
            raise ValidationError(
                'Automatic or source-linked journal entries cannot be deleted. '
                'Correct or reverse the source document instead.'
            )
        instance.delete()

    def _parse_report_dates(self, request):
        fiscal_year_id = request.query_params.get('fiscal_year_id')
        return resolve_report_period(
            period=request.query_params.get('period', 'monthly'),
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
            fiscal_year_id=fiscal_year_id,
        )

    def _report_period(self, start_date, end_date):
        return format_report_period_response(start_date, end_date)

    @action(detail=False, methods=['get'])
    def for_source(self, request):
        model_name = request.query_params.get('model')
        object_id = request.query_params.get('object_id')
        include_related = request.query_params.get('include_related', '').lower() in ('1', 'true', 'yes')

        if not model_name or not object_id:
            return Response(
                {'error': 'model and object_id query parameters are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            object_id = int(object_id)
        except (TypeError, ValueError):
            return Response(
                {'error': 'object_id must be an integer'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        journals = get_journals_for_source(
            model_name,
            object_id,
            include_related=include_related,
        )
        serializer = JournalEntrySerializer(journals, many=True)
        return Response(serializer.data)

    def _report_mode(self, request):
        from api.services.accounting.reports import normalize_report_mode, REPORT_MODE_BASE

        raw = request.query_params.get('mode')
        # Default AFN consolidated reporting so TB/P&L/BS balance across currencies.
        if raw is None or str(raw).strip() == '':
            return REPORT_MODE_BASE
        return normalize_report_mode(raw)

    def _report_currency_id(self, request):
        from api.services.accounting import posting_currency_id

        raw = request.query_params.get('currency')
        if raw in (None, '', 'all'):
            return posting_currency_id()
        try:
            return int(raw)
        except (TypeError, ValueError):
            return posting_currency_id()

    @action(detail=False, methods=['get'])
    def trial_balance(self, request):
        start_date, end_date = self._parse_report_dates(request)
        mode = self._report_mode(request)
        currency_id = self._report_currency_id(request)
        data = get_trial_balance(
            start_date=start_date,
            end_date=end_date,
            currency_id=currency_id,
            mode=mode,
        )
        data['period'] = self._report_period(start_date, end_date)
        return Response(data)

    @action(detail=False, methods=['get'])
    def profit_loss(self, request):
        start_date, end_date = self._parse_report_dates(request)
        mode = self._report_mode(request)
        currency_id = self._report_currency_id(request)
        data = get_profit_and_loss(
            start_date=start_date,
            end_date=end_date,
            currency_id=currency_id,
            mode=mode,
        )
        data['period'] = self._report_period(start_date, end_date)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='balance-sheet')
    def balance_sheet(self, request):
        start_date, end_date = self._parse_report_dates(request)
        mode = self._report_mode(request)
        currency_id = self._report_currency_id(request)
        data = get_balance_sheet(
            start_date=start_date,
            end_date=end_date,
            currency_id=currency_id,
            mode=mode,
        )
        data['period'] = self._report_period(start_date, end_date)
        return Response(data)


class AccountingSettingsViewSet(DataRootViewSet):
    soft_delete_enabled = False
    permission_module = 'settings'
    queryset = AccountingSettings.objects.all()
    serializer_class = AccountingSettingsSerializer
    http_method_names = ['get', 'put', 'patch', 'head', 'options', 'post']

    def get_object(self):
        return AccountingSettings.get_solo()

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=kwargs.get('partial', False))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def initialize_defaults(self, request):
        serializer = InitializeAccountingSerializer(data={})
        serializer.is_valid(raise_exception=True)
        settings = serializer.save()
        return Response(
            AccountingSettingsSerializer(settings).data,
            status=status.HTTP_201_CREATED,
        )
