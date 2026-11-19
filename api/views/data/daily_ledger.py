from rest_framework.viewsets import ViewSet
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from account.permissions import HasPermission
from api.services.daily_ledger import build_daily_ledger, build_journal_daily_ledger
from api.services.report_period import format_report_period_response, resolve_report_period
from api.views.data.pagination import CustomPagination


class DailyLedgerViewSet(ViewSet):
    """Daily transaction book — all business activity for a selected day."""

    permission_classes = [IsAuthenticated, HasPermission('view_daily_ledger')]
    pagination_class = CustomPagination

    def _resolve_period(self, request):
        date_param = (request.query_params.get('date') or '').strip()
        if date_param:
            return resolve_report_period(
                period='custom',
                start_date=date_param,
                end_date=date_param,
            )
        return resolve_report_period(
            period=request.query_params.get('period', 'daily'),
            start_date=request.query_params.get('start_date') or request.query_params.get('date_from'),
            end_date=request.query_params.get('end_date') or request.query_params.get('date_to'),
        )

    def list(self, request):
        start_date, end_date = self._resolve_period(request)

        section = request.query_params.get('section')
        currency = (request.query_params.get('currency') or '').strip() or None
        search = request.query_params.get('search')
        # Default: operational day-book (all money sections). Use source=journal for GL lines.
        source = (request.query_params.get('source') or 'operational').strip().lower()

        if source == 'journal':
            payload, error = build_journal_daily_ledger(
                start_date=start_date,
                end_date=end_date,
                currency_id=currency,
                search=search,
            )
        else:
            payload, error = build_daily_ledger(
                start_date=start_date,
                end_date=end_date,
                currency=currency,
                search=search,
                section=section,
            )
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        rows = payload.pop('rows')
        return_all = request.query_params.get('all', '').lower() in ('1', 'true', 'yes')

        meta = {
            'period': format_report_period_response(start_date, end_date),
            'base_currency': payload.get('base_currency'),
            'totals': payload.get('totals'),
            'sections': payload.get('sections'),
            'by_currency': payload.get('by_currency'),
            'currency_filter': currency,
            'section_filter': section,
        }

        if return_all:
            return Response({'results': rows, 'count': len(rows), 'meta': meta})

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(rows, request)

        if page is not None:
            response = paginator.get_paginated_response(page)
            response.data['meta'] = meta
            return response

        return Response({'results': rows, 'meta': meta})
