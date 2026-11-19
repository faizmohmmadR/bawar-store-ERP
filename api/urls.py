from django.urls import path, include
from rest_framework import routers
from api.views.data.reports_v2 import ReportsV2ViewSet

# ====================== HR MANAGEMENT ======================
from api.views.data.employee import EmployeeViewSet
from api.views.data.payroll import PayrollViewSet
from api.views.data.employee_pay_entries import (
    EmployeeAbsenceEntryViewSet,
    EmployeeOvertimeEntryViewSet,
)
from api.views.data.attendance import AttendanceViewSet, EmployeeLeaveViewSet

# ====================== PRODUCT & INVENTORY ======================
from api.views.data.products import ProductViewSet
from api.views.data.stock import StockViewSet
from api.views.data.stock_bottle_damage import StockBottleDamageViewSet
from api.views.data.inventory_batch import (
    InventoryBatchViewSet,
    SaleBatchAllocationViewSet,
    StockAdjustmentViewSet,
)

# ====================== PEOPLE & ORGANIZATIONS ======================
from api.views.data.customers import CustomerViewSet
from api.views.data.vendors import VendorViewSet
from api.views.data.salesmen import SalesmanViewSet
from api.views.data.salesman_commission_payment import SalesmanCommissionPaymentViewSet

# ====================== SALES ======================
from api.views.data.sales import (
    RawMaterialSalesViewSet,
    SalesViewSet,
    SalesItemsViewSet,
)

# ====================== RAW MATERIALS ======================
from api.views.data.raw_materials import (
    RawMaterialViewSet,
    RawMaterialCategoryViewSet,
    RawMaterialPurchaseViewSet,
    RawMaterialStockViewSet,
)
from api.views.data.raw_material_process import RawMaterialProcessViewSet
from api.views.data.storage_tanks import StorageTankViewSet
from api.views.data.storage_tank_leak import StorageTankLeakViewSet
from api.views.data.packing import PackingRunViewSet
from api.views.data.damaged_materials import DamagedMaterialRecordViewSet

# ====================== RETURNS ======================
from api.views.data.returns import ReturnViewSet, ReturnItemsViewSet

# ====================== ACCOUNTS ======================
from api.views.data.account import AccountViewSet
from api.views.data.journal import AccountingSettingsViewSet, GLAccountViewSet, JournalEntryViewSet
from api.views.data.fiscal_year import FiscalYearViewSet

# ====================== EXPENSES ======================
from api.views.data.expenses import ExpenseViewSet, ExpenseCategoryViewSet

# ====================== FUNDING ======================
from api.views.data.withdrawal import WithdrawalViewSet
from api.views.data.currency_exchange import CurrencyExchangeViewSet
from api.views.data.fx_revaluation import FxRevaluationViewSet

# ====================== EQUIPMENT ======================
from api.views.data.equipment import EquipmentViewSet
from api.views.data.equipment_depreciation import EquipmentDepreciationViewSet

# ====================== LOANS ======================
from api.views.data.loan import LoanViewSet, LoanPaymentViewSet

# ====================== PAYMENTS ======================
from api.views.data.payment import PaymentViewSet
from api.views.data.general_payment import GeneralPaymentViewSet
from api.views.data.attachment import AttachedDocumentViewSet

# ====================== CURRENCY ======================
from api.views.data.exchange_rate import ExchangeRateViewSet

# ====================== PERMISSIONS ======================
from api.views.data.permissions import PermissionViewSet, UserPermissionViewSet

# ====================== ACTIVITY LOGS ======================
from api.views.data.activity_log import ActivityLogViewSet

# ====================== NOTIFICATIONS ======================
from api.views.data.notification import NotificationViewSet

# ====================== REPORTS ======================
from api.views.data.reports import FinancialReportViewSet
from api.views.data.daily_ledger import DailyLedgerViewSet
from api.views.data.trash import TrashListView, TrashPermanentDeleteView, TrashRestoreView


