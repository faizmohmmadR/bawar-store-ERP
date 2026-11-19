from api.utils.date_filters import date_range_params
from api.serializers.data.sales import SalesSerializer
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl import Workbook
from django.http import HttpResponse
from decimal import Decimal
from api.views.data.base import DataRootViewSet
from api.utils.pdf_export import export_to_pdf
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.models.data.account import Account
from api.models.data.customers import Customer
from api.models.data.sales import Sales
from api.serializers.data.customers import CustomerSerializer
from api.models.data.currency import get_currency as _get_currency


def _currency_code(currency_id):
    c = _get_currency(currency_id)
    return c['code'] if c else str(currency_id or '')


class CustomerViewSet(DataRootViewSet):
    permission_module = 'customers'
    queryset = Customer.objects.all().order_by('-id')
    serializer_class = CustomerSerializer
    search_fields = ["name", "phone", "email"]

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        date_from, date_to = date_range_params(request)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            for customer_data in serializer.data:
                customer_data['finance'] = self._get_customer_finance(
                    customer_data['id'], date_from, date_to)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        for customer_data in serializer.data:
            customer_data['finance'] = self._get_customer_finance(
                customer_data['id'], date_from, date_to)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        data = serializer.data
        date_from, date_to = date_range_params(request)
        data['finance'] = self._get_customer_finance(
            instance.id, date_from, date_to)
        return Response(data)

    def _get_customer_finance(self, customer_id, date_from=None, date_to=None):
        from api.services.contact_ledger import get_customer_finance

        customer = Customer.objects.get(id=customer_id)
        return get_customer_finance(customer, date_from=date_from, date_to=date_to)

    @action(detail=True, methods=['get'], url_path='sales_history')
    def sales_history(self, request, pk=None):
        customer = self.get_object()

        sales_queryset = Sales.objects.filter(customer=customer).select_related(
        ).prefetch_related(
            'sales_items__stock__product'
        ).order_by('-sale_date')

        search = request.query_params.get('search')
        if search:
            sales_queryset = sales_queryset.filter(
                Q(invoice_number__icontains=search) | Q(notes__icontains=search)
            )

        status_filter = request.query_params.get('status')
        if status_filter and status_filter != 'all':
            sales_queryset = sales_queryset.filter(status=status_filter)

        date_from, date_to = date_range_params(request)
        if date_from:
            sales_queryset = sales_queryset.filter(sale_date__gte=date_from)
        if date_to:
            sales_queryset = sales_queryset.filter(sale_date__lte=date_to)

        currency_filter = request.query_params.get('currency')
        if currency_filter:
            sales_queryset = sales_queryset.filter(
                currency__code=currency_filter)

        page = self.paginate_queryset(sales_queryset)
        if page is not None:
            sales_data = []
            for sale in page:
                sale_dict = SalesSerializer(
                    sale, context={'request': request}).data
                account = Account.objects.filter(
                    customer=customer, currency=sale.currency).first()
                if account:
                    entries = account.entries.filter(
                        reference_number=sale.invoice_number)
                    total_debit = sum(e.debit_amount for e in entries)
                    total_credit = sum(e.credit_amount for e in entries)
                    sale_dict['remaining_amount'] = float(
                        total_debit - total_credit)
                else:
                    sale_dict['remaining_amount'] = float(
                        sale.total_amount - sale.paid_amount)
                sales_data.append(sale_dict)
            return self.get_paginated_response(sales_data)

        serializer = SalesSerializer(
            sales_queryset, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='account_entry_history')
    def account_entry_history(self, request, pk=None):
        customer = self.get_object()

        from api.services.contact_ledger import query_customer_transactions, prepare_transaction_history

        lines = query_customer_transactions(
            customer,
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
        customer = self.get_object()

        try:
            from api.models.data.account import AccountEntry

            entries_queryset = AccountEntry.objects.filter(
                account__in=accounts
            ).select_related('account', 'entry_type').order_by('-entry_date', '-id')

            search = request.query_params.get('search')
            if search:
                entries_queryset = entries_queryset.filter(
                    Q(reference_number__icontains=search) | Q(
                        notes__icontains=search)
                )

            date_from, date_to = date_range_params(request)
            if date_from:
                entries_queryset = entries_queryset.filter(
                    entry_date__gte=date_from)
            if date_to:
                entries_queryset = entries_queryset.filter(
                    entry_date__lte=date_to)

            wb = Workbook()
            ws = wb.active
            ws.title = "Account Entries"

            header_fill = PatternFill(
                start_color="366092", end_color="366092", fill_type="solid")
            header_font = Font(bold=True, color="FFFFFF")

            headers = ['Date', 'Entry Type', 'Reference',
                       'Debit', 'Credit', 'Account', 'Balance', 'Notes']
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

                ws.cell(row=row_num, column=1,
                        value=entry.entry_date.strftime('%d/%m/%Y %H:%M'))
                ws.cell(row=row_num, column=2, value=entry.entry_type.name)
                ws.cell(row=row_num, column=3,
                        value=entry.reference_number or '')
                ws.cell(row=row_num, column=4, value=float(entry.debit_amount))
                ws.cell(row=row_num, column=5,
                        value=float(entry.credit_amount))
                ws.cell(row=row_num, column=6,
                        value=_currency_code(entry.account.currency))
                ws.cell(row=row_num, column=7, value=float(running_balance))
                ws.cell(row=row_num, column=8, value=entry.notes or '')

            summary_row = len(entries_queryset) + 3
            ws.cell(row=summary_row, column=1,
                    value='TOTALS:').font = Font(bold=True)
            ws.cell(row=summary_row, column=4, value=float(
                total_debit)).font = Font(bold=True)
            ws.cell(row=summary_row, column=5, value=float(
                total_credit)).font = Font(bold=True)
            ws.cell(row=summary_row, column=7, value=float(
                total_debit - total_credit)).font = Font(bold=True)

            safe_name = ''.join(c if c.isalnum() or c in (
                ' ', '_', '-') else '_' for c in customer.name)

            response = HttpResponse(
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="customer_{safe_name}_account_entries.xlsx"'
            wb.save(response)
            return response

        except Exception as e:
            import traceback
            return Response({'error': str(e), 'traceback': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'], url_path='export_account_entries', permission_classes=[IsAuthenticated])
    def export_account_entries(self, request, pk=None):
        customer = self.get_object()

        try:
            from api.models.data.account import AccountEntry

            accounts = Account.objects.filter(
                customer=customer, account_type='customer')
            entries_queryset = AccountEntry.objects.filter(
                account__in=accounts
            ).select_related('account', 'entry_type').order_by('-entry_date', '-id')

            search = request.query_params.get('search')
            if search:
                entries_queryset = entries_queryset.filter(
                    Q(reference_number__icontains=search) | Q(
                        notes__icontains=search)
                )

            headers = ['Date', 'Entry Type', 'Reference',
                       'Debit', 'Credit', 'Currency', 'Notes']
            data = []

            for entry in entries_queryset:
                data.append([
                    entry.entry_date.strftime('%d/%m/%Y %H:%M'),
                    entry.entry_type.name,
                    entry.reference_number or '',
                    float(entry.debit_amount),
                    float(entry.credit_amount),
                    _currency_code(entry.account.currency),
                    entry.notes or '',
                ])

            safe_name = ''.join(c if c.isalnum() or c in (
                ' ', '_', '-') else '_' for c in customer.name)

            return export_to_pdf(
                data=data,
                headers=headers,
                filename=f'customer_{safe_name}_account_entries.pdf',
                title='ACCOUNT ENTRY HISTORY',
                metadata={
                    'Customer Name': customer.name,
                    'Total Entries': len(data),
                },
            )
        except Exception as e:
            import traceback
            return Response({'error': str(e), 'traceback': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'], url_path='export_sales_history', permission_classes=[IsAuthenticated])
    def export_sales_history(self, request, pk=None):
        customer = self.get_object()

        try:
            sales_queryset = Sales.objects.filter(customer=customer).select_related(
                'customer', 'currency'
            ).order_by('-sale_date')

            search = request.query_params.get('search')
            if search:
                sales_queryset = sales_queryset.filter(
                    Q(invoice_number__icontains=search) | Q(
                        notes__icontains=search)
                )

            headers = ['Invoice Number', 'Date', 'Status', 'Total Amount',
                       'Paid Amount', 'Remaining Amount', 'Currency']
            data = []

            for sale in sales_queryset:
                remaining = sale.total_amount - sale.paid_amount
                data.append([
                    sale.invoice_number,
                    sale.sale_date.strftime('%d/%m/%Y'),
                    sale.status,
                    float(sale.total_amount),
                    float(sale.paid_amount),
                    float(remaining),
                    _currency_code(sale.currency),
                ])

            customer_finance = self._get_customer_finance(customer.id)
            finance_summary = {}
            for currency_code, bucket in customer_finance.items():
                if bucket['total_debit'] == 0 and bucket['total_credit'] == 0 and bucket['balance'] == 0:
                    continue
                code = currency_code.upper()
                finance_summary[f'{code} Summary'] = ''
                finance_summary[f'  Total Debit ({code})'] = f"{bucket['total_debit']:.2f}"
                finance_summary[f'  Total Credit ({code})'] = f"{bucket['total_credit']:.2f}"
                finance_summary[f'  Balance ({code})'] = f"{bucket['balance']:.2f}"

            safe_name = ''.join(c if c.isalnum() or c in (
                ' ', '_', '-') else '_' for c in customer.name)
            return export_to_pdf(
                data=data,
                headers=headers,
                filename=f'customer_{safe_name}_sales.pdf',
                title='SALES HISTORY REPORT',
                metadata={
                    'Customer Name': customer.name,
                    'Phone': customer.phone or 'N/A',
                    'Email': customer.email or 'N/A',
                    'Total Transactions': len(data),
                },
                finance_summary=finance_summary if finance_summary else None,
            )
        except Exception as e:
            import traceback
            return Response({'error': str(e), 'traceback': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
