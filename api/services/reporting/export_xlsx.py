"""Exact, read-only Excel export for the V2 report contracts."""
import json
from io import BytesIO

from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Font
from rest_framework.exceptions import ValidationError

from .contracts import ReportScope
from .ledger import build_balances, entry_queryset, ledger_health, serialize_line
from .source_audit import source_coverage
from .opening import opening_review
from .reconciliation import reconcile_documents
from .settlements import reconcile_settlements
from .invoices import invoice_reconciliation, customer_invoice_balances
from .vendors import vendor_invoice_balances
from .party_positions import party_loan_balances, party_position_overview
from .customer_advances import customer_advance_balances
from .cash_activity import cash_activity
from .inventory_movement_review import inventory_movement_review
from .employee_payroll_activity import employee_payroll_activity
from .expense_activity import expense_activity
from .trial_balance import trial_balance_review
from .profit_loss import profit_loss_review
from .balance_sheet import balance_sheet_review
from .customer_ar_bridge import customer_ar_bridge
from .vendor_ap_bridge import vendor_ap_bridge
from .payroll_posting_bridge import payroll_posting_bridge
from .inventory_purchase_bridge import inventory_purchase_bridge
from .inventory_sale_bridge import inventory_sale_bridge
from .inventory_waste_bridge import inventory_waste_bridge
from .inventory_transformation_bridge import inventory_transformation_bridge
from .inventory_transfer_review import inventory_transfer_review
from .inventory_current_position import inventory_current_position

MAX_EXPORT_ROWS = 50000

REPORT_BUILDERS = {
    'ledger-balances': build_balances,
    'cash-balances': lambda scope: build_balances(scope, cash_only=True),
    'ledger-health': ledger_health,
    'source-coverage': source_coverage,
    'opening-review': opening_review,
    'document-reconciliation': reconcile_documents,
    'settlement-reconciliation': reconcile_settlements,
    'invoice-reconciliation': invoice_reconciliation,
    'customer-invoice-balances': customer_invoice_balances,
    'vendor-invoice-balances': vendor_invoice_balances,
    'party-loan-balances': party_loan_balances,
    'party-position-overview': party_position_overview,
    'customer-advance-balances': customer_advance_balances,
    'cash-activity': cash_activity,
    'inventory-movement-review': inventory_movement_review,
    'inventory-current-position': inventory_current_position,
    'inventory-transfer-review': inventory_transfer_review,
    'inventory-purchase-bridge': inventory_purchase_bridge,
    'inventory-sale-bridge': inventory_sale_bridge,
    'inventory-waste-bridge': inventory_waste_bridge,
    'inventory-transformation-bridge': inventory_transformation_bridge,
    'employee-payroll-activity': employee_payroll_activity,
    'payroll-posting-bridge': payroll_posting_bridge,
    'expense-activity': expense_activity,
    'trial-balance-review': trial_balance_review,
    'profit-loss-review': profit_loss_review,
    'balance-sheet-review': balance_sheet_review,
    'customer-ar-bridge': customer_ar_bridge,
    'vendor-ap-bridge': vendor_ap_bridge,
}


def _safe_cell(value):
    if value is None:
        return ''
    if isinstance(value, (dict, list, tuple)):
        value = json.dumps(value, ensure_ascii=False, default=str)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    value = str(value)
    value = ILLEGAL_CHARACTERS_RE.sub('', value)
    if len(value) > 32767:
        raise ValidationError({'report': 'A cell exceeds the Excel text limit; export a narrower period.'})
    # Keep exact money strings as text. Never allow untrusted document text to
    # become a spreadsheet formula when an export is opened.
    if value.lstrip().startswith(('=', '+', '@')):
        value = "'" + value
    return value


def _write_rows(book, name, rows):
    if len(rows) > MAX_EXPORT_ROWS:
        raise ValidationError({'report': f'Export exceeds {MAX_EXPORT_ROWS} rows. Narrow the period.'})
    sheet = book.create_sheet(name[:31])
    sheet.sheet_view.rightToLeft = True
    sheet.freeze_panes = 'A2'
    columns = list(dict.fromkeys(key for row in rows for key in row))
    sheet.append(columns)
    for cell in sheet[1]:
        cell.font = Font(bold=True)
    for row in rows:
        sheet.append([_safe_cell(row.get(key)) for key in columns])
    return sheet


def export_report_xlsx(report_id, scope: ReportScope):
    if report_id not in REPORT_BUILDERS and report_id != 'ledger-entries':
        raise ValidationError({'report': 'Unknown V2 report.'})
    if report_id == 'ledger-entries':
        queryset = entry_queryset(scope)
        if queryset.count() > MAX_EXPORT_ROWS:
            raise ValidationError({'report': f'Export exceeds {MAX_EXPORT_ROWS} rows. Narrow the period.'})
        payload = {'meta': scope.metadata(), 'results': [serialize_line(line) for line in queryset.iterator()]}
    else:
        payload = REPORT_BUILDERS[report_id](scope)

    book = Workbook()
    overview = book.active
    overview.title = 'Overview'
    overview.sheet_view.rightToLeft = True
    overview.append(['report', report_id])
    for key, value in payload.items():
        if isinstance(value, list) and all(isinstance(row, dict) for row in value):
            _write_rows(book, key, value)
        else:
            overview.append([key, _safe_cell(value)])
    overview.column_dimensions['A'].width = 35
    overview.column_dimensions['B'].width = 90
    stream = BytesIO()
    book.save(stream)
    return stream.getvalue()
