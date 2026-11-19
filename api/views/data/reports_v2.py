"""Read-only, separately versioned reporting endpoints."""
from django.http import HttpResponse
from rest_framework.exceptions import ValidationError
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ViewSet
from rest_framework.pagination import PageNumberPagination

from account.permissions import HasPermission
from api.services.reporting.contracts import METRICS, ReportScope
from api.services.reporting.ledger import build_balances, entry_queryset, ledger_health, serialize_line
from api.services.reporting.source_audit import source_coverage
from api.services.reporting.opening import opening_review
from api.services.reporting.reconciliation import reconcile_documents
from api.services.reporting.settlements import reconcile_settlements
from api.services.reporting.invoices import invoice_reconciliation, customer_invoice_balances
from api.services.reporting.vendors import vendor_invoice_balances
from api.services.reporting.party_positions import party_loan_balances, party_position_overview
from api.services.reporting.customer_advances import customer_advance_balances
from api.services.reporting.cash_activity import cash_activity
from api.services.reporting.inventory_movement_review import inventory_movement_review
from api.services.reporting.employee_payroll_activity import employee_payroll_activity
from api.services.reporting.expense_activity import expense_activity
from api.services.reporting.trial_balance import trial_balance_review
from api.services.reporting.profit_loss import profit_loss_review
from api.services.reporting.balance_sheet import balance_sheet_review
from api.services.reporting.customer_ar_bridge import customer_ar_bridge
from api.services.reporting.vendor_ap_bridge import vendor_ap_bridge
from api.services.reporting.payroll_posting_bridge import payroll_posting_bridge
from api.services.reporting.inventory_purchase_bridge import inventory_purchase_bridge
from api.services.reporting.inventory_sale_bridge import inventory_sale_bridge
from api.services.reporting.inventory_waste_bridge import inventory_waste_bridge
from api.services.reporting.inventory_transformation_bridge import inventory_transformation_bridge
from api.services.reporting.inventory_transfer_review import inventory_transfer_review
from api.services.reporting.inventory_current_position import inventory_current_position
from api.services.reporting.export_xlsx import export_report_xlsx


class ReportPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class ReportsV2ViewSet(ViewSet):
    permission_classes = [IsAuthenticated, HasPermission('view_reports')]

    @action(detail=False, methods=['get'], url_path='export-xlsx')
    def export_xlsx(self, request):
        report_id = request.query_params.get('report')
        if not report_id:
            raise ValidationError({'report': 'A V2 report is required.'})
        filters = request.query_params.copy()
        filters.pop('report', None)
        content = export_report_xlsx(report_id, ReportScope.from_params(filters))
        response = HttpResponse(content,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="report-v2-{report_id}.xlsx"'
        return response

    @action(detail=False, methods=['get'])
    def definitions(self, request):
        return Response({'version': 2, 'metrics': METRICS})

    @action(detail=False, methods=['get'], url_path='ledger-balances')
    def balances(self, request):
        return Response(build_balances(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='cash-balances')
    def cash(self, request):
        return Response(build_balances(ReportScope.from_params(request.query_params), cash_only=True))

    @action(detail=False, methods=['get'], url_path='cash-activity')
    def cash_activity(self, request):
        payload = cash_activity(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('movements'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='inventory-movement-review')
    def inventory_movements(self, request):
        payload = inventory_movement_review(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('events'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='employee-payroll-activity')
    def employee_payroll_activity(self, request):
        payload = employee_payroll_activity(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('events'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='expense-activity')
    def expense_activity(self, request):
        payload = expense_activity(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('rows'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='trial-balance-review')
    def trial_balance_review(self, request):
        return Response(trial_balance_review(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='profit-loss-review')
    def profit_loss_review(self, request):
        return Response(profit_loss_review(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='balance-sheet-review')
    def balance_sheet_review(self, request):
        return Response(balance_sheet_review(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='customer-ar-bridge')
    def customer_ar_bridge(self, request):
        return Response(customer_ar_bridge(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='vendor-ap-bridge')
    def vendor_ap_bridge(self, request):
        return Response(vendor_ap_bridge(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='payroll-posting-bridge')
    def payroll_posting_bridge(self, request):
        return Response(payroll_posting_bridge(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='inventory-purchase-bridge')
    def inventory_purchase_bridge(self, request):
        return Response(inventory_purchase_bridge(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='inventory-sale-bridge')
    def inventory_sale_bridge(self, request):
        return Response(inventory_sale_bridge(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='inventory-waste-bridge')
    def inventory_waste_bridge(self, request):
        return Response(inventory_waste_bridge(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='inventory-transformation-bridge')
    def inventory_transformation_bridge(self, request):
        return Response(inventory_transformation_bridge(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='inventory-transfer-review')
    def inventory_transfer_review(self, request):
        return Response(inventory_transfer_review(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='inventory-current-position')
    def inventory_current_position(self, request):
        return Response(inventory_current_position(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='ledger-health')
    def health(self, request):
        return Response(ledger_health(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='source-coverage')
    def coverage(self, request):
        payload = source_coverage(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('findings'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='opening-review')
    def opening(self, request):
        return Response(opening_review(ReportScope.from_params(request.query_params)))

    @action(detail=False, methods=['get'], url_path='document-reconciliation')
    def reconciliation(self, request):
        payload = reconcile_documents(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('findings'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='settlement-reconciliation')
    def settlements(self, request):
        payload = reconcile_settlements(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('findings'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='ledger-entries')
    def entries(self, request):
        scope = ReportScope.from_params(request.query_params)
        paginator = ReportPagination()
        page = paginator.paginate_queryset(entry_queryset(scope), request)
        response = paginator.get_paginated_response([serialize_line(line) for line in page])
        response.data['meta'] = scope.metadata()
        return response

    @action(detail=False, methods=['get'], url_path='invoice-reconciliation')
    def invoices(self, request):
        payload = invoice_reconciliation(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('findings'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='customer-invoice-balances')
    def customer_balances(self, request):
        payload = customer_invoice_balances(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('rows'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='vendor-invoice-balances')
    def vendor_balances(self, request):
        payload = vendor_invoice_balances(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('rows'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='party-loan-balances')
    def loan_balances(self, request):
        payload = party_loan_balances(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('rows'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='party-position-overview')
    def party_positions(self, request):
        payload = party_position_overview(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('rows'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response

    @action(detail=False, methods=['get'], url_path='customer-advance-balances')
    def customer_advances(self, request):
        payload = customer_advance_balances(ReportScope.from_params(request.query_params))
        paginator = ReportPagination()
        page = paginator.paginate_queryset(payload.pop('rows'), request)
        response = paginator.get_paginated_response(page)
        response.data.update(payload)
        return response
