from api.utils.date_filters import date_range_params
from django.db.models import Sum, Q, F, ExpressionWrapper, DecimalField
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.http import Http404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from api.models.data.vendors import Vendor
from api.models.data.currency import ExchangeRate, get_currency as _get_currency
from api.models.data.account import Account


def _currency_code(currency_id):
    c = _get_currency(currency_id)
    return c['code'] if c else str(currency_id or '')
from api.serializers.data.vendors import VendorSerializer
from api.views.data.base import DataRootViewSet
from api.utils import convert_currency
from api.utils.pdf_export import export_to_pdf
from decimal import Decimal
from django.http import HttpResponse
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

class VendorViewSet(DataRootViewSet):
    permission_module = 'vendors'
    queryset = Vendor.objects.all().order_by("-id")
    serializer_class = VendorSerializer
    filterset_fields = ['is_active']

    def get_queryset(self):
        queryset = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        if status_filter == 'active':
            queryset = queryset.filter(is_active=True)
        elif status_filter == 'inactive':
            queryset = queryset.filter(is_active=False)

        return queryset
    search_fields = ["name", "phone", "email"]

    def get_serializer_context(self):
        """
        Add the user to the serializer context.
        """
        context = super().get_serializer_context()
        context['user'] = self.request.user
        return context
    
    def list(self, request, *args, **kwargs):
        """
        Override list to include financial information for each vendor.
        """
        queryset = self.filter_queryset(self.get_queryset())
        
        # Get page size from request or use default
        date_from, date_to = date_range_params(request)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            for vendor_data in serializer.data:
                vendor_data['finance'] = self._get_vendor_finance(
                    vendor_data['id'], date_from, date_to)

            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        for vendor_data in serializer.data:
            vendor_data['finance'] = self._get_vendor_finance(
                vendor_data['id'], date_from, date_to)

        return Response(serializer.data)
    
    def retrieve(self, request, *args, **kwargs):
        """
        Override retrieve to include financial information for the vendor.
        """
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        data = serializer.data
        date_from, date_to = date_range_params(request)
        data['finance'] = self._get_vendor_finance(instance.id, date_from, date_to)
        return Response(data)
    
    def _get_vendor_finance(self, vendor_id, date_from=None, date_to=None):
        from api.services.contact_ledger import get_vendor_finance
        vendor = Vendor.objects.get(id=vendor_id)
        return get_vendor_finance(vendor, date_from=date_from, date_to=date_to)
    
    @action(detail=True, methods=['get'], url_path='purchase_history')
    def purchase_history(self, request, pk=None):
        """Finished-goods purchase history removed; keep endpoint for API compatibility."""
        self.get_object()
        page = self.paginate_queryset([])
        if page is not None:
            return self.get_paginated_response(page)
        return Response([])
    
    @action(detail=True, methods=['get'], url_path='account_entry_history')
    def account_entry_history(self, request, pk=None):
        """
        Get account entry history for a specific vendor.
        """
        vendor = self.get_object()

        
        from api.services.contact_ledger import query_vendor_transactions, prepare_transaction_history

        lines = query_vendor_transactions(
            vendor,
            search=request.query_params.get('search'),
            date_from=request.query_params.get('date_from'),
            date_to=request.query_params.get('date_to'),
            currency=request.query_params.get('currency'),
        )
        lines, totals_by_currency = prepare_transaction_history(lines)

        page = self.paginate_queryset(lines)
        if page is not None:
            response = self.get_paginated_response(page)
            response.data['totals_by_currency'] = totals_by_currency
            return response

        return Response({'results': lines, 'totals_by_currency': totals_by_currency})
    
    @action(detail=True, methods=['get'], url_path='export_account_entries_excel', permission_classes=[IsAuthenticated])
    def export_account_entries_excel(self, request, pk=None):
        """
        Export account entry history for a vendor as Excel.
        """
        vendor = self.get_object()

        
        try:
            from api.models.data.account import AccountEntry
            
            accounts = Account.objects.filter(vendor=vendor, account_type='vendor')
            entries_queryset = AccountEntry.objects.filter(
                account__in=accounts
            ).select_related('account', 'entry_type').order_by('-entry_date', '-id')
            
            search = request.query_params.get('search', None)
            if search:
                entries_queryset = entries_queryset.filter(
                    Q(reference_number__icontains=search) |
                    Q(notes__icontains=search)
                )
            
            date_from, date_to = date_range_params(request)
            if date_from:
                entries_queryset = entries_queryset.filter(entry_date__gte=date_from)
            if date_to:
                entries_queryset = entries_queryset.filter(entry_date__lte=date_to)
            
            wb = Workbook()
            ws = wb.active
            ws.title = "Account Entries"
            
            header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
            header_font = Font(bold=True, color="FFFFFF")
            
            headers = ['Date', 'Entry Type', 'Reference', 'Debit', 'Credit', 'Account', 'Balance', 'Notes']
            for col_num, header in enumerate(headers, 1):
                cell = ws.cell(row=1, column=col_num, value=header)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal='center')
            
            total_debit = Decimal('0.00')
            total_credit = Decimal('0.00')
            running_balance = Decimal('0.00')
            
            for row_num, entry in enumerate(entries_queryset, 2):
                running_balance += entry.debit_amount - entry.credit_amount
                total_debit += entry.debit_amount
                total_credit += entry.credit_amount
                
                ws.cell(row=row_num, column=1, value=entry.entry_date.strftime('%d/%m/%Y %H:%M'))
                ws.cell(row=row_num, column=2, value=entry.entry_type.name)
                ws.cell(row=row_num, column=3, value=entry.reference_number or '')
                ws.cell(row=row_num, column=4, value=float(entry.debit_amount))
                ws.cell(row=row_num, column=5, value=float(entry.credit_amount))
                ws.cell(row=row_num, column=6, value=_currency_code(entry.account.currency))
                ws.cell(row=row_num, column=7, value=float(running_balance))
                ws.cell(row=row_num, column=8, value=entry.notes or '')
            
            summary_row = len(entries_queryset) + 3
            ws.cell(row=summary_row, column=1, value='TOTALS:').font = Font(bold=True)
            ws.cell(row=summary_row, column=4, value=float(total_debit)).font = Font(bold=True)
            ws.cell(row=summary_row, column=5, value=float(total_credit)).font = Font(bold=True)
            ws.cell(row=summary_row, column=7, value=float(total_debit - total_credit)).font = Font(bold=True)
            
            for col in ws.columns:
                max_length = 0
                column = col[0].column_letter
                for cell in col:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(cell.value)
                    except:
                        pass
                adjusted_width = min(max_length + 2, 50)
                ws.column_dimensions[column].width = adjusted_width
            
            safe_name = ''.join(c if c.isalnum() or c in (' ', '_', '-') else '_' for c in vendor.name)
            
            response = HttpResponse(
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="vendor_{safe_name}_account_entries.xlsx"'
            wb.save(response)
            return response
            
        except Exception as e:
            import traceback
            return Response({'error': str(e), 'traceback': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'], url_path='export_account_entries', permission_classes=[IsAuthenticated])
    def export_account_entries(self, request, pk=None):
        """
        Export account entry history for a vendor as PDF.
        """
        vendor = self.get_object()

        
        try:
            from api.models.data.account import AccountEntry
            
            accounts = Account.objects.filter(vendor=vendor, account_type='vendor')
            entries_queryset = AccountEntry.objects.filter(
                account__in=accounts
            ).select_related('account', 'entry_type').order_by('-entry_date', '-id')
            
            search = request.query_params.get('search', None)
            if search:
                entries_queryset = entries_queryset.filter(
                    Q(reference_number__icontains=search) |
                    Q(notes__icontains=search)
                )
            
            headers = ['Date', 'Entry Type', 'Reference', 'Debit', 'Credit', 'Currency', 'Notes']
            data = []
            
            for entry in entries_queryset:
                data.append([
                    entry.entry_date.strftime('%d/%m/%Y %H:%M'),
                    entry.entry_type.name,
                    entry.reference_number or '',
                    float(entry.debit_amount),
                    float(entry.credit_amount),
                    _currency_code(entry.account.currency),
                    entry.notes or ''
                ])
            
            safe_name = ''.join(c if c.isalnum() or c in (' ', '_', '-') else '_' for c in vendor.name)
            
            return export_to_pdf(
                data=data,
                headers=headers,
                filename=f'vendor_{safe_name}_account_entries.pdf',
                title=f'ACCOUNT ENTRY HISTORY',
                metadata={
                    'Vendor Name': vendor.name,
                    'Total Entries': len(data)
                }
            )
        except Exception as e:
            import traceback
            return Response({'error': str(e), 'traceback': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=True, methods=['get'], url_path='export_purchase_history', permission_classes=[IsAuthenticated])
    def export_purchase_history(self, request, pk=None):
        """Finished-goods purchase history removed; return an empty PDF for compatibility."""
        vendor = self.get_object()
        try:
            safe_name = ''.join(c if c.isalnum() or c in (' ', '_', '-') else '_' for c in vendor.name)
            return export_to_pdf(
                data=[],
                headers=[
                    'Invoice Number', 'Bill Number', 'Date', 'Status',
                    'Total Amount', 'Paid Amount', 'Remaining Amount', 'Currency',
                ],
                filename=f'vendor_{safe_name}_purchases.pdf',
                title='PURCHASE HISTORY REPORT',
                metadata={
                    'Vendor Name': vendor.name,
                    'Phone': vendor.phone or 'N/A',
                    'Email': vendor.email or 'N/A',
                    'Address': vendor.address or 'N/A',
                    'Total Transactions': 0,
                },
            )
        except Exception as e:
            import traceback
            return Response(
                {'error': str(e), 'traceback': traceback.format_exc()},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )