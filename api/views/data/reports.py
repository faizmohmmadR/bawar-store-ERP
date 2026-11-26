from rest_framework.viewsets import ViewSet
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

from account.permissions import IsSuperUser, HasPermission
from api.services.financial_reports import (
    get_base_currency_report,
    get_by_currency_report,
    get_top_products,
)
from api.services.operational_report import get_operational_report
from api.services.report_period import format_report_period_response, resolve_report_period
from api.services.report_history import (
    build_report_history,
    history_meta_title,
    resolve_report_sections,
)
from api.views.data.pagination import CustomPagination


class FinancialReportViewSet(ViewSet):
    """Financial reporting — base currency (AFN consolidated) and per-currency breakdown."""

    permission_classes = [IsAuthenticated, HasPermission('view_reports')]
    pagination_class = CustomPagination

    def _parse_date_filter(self, default_period='daily'):
        fiscal_year_id = self.request.query_params.get('fiscal_year_id')
        return resolve_report_period(
            period=self.request.query_params.get('period', default_period),
            start_date=self.request.query_params.get('start_date') or self.request.query_params.get('date_from'),
            end_date=self.request.query_params.get('end_date') or self.request.query_params.get('date_to'),
            fiscal_year_id=fiscal_year_id,
        )

    @action(detail=False, methods=['get'], url_path='base_summary')
    def base_summary(self, request):
        """
        Main consolidated report in base currency (AFN).
        All values from stored *_base fields across sales, purchases, expenses, payroll, etc.
        """

        start_date, end_date = self._parse_date_filter()
        report = get_base_currency_report(
            start_date=start_date,
            end_date=end_date,
        )
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })

    @action(detail=False, methods=['get'], url_path='history')
    def history(self, request):
        """
        Paginated business records behind a report metric or breakdown row.
        Independent of GL/sub-accounts — uses the same sources as financial_reports.
        """
        start_date, end_date = self._parse_date_filter(default_period='all')

        sections, error = resolve_report_sections(
            section=request.query_params.get('section'),
            metric=request.query_params.get('metric'),
            breakdown=request.query_params.get('breakdown'),
        )
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        currency = (request.query_params.get('currency') or '').strip() or None
        search = request.query_params.get('search')

        try:
            rows, totals = build_report_history(
                start_date=start_date,
                end_date=end_date,
                sections=sections,
                currency=currency,
                search=search,
            )
        finally:
            pass

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(rows, request)
        meta = {
            'title': history_meta_title(
                sections=sections,
                metric=request.query_params.get('metric'),
                breakdown=request.query_params.get('breakdown'),
            ),
            'sections': sections,
            'metric': request.query_params.get('metric'),
            'breakdown': request.query_params.get('breakdown'),
            'currency': currency,
            'period': format_report_period_response(start_date, end_date),
            'totals': totals,
        }

        if page is not None:
            response = paginator.get_paginated_response(page)
            response.data['meta'] = meta
            return response

        return Response({'results': rows, 'meta': meta})

    @action(detail=False, methods=['get'], url_path='by_currency')
    def by_currency(self, request):
        """
        Per-currency report — each currency shown separately in native amounts.
        No cross-currency conversion is applied.
        """
        start_date, end_date = self._parse_date_filter()
        report = get_by_currency_report(
            start_date=start_date,
            end_date=end_date,
        )
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })

    @action(detail=False, methods=['get'], url_path='management')
    def management(self, request):
        """Alias of operational AFN business performance report."""
        return self.operational(request)

    @action(detail=False, methods=['get'], url_path='operational')
    def operational(self, request):
        """
        Professional operational report (AFN):
        sales, purchases, stock, expenses, payroll, loans, and profit.
        """
        start_date, end_date = self._parse_date_filter()
        try:
            top_limit = int(request.query_params.get('top_limit') or 10)
        except (TypeError, ValueError):
            top_limit = 10
        report = get_operational_report(
            start_date=start_date,
            end_date=end_date,
            top_limit=top_limit,
        )
        return Response({
            'period': format_report_period_response(start_date, end_date),
            **report,
        })

    @action(detail=False, methods=['get'], url_path='top_products')
    def top_products(self, request):
        """Top selling products by quantity for the selected period."""
        start_date, end_date = self._parse_date_filter()
        try:
            limit = int(request.query_params.get('limit') or 10)
        except (TypeError, ValueError):
            limit = 10
        rows = get_top_products(
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )
        return Response({
            'period': format_report_period_response(start_date, end_date),
            'results': rows,
            'count': len(rows),
        })
