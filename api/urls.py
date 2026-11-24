from django.urls import path, include
from rest_framework import routers
from api.views.data.reports_v2 import ReportsV2ViewSet

from api.views.data.employee import EmployeeViewSet
from api.views.data.payroll import PayrollViewSet
from api.views.data.employee_pay_entries import (
    EmployeeAbsenceEntryViewSet,
    EmployeeOvertimeEntryViewSet,
)
from api.views.data.attendance import AttendanceViewSet, EmployeeLeaveViewSet

from api.views.data.products import ProductViewSet, ProductPackagingViewSet, ProductCategoryViewSet
from api.views.data.stock import StockViewSet
from api.views.data.inventory_batch import (
    InventoryBatchViewSet,
    SaleBatchAllocationViewSet,
    StockAdjustmentViewSet,
)
from api.views.data.uom import UnitCategoryViewSet, UnitOfMeasureViewSet
from api.views.data.warehouse import WarehouseViewSet
from api.views.data.inventory_ledger import InventoryBalanceViewSet, StockMovementViewSet
from api.views.data.purchases import PurchaseViewSet, PurchaseItemViewSet

from api.views.data.customers import CustomerViewSet
from api.views.data.vendors import VendorViewSet
from api.views.data.salesmen import SalesmanViewSet
from api.views.data.salesman_commission_payment import SalesmanCommissionPaymentViewSet

from api.views.data.sales import SalesViewSet, SalesItemsViewSet
from api.views.data.returns import ReturnViewSet, ReturnItemsViewSet

from api.views.data.account import AccountViewSet
from api.views.data.journal import AccountingSettingsViewSet, GLAccountViewSet, JournalEntryViewSet
from api.views.data.fiscal_year import FiscalYearViewSet

from api.views.data.expenses import ExpenseViewSet, ExpenseCategoryViewSet
from api.views.data.withdrawal import WithdrawalViewSet
from api.views.data.cash_register import CashRegisterViewSet
from api.views.data.currency_exchange import CurrencyExchangeViewSet
from api.views.data.fx_revaluation import FxRevaluationViewSet
from api.views.data.equipment import EquipmentViewSet
from api.views.data.equipment_depreciation import EquipmentDepreciationViewSet
from api.views.data.loan import LoanViewSet, LoanPaymentViewSet
from api.views.data.payment import PaymentViewSet
from api.views.data.general_payment import GeneralPaymentViewSet
from api.views.data.attachment import AttachedDocumentViewSet
from api.views.data.exchange_rate import ExchangeRateViewSet
from api.views.data.permissions import PermissionViewSet, UserPermissionViewSet
from api.views.data.activity_log import ActivityLogViewSet
from api.views.data.notification import NotificationViewSet
from api.views.data.reports import FinancialReportViewSet
from api.views.data.daily_ledger import DailyLedgerViewSet
from api.views.data.trash import TrashListView, TrashPermanentDeleteView, TrashRestoreView


class OptionalSlashRouter(routers.SimpleRouter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.trailing_slash = '/?'


router = OptionalSlashRouter()

router.register(r'employees', EmployeeViewSet, basename='employee')
router.register(r'payrolls', PayrollViewSet, basename='payroll')
router.register(r'employee-overtime-entries', EmployeeOvertimeEntryViewSet, basename='employee-overtime-entry')
router.register(r'employee-absence-entries', EmployeeAbsenceEntryViewSet, basename='employee-absence-entry')
router.register(r'attendances', AttendanceViewSet, basename='attendance')
router.register(r'employee-leaves', EmployeeLeaveViewSet, basename='employee-leave')

router.register(r'unit-categories', UnitCategoryViewSet, basename='unit-category')
router.register(r'units-of-measure', UnitOfMeasureViewSet, basename='unit-of-measure')
router.register(r'warehouses', WarehouseViewSet, basename='warehouse')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'product-packagings', ProductPackagingViewSet, basename='product-packaging')
router.register(r'product-categories', ProductCategoryViewSet, basename='product-category')
router.register(r'stocks', StockViewSet, basename='stock')
router.register(r'inventory-balances', InventoryBalanceViewSet, basename='inventory-balance')
router.register(r'stock-movements', StockMovementViewSet, basename='stock-movement')
router.register(r'inventory-batches', InventoryBatchViewSet, basename='inventory-batch')
router.register(r'sale-batch-allocations', SaleBatchAllocationViewSet, basename='sale-batch-allocation')
router.register(r'stock-adjustments', StockAdjustmentViewSet, basename='stock-adjustment')

router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'customer-users', CustomerViewSet, basename='customer-user')
router.register(r'vendors', VendorViewSet, basename='vendor')
router.register(r'salesmen', SalesmanViewSet, basename='salesman')
router.register(r'salesman-commission-payments', SalesmanCommissionPaymentViewSet, basename='salesman-commission-payment')

router.register(r'sales', SalesViewSet, basename='sale')
router.register(r'sales-items', SalesItemsViewSet, basename='sales-item')
router.register(r'purchases', PurchaseViewSet, basename='purchase')
router.register(r'purchase-items', PurchaseItemViewSet, basename='purchase-item')

router.register(r'returns', ReturnViewSet, basename='return')
router.register(r'return-items', ReturnItemsViewSet, basename='return-item')

router.register(r'gl-accounts', GLAccountViewSet, basename='gl-account')
router.register(r'accounts', AccountViewSet, basename='account')
router.register(r'journal-entries', JournalEntryViewSet, basename='journal-entry')
router.register(r'accounting-settings', AccountingSettingsViewSet, basename='accounting-settings')
router.register(r'fiscal-years', FiscalYearViewSet, basename='fiscal-year')

router.register(r'expense-categories', ExpenseCategoryViewSet, basename='expense-category')
router.register(r'expenses', ExpenseViewSet, basename='expense')
router.register(r'withdrawals', WithdrawalViewSet, basename='withdrawal')
router.register(r'cash-register', CashRegisterViewSet, basename='cash-register')
router.register(r'currency-exchanges', CurrencyExchangeViewSet, basename='currency-exchange')
router.register(r'fx-revaluations', FxRevaluationViewSet, basename='fx-revaluation')
router.register(r'equipment', EquipmentViewSet, basename='equipment')
router.register(r'equipment-depreciation', EquipmentDepreciationViewSet, basename='equipment-depreciation')
router.register(r'loans', LoanViewSet, basename='loan')
router.register(r'loan-payments', LoanPaymentViewSet, basename='loan-payment')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'general-payments', GeneralPaymentViewSet, basename='general-payment')
router.register(r'attachments', AttachedDocumentViewSet, basename='attachment')
router.register(r'exchange-rates', ExchangeRateViewSet, basename='exchange-rate')
router.register(r'permissions', PermissionViewSet, basename='permission')
router.register(r'users/(?P<user_id>[^/.]+)/permissions', UserPermissionViewSet, basename='user-permission')
router.register(r'activity-logs', ActivityLogViewSet, basename='activity-log')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'reports/v2', ReportsV2ViewSet, basename='reports-v2')
router.register(r'reports', FinancialReportViewSet, basename='report')
router.register(r'daily-ledger', DailyLedgerViewSet, basename='daily-ledger')

urlpatterns = [
    path("", include(router.urls)),
    path("trash/", TrashListView.as_view(), name="trash-list"),
    path("trash/restore/", TrashRestoreView.as_view(), name="trash-restore"),
    path("trash/permanent-delete/", TrashPermanentDeleteView.as_view(), name="trash-permanent-delete"),
]