class OptionalSlashRouter(routers.SimpleRouter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = '/?'


router = OptionalSlashRouter()

# HR Management
router.register(r'employees', EmployeeViewSet, basename='employee')
router.register(r'payrolls', PayrollViewSet, basename='payroll')
router.register(
    r'employee-overtime-entries',
    EmployeeOvertimeEntryViewSet,
    basename='employee-overtime-entry',
)
router.register(
    r'employee-absence-entries',
    EmployeeAbsenceEntryViewSet,
    basename='employee-absence-entry',
)
router.register(r'attendances', AttendanceViewSet, basename='attendance')
router.register(r'employee-leaves', EmployeeLeaveViewSet,
                basename='employee-leave')

# Product & Inventory
router.register(r'products', ProductViewSet, basename='product')
router.register(r'stocks', StockViewSet, basename='stock')
router.register(r'stock-bottle-damages', StockBottleDamageViewSet, basename='stock-bottle-damage')
router.register(r'inventory-batches', InventoryBatchViewSet,
                basename='inventory-batch')
router.register(r'sale-batch-allocations',
                SaleBatchAllocationViewSet, basename='sale-batch-allocation')
router.register(r'stock-adjustments', StockAdjustmentViewSet,
                basename='stock-adjustment')

# People & Organizations
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'customer-users', CustomerViewSet, basename='customer-user')
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'salesmen', SalesmanViewSet, basename='salesman')
router.register(
    r'salesman-commission-payments',
    SalesmanCommissionPaymentViewSet,
    basename='salesman-commission-payment',
)

# Sales
router.register(r'sales', SalesViewSet, basename='sale')
router.register(
    r'raw-material-sales',
    RawMaterialSalesViewSet,
    basename='raw-material-sale',
)
router.register(r'sales-items', SalesItemsViewSet, basename='sales-item')

# Raw Materials
router.register(r'raw-material-categories', RawMaterialCategoryViewSet, basename='raw-material-category')
router.register(r'raw-materials', RawMaterialViewSet, basename='raw-material')
router.register(r'raw-material-purchases',
                RawMaterialPurchaseViewSet, basename='raw-material-purchase')
router.register(r'raw-material-stocks', RawMaterialStockViewSet,
                basename='raw-material-stock')

# Raw Material Production
router.register(r'raw-material-processes',
                RawMaterialProcessViewSet, basename='raw-material-process')
router.register(r'storage-tanks', StorageTankViewSet, basename='storage-tank')
router.register(r'storage-tank-leaks', StorageTankLeakViewSet, basename='storage-tank-leak')
router.register(r'packing-runs', PackingRunViewSet, basename='packing-run')
router.register(r'damaged-materials', DamagedMaterialRecordViewSet, basename='damaged-material')

# Returns
router.register(r'returns', ReturnViewSet, basename='return')
router.register(r'return-items', ReturnItemsViewSet, basename='return-item')

# Accounting
router.register(r'gl-accounts', GLAccountViewSet, basename='gl-account')
router.register(r'accounts', AccountViewSet, basename='account')
router.register(r'journal-entries', JournalEntryViewSet,
                basename='journal-entry')
router.register(r'accounting-settings', AccountingSettingsViewSet,
                basename='accounting-settings')
router.register(r'fiscal-years', FiscalYearViewSet, basename='fiscal-year')

# Expenses
router.register(r'expense-categories', ExpenseCategoryViewSet,
                basename='expense-category')
router.register(r'expenses', ExpenseViewSet, basename='expense')

# Withdrawals (owner draw from cash / bank / sarafi)
router.register(r'withdrawals', WithdrawalViewSet, basename='withdrawal')

# Currency exchange
router.register(r'currency-exchanges', CurrencyExchangeViewSet,
                basename='currency-exchange')
router.register(r'fx-revaluations', FxRevaluationViewSet,
                basename='fx-revaluation')

# Equipment
router.register(r'equipment', EquipmentViewSet, basename='equipment')
router.register(r'equipment-depreciation', EquipmentDepreciationViewSet, basename='equipment-depreciation')

# Loans
router.register(r'loans', LoanViewSet, basename='loan')
router.register(r'loan-payments', LoanPaymentViewSet, basename='loan-payment')

# Payments
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'general-payments', GeneralPaymentViewSet, basename='general-payment')
router.register(r'attachments', AttachedDocumentViewSet, basename='attachment')

# Currency
router.register(r'exchange-rates', ExchangeRateViewSet,
                basename='exchange-rate')

# Permissions
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'users/(?P<user_id>[^/.]+)/permissions',
                UserPermissionViewSet, basename='user-permission')

# Activity Logs
router.register(r'activity-logs', ActivityLogViewSet, basename='activity-log')

# Notifications
router.register(r'notifications', NotificationViewSet, basename='notification')

# Financial Reports
router.register(r'reports/v2', ReportsV2ViewSet, basename='reports-v2')
router.register(r'reports', FinancialReportViewSet, basename='report')
router.register(r'daily-ledger', DailyLedgerViewSet, basename='daily-ledger')

urlpatterns = [
    path("", include(router.urls)),
    path("trash/", TrashListView.as_view(), name="trash-list"),
    path("trash/restore/", TrashRestoreView.as_view(), name="trash-restore"),
    path("trash/permanent-delete/", TrashPermanentDeleteView.as_view(),
         name="trash-permanent-delete"),
]
