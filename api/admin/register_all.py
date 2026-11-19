"""Register remaining ERP models in Django admin."""
from django.contrib import admin

from api.admin.common import ReadOnlySoftDeleteAdmin, SoftDeleteModelAdmin
from api.models.data.account import Account, AccountEntry, EntryType
from api.models.data.activity_log import ActivityLog
from api.models.data.attachment import AttachedDocument
from api.models.data.attendance import Attendance, EmployeeLeave
from api.models.data.currency import ExchangeRate
from api.models.data.currency_exchange import CurrencyExchange
from api.models.data.customers import Customer
from api.models.data.damaged_materials import DamagedMaterialItem, DamagedMaterialRecord
from api.models.data.document_number_sequence import DocumentNumberSequence
from api.models.data.employee import Employee
from api.models.data.employee_pay_entries import EmployeeAbsenceEntry, EmployeeOvertimeEntry
from api.models.data.equipment import Equipment, EquipmentDepreciation
from api.models.data.expenses import Expense, ExpenseCategory
from api.models.data.fiscal_year import FiscalYear
from api.models.data.fx_revaluation import FxRevaluation
from api.models.data.inventory_batch import InventoryBatch
from api.models.data.journal import AccountingSettings
from api.models.data.loan import Loan, LoanPayment
from api.models.data.packing import (
    PackingReturn,
    PackingReturnEvent,
    PackingRun,
    PackingRunComponent,
    PackingRunOutput,
)
from api.models.data.payment import GeneralPayment, Payment
from api.models.data.payroll import Payroll
from api.models.data.permissions import Permission, UserPermission
from api.models.data.products import Product
from api.models.data.raw_material_process import RawMaterialProcess, RawMaterialProcessItem
from api.models.data.raw_materials import (
    RawMaterial,
    RawMaterialCategory,
    RawMaterialPurchase,
    RawMaterialPurchaseItem,
    RawMaterialStock,
)
from api.models.data.returns import Return, ReturnItems
from api.models.data.sale_batch_allocation import SaleBatchAllocation
from api.models.data.sales import Sales, SalesItems
from api.models.data.salesman_commission_payment import SalesmanCommissionPayment
from api.models.data.salesmen import Salesman
from api.models.data.stock import Stock
from api.models.data.stock_adjustment import StockAdjustment
from api.models.data.stock_bottle_damage import StockBottleDamage
from api.models.data.stock_transfer import StockTransfer
from api.models.data.storage_tank import ProductionStorageTransfer, StorageTank
from api.models.data.storage_tank_leak import StorageTankLeak
from api.models.data.vendors import Vendor
from api.models.data.withdrawal import Withdrawal


# ---------------------------------------------------------------------------
# Parties / catalog
# ---------------------------------------------------------------------------


@admin.register(Customer)
class CustomerAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'phone', 'email', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'phone', 'email', 'address')


@admin.register(Vendor)
class VendorAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'phone', 'email', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'phone', 'email', 'address')


@admin.register(Salesman)
class SalesmanAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'phone', 'email', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'phone', 'email')


@admin.register(Product)
class ProductAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'barcode', 'packaging_type', 'raw_material')
    list_filter = ('packaging_type',)
    search_fields = ('name', 'barcode', 'description')
    autocomplete_fields = ('raw_material',)
    list_select_related = ('raw_material',)


@admin.register(RawMaterialCategory)
class RawMaterialCategoryAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name')
    search_fields = ('name',)


@admin.register(RawMaterial)
class RawMaterialAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'material_type', 'category', 'unit', 'capacity_kg')
    list_filter = ('material_type', 'unit', 'category')
    search_fields = ('name', 'description')
    autocomplete_fields = ('category',)
    list_select_related = ('category',)


# ---------------------------------------------------------------------------
# Inventory / stock
# ---------------------------------------------------------------------------


@admin.register(Stock)
class StockAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'product', 'condition', 'piece_amount', 'buy_price', 'currency', 'expire_date')
    list_filter = ('condition', 'currency')
    search_fields = ('product__name', 'notes')
    autocomplete_fields = ('product',)
    list_select_related = ('product',)


@admin.register(InventoryBatch)
class InventoryBatchAdmin(SoftDeleteModelAdmin):
    list_display = (
        'batch_number',
        'product',
        'condition',
        'remaining_pieces',
        'unit_cost',
        'currency',
        'status',
        'expire_date',
    )
    list_filter = ('status', 'condition', 'currency')
    search_fields = ('batch_number', 'product__name')
    autocomplete_fields = ('product', 'supplier')
    list_select_related = ('product', 'supplier')
    date_hierarchy = 'expire_date'


@admin.register(StockAdjustment)
class StockAdjustmentAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'inventory_batch',
        'adjustment_type',
        'quantity_change',
        'unit_cost',
        'adjustment_date',
        'adjusted_by',
    )
    list_filter = ('adjustment_type', 'adjustment_date')
    search_fields = ('reason', 'reference_number', 'inventory_batch__batch_number')
    autocomplete_fields = ('inventory_batch', 'adjusted_by')
    list_select_related = ('inventory_batch', 'adjusted_by')
    date_hierarchy = 'adjustment_date'


@admin.register(StockTransfer)
class StockTransferAdmin(SoftDeleteModelAdmin):
    list_display = (
        'transfer_number',
        'product',
        'condition',
        'piece_amount',
        'status',
        'transfer_date',
    )
    list_filter = ('status', 'condition', 'reason')
    search_fields = ('transfer_number', 'product__name', 'notes')
    autocomplete_fields = ('product', 'target_product', 'source_stock')
    date_hierarchy = 'transfer_date'


@admin.register(SaleBatchAllocation)
class SaleBatchAllocationAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'sale', 'sale_item', 'inventory_batch', 'quantity', 'unit_cost', 'returned_quantity')
    search_fields = ('sale__invoice_number', 'inventory_batch__batch_number')
    autocomplete_fields = ('sale', 'sale_item', 'inventory_batch')
    list_select_related = ('sale', 'sale_item', 'inventory_batch')


@admin.register(RawMaterialStock)
class RawMaterialStockAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'raw_material', 'quantity', 'piece_count', 'last_purchase_price', 'last_purchase_date')
    search_fields = ('raw_material__name',)
    autocomplete_fields = ('raw_material',)
    list_select_related = ('raw_material',)


# ---------------------------------------------------------------------------
# Purchases / sales / returns
# ---------------------------------------------------------------------------


class RawMaterialPurchaseItemInline(admin.TabularInline):
    model = RawMaterialPurchaseItem
    extra = 0
    autocomplete_fields = ('raw_material',)


@admin.register(RawMaterialPurchase)
class RawMaterialPurchaseAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'invoice_number',
        'vendor',
        'transaction_type',
        'status',
        'purchase_date',
        'currency',
        'total_amount',
        'paid_amount',
    )
    list_filter = ('status', 'transaction_type', 'currency', 'purchase_date')
    search_fields = ('invoice_number', 'bill_number', 'vendor__name', 'notes')
    autocomplete_fields = ('vendor',)
    date_hierarchy = 'purchase_date'
    inlines = [RawMaterialPurchaseItemInline]
    list_select_related = ('vendor',)


@admin.register(RawMaterialPurchaseItem)
class RawMaterialPurchaseItemAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'purchase', 'raw_material', 'quantity', 'piece_count', 'price_per_unit', 'total_price')
    search_fields = ('purchase__invoice_number', 'raw_material__name')
    autocomplete_fields = ('purchase', 'raw_material')
    list_select_related = ('purchase', 'raw_material')


class SalesItemsInline(admin.TabularInline):
    model = SalesItems
    extra = 0
    autocomplete_fields = ('stock', 'storage_tank', 'raw_material_stock')
    fields = (
        'sale_source',
        'stock',
        'storage_tank',
        'raw_material_stock',
        'unit',
        'quantity',
        'sell_price',
        'unit_cost',
        'commission_amount',
    )


@admin.register(Sales)
class SalesAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'invoice_number',
        'transaction_type',
        'customer',
        'vendor',
        'employee',
        'status',
        'sale_date',
        'currency',
        'total_amount',
    )
    list_filter = ('status', 'transaction_type', 'currency', 'vendor_transaction', 'sale_date')
    search_fields = ('invoice_number', 'customer__name', 'vendor__name', 'employee__full_name')
    autocomplete_fields = ('customer', 'vendor', 'employee', 'salesman')
    date_hierarchy = 'sale_date'
    inlines = [SalesItemsInline]
    list_select_related = ('customer', 'vendor', 'employee', 'salesman')


@admin.register(SalesItems)
class SalesItemsAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'sales', 'sale_source', 'stock', 'quantity', 'sell_price', 'unit_cost')
    list_filter = ('sale_source', 'unit')
    search_fields = ('sales__invoice_number',)
    autocomplete_fields = ('sales', 'stock', 'storage_tank', 'raw_material_stock')
    list_select_related = ('sales', 'stock')


class ReturnItemsInline(admin.TabularInline):
    model = ReturnItems
    extra = 0
    autocomplete_fields = ('sales_item',)


@admin.register(Return)
class ReturnAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'return_number', 'sales', 'return_date', 'currency', 'total_amount', 'refund_amount')
    list_filter = ('currency', 'return_date')
    search_fields = ('return_number', 'sales__invoice_number', 'reason', 'notes')
    autocomplete_fields = ('sales',)
    date_hierarchy = 'return_date'
    inlines = [ReturnItemsInline]
    list_select_related = ('sales',)


@admin.register(ReturnItems)
class ReturnItemsAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'return_order', 'sales_item', 'liter_amount', 'quantity_kg', 'return_price', 'return_amount')
    search_fields = ('return_order__return_number',)
    autocomplete_fields = ('return_order', 'sales_item')


# ---------------------------------------------------------------------------
# Production / packing / tanks
# ---------------------------------------------------------------------------


class RawMaterialProcessItemInline(admin.TabularInline):
    model = RawMaterialProcessItem
    extra = 0
    autocomplete_fields = ('raw_material',)


@admin.register(RawMaterialProcess)
class RawMaterialProcessAdmin(SoftDeleteModelAdmin):
    list_display = (
        'process_number',
        'product_name',
        'status',
        'process_date',
        'materials_quantity_kg',
        'water_quantity_kg',
        'output_quantity_kg',
    )
    list_filter = ('status', 'process_date')
    search_fields = ('process_number', 'product_name')
    autocomplete_fields = ('product',)
    date_hierarchy = 'process_date'
    inlines = [RawMaterialProcessItemInline]


@admin.register(RawMaterialProcessItem)
class RawMaterialProcessItemAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'process', 'raw_material', 'quantity', 'piece_count', 'material_cost_afn')
    search_fields = ('process__process_number', 'raw_material__name')
    autocomplete_fields = ('process', 'raw_material')
    list_select_related = ('process', 'raw_material')


@admin.register(StorageTank)
class StorageTankAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'capacity_kg', 'capacity_liters', 'product')
    search_fields = ('name',)
    autocomplete_fields = ('product',)
    list_select_related = ('product',)


@admin.register(ProductionStorageTransfer)
class ProductionStorageTransferAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'production', 'storage_tank', 'quantity_kg', 'quantity_liters')
    search_fields = ('production__process_number', 'storage_tank__name')
    autocomplete_fields = ('production', 'storage_tank')
    list_select_related = ('production', 'storage_tank')


class PackingRunComponentInline(admin.TabularInline):
    model = PackingRunComponent
    extra = 0
    autocomplete_fields = ('stock', 'raw_material_stock')


class PackingRunOutputInline(admin.TabularInline):
    model = PackingRunOutput
    extra = 0
    autocomplete_fields = ('stock', 'inventory_batch')


@admin.register(PackingRun)
class PackingRunAdmin(SoftDeleteModelAdmin):
    list_display = (
        'packing_number',
        'storage_tank',
        'product',
        'quantity_kg',
        'bottle_count',
        'liquid_cost_afn',
        'packaging_cost_afn',
        'created_at',
    )
    search_fields = ('packing_number', 'product__name', 'storage_tank__name')
    autocomplete_fields = ('storage_tank', 'product', 'finished_stock', 'packing_return')
    date_hierarchy = 'created_at'
    inlines = [PackingRunComponentInline, PackingRunOutputInline]
    list_select_related = ('storage_tank', 'product')


@admin.register(PackingRunComponent)
class PackingRunComponentAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'packing_run', 'component_type', 'quantity_pieces', 'unit_cost_afn', 'total_cost_afn')
    list_filter = ('component_type',)
    search_fields = ('packing_run__packing_number',)
    autocomplete_fields = ('packing_run', 'stock', 'raw_material_stock')


@admin.register(PackingRunOutput)
class PackingRunOutputAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'packing_run', 'component_type', 'quantity_pieces', 'unit_cost_afn', 'total_cost_afn')
    list_filter = ('component_type',)
    search_fields = ('packing_run__packing_number',)
    autocomplete_fields = ('packing_run', 'stock', 'inventory_batch')


@admin.register(PackingReturn)
class PackingReturnAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'stock',
        'bottle_count',
        'remaining_bottle_count',
        'unit_cost_afn',
        'first_returned_at',
        'last_returned_at',
    )
    search_fields = ('stock__product__name',)
    autocomplete_fields = ('stock', 'performed_by')
    list_select_related = ('stock',)


@admin.register(PackingReturnEvent)
class PackingReturnEventAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'packing_return', 'returned_at', 'bottle_count', 'unit_cost_afn', 'performed_by')
    search_fields = ('packing_return__id', 'notes')
    autocomplete_fields = ('packing_return', 'performed_by')
    date_hierarchy = 'returned_at'


# ---------------------------------------------------------------------------
# Damage / leaks
# ---------------------------------------------------------------------------


class DamagedMaterialItemInline(admin.TabularInline):
    model = DamagedMaterialItem
    extra = 0
    autocomplete_fields = ('raw_material', 'product')


@admin.register(DamagedMaterialRecord)
class DamagedMaterialRecordAdmin(SoftDeleteModelAdmin):
    list_display = ('damaged_number', 'record_date', 'source', 'total_cost_afn')
    list_filter = ('source', 'record_date')
    search_fields = ('damaged_number', 'notes')
    date_hierarchy = 'record_date'
    inlines = [DamagedMaterialItemInline]


@admin.register(DamagedMaterialItem)
class DamagedMaterialItemAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'record', 'component_type', 'raw_material', 'product', 'quantity_pieces', 'total_cost_afn')
    list_filter = ('component_type', 'unit')
    search_fields = ('record__damaged_number', 'raw_material__name', 'product__name')
    autocomplete_fields = ('record', 'raw_material', 'product')


@admin.register(StockBottleDamage)
class StockBottleDamageAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'stock',
        'product',
        'bottle_count',
        'damaged_liquid_kg',
        'remaining_liquid_kg',
        'storage_tank',
    )
    search_fields = ('product__name', 'stock__id')
    autocomplete_fields = ('stock', 'product', 'storage_tank', 'damaged_record')
    list_select_related = ('stock', 'product', 'storage_tank')


@admin.register(StorageTankLeak)
class StorageTankLeakAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'storage_tank', 'quantity_kg', 'unit_cost_afn', 'total_cost_afn', 'recorded_at')
    search_fields = ('storage_tank__name', 'notes')
    autocomplete_fields = ('storage_tank', 'damaged_record', 'performed_by')
    date_hierarchy = 'recorded_at'
    list_select_related = ('storage_tank',)


# ---------------------------------------------------------------------------
# Money / payments / loans / expenses
# ---------------------------------------------------------------------------


@admin.register(Payment)
class PaymentAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'payment_type',
        'payment_method',
        'payment_date',
        'amount',
        'currency',
        'is_advance',
        'is_credit_application',
    )
    list_filter = ('payment_type', 'payment_method', 'currency', 'is_advance', 'payment_date')
    search_fields = ('reference_number',)
    date_hierarchy = 'payment_date'
    autocomplete_fields = ('general_payment', 'intermediary_vendor', 'intermediary_loan')


@admin.register(GeneralPayment)
class GeneralPaymentAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'payment_type',
        'customer',
        'vendor',
        'payment_method',
        'payment_date',
        'amount',
        'currency',
        'reference_number',
    )
    list_filter = ('payment_type', 'payment_method', 'currency', 'payment_date')
    search_fields = ('reference_number', 'customer__name', 'vendor__name', 'notes')
    autocomplete_fields = ('customer', 'vendor', 'source_sale')
    date_hierarchy = 'payment_date'
    list_select_related = ('customer', 'vendor')


@admin.register(SalesmanCommissionPayment)
class SalesmanCommissionPaymentAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'salesman', 'payment_date', 'payment_method', 'amount', 'currency', 'reference_number')
    list_filter = ('payment_method', 'currency', 'payment_date')
    search_fields = ('salesman__name', 'reference_number', 'notes')
    autocomplete_fields = ('salesman',)
    date_hierarchy = 'payment_date'
    list_select_related = ('salesman',)


@admin.register(Loan)
class LoanAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'loan_type',
        'loaner_type',
        'customer',
        'vendor',
        'amount',
        'amount_paid',
        'currency',
        'loan_date',
    )
    list_filter = ('loan_type', 'loaner_type', 'currency', 'payment_method', 'loan_date')
    search_fields = ('customer__name', 'vendor__name', 'bill_number')
    autocomplete_fields = ('customer', 'vendor')
    date_hierarchy = 'loan_date'
    list_select_related = ('customer', 'vendor')


@admin.register(LoanPayment)
class LoanPaymentAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'loan', 'amount', 'payment_method', 'payment_date', 'reference_number')
    list_filter = ('payment_method', 'payment_date')
    search_fields = ('reference_number', 'bill_number', 'notes')
    autocomplete_fields = ('loan',)
    date_hierarchy = 'payment_date'
    list_select_related = ('loan',)


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'description')
    search_fields = ('name', 'description')


@admin.register(Expense)
class ExpenseAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'category', 'amount', 'currency', 'expense_date', 'payment_method', 'user')
    list_filter = ('category', 'currency', 'payment_method', 'expense_date')
    search_fields = ('description', 'category__name', 'user__username', 'user__email')
    autocomplete_fields = ('category', 'user')
    date_hierarchy = 'expense_date'
    list_select_related = ('category', 'user')


@admin.register(Withdrawal)
class WithdrawalAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'gl_account',
        'payment_method',
        'amount',
        'currency',
        'withdrawal_date',
        'reference_number',
        'recorded_by',
    )
    list_filter = ('payment_method', 'currency', 'withdrawal_date')
    search_fields = ('reference_number', 'description', 'gl_account__code', 'gl_account__name')
    autocomplete_fields = ('gl_account', 'recorded_by')
    date_hierarchy = 'withdrawal_date'
    list_select_related = ('gl_account', 'recorded_by')


@admin.register(CurrencyExchange)
class CurrencyExchangeAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'exchange_date',
        'from_currency',
        'from_amount',
        'to_currency',
        'to_amount',
        'rate',
        'status',
        'reference_number',
    )
    list_filter = ('status', 'from_currency', 'to_currency', 'exchange_date')
    search_fields = ('reference_number', 'notes')
    date_hierarchy = 'exchange_date'


@admin.register(ExchangeRate)
class ExchangeRateAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'from_currency', 'to_currency', 'rate', 'date', 'effective_date', 'is_active')
    list_filter = ('from_currency', 'to_currency', 'is_active', 'source')
    search_fields = ('notes',)
    date_hierarchy = 'date'


@admin.register(FxRevaluation)
class FxRevaluationAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'as_of_date', 'status', 'total_gain', 'total_loss', 'posted_at', 'created_by')
    list_filter = ('status', 'as_of_date')
    search_fields = ('notes',)
    autocomplete_fields = ('created_by',)
    date_hierarchy = 'as_of_date'


# ---------------------------------------------------------------------------
# HR / payroll / equipment
# ---------------------------------------------------------------------------


@admin.register(Employee)
class EmployeeAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'full_name', 'phone', 'salary', 'salary_type', 'currency', 'is_active')
    list_filter = ('is_active', 'salary_type', 'currency')
    search_fields = ('full_name', 'email', 'phone', 'tazkira_number')
    autocomplete_fields = ('user',)


@admin.register(Payroll)
class PayrollAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'employee', 'payroll_type', 'month', 'year', 'amount', 'basic_salary')
    list_filter = ('payroll_type', 'salary_type', 'year', 'month', 'period_calendar')
    search_fields = ('employee__full_name',)
    autocomplete_fields = ('employee',)
    list_select_related = ('employee',)


@admin.register(EmployeeOvertimeEntry)
class EmployeeOvertimeEntryAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'employee', 'work_date', 'amount', 'hours', 'month', 'year')
    list_filter = ('year', 'month', 'period_calendar', 'currency')
    search_fields = ('employee__full_name', 'notes')
    autocomplete_fields = ('employee',)
    date_hierarchy = 'work_date'


@admin.register(EmployeeAbsenceEntry)
class EmployeeAbsenceEntryAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'employee', 'entry_type', 'absence_date', 'days', 'amount', 'month', 'year')
    list_filter = ('entry_type', 'year', 'month', 'period_calendar', 'currency')
    search_fields = ('employee__full_name', 'notes')
    autocomplete_fields = ('employee',)
    date_hierarchy = 'absence_date'


@admin.register(Attendance)
class AttendanceAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'employee', 'date', 'status', 'check_in_time', 'check_out_time', 'work_hours')
    list_filter = ('status', 'date')
    search_fields = ('employee__full_name', 'device_id', 'notes')
    autocomplete_fields = ('employee',)
    date_hierarchy = 'date'
    list_select_related = ('employee',)


@admin.register(EmployeeLeave)
class EmployeeLeaveAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'employee', 'start_date', 'end_date', 'status')
    list_filter = ('status',)
    search_fields = ('employee__full_name', 'reason')
    autocomplete_fields = ('employee',)
    list_select_related = ('employee',)


@admin.register(Equipment)
class EquipmentAdmin(SoftDeleteModelAdmin):
    list_display = (
        'id',
        'name',
        'category',
        'status',
        'quantity',
        'unit_cost',
        'acquisition_type',
        'assigned_to',
        'is_active',
        'acquired_date',
    )
    list_filter = ('status', 'is_active', 'acquisition_type', 'category', 'currency')
    search_fields = ('name', 'serial_number', 'asset_tag', 'location', 'notes')
    autocomplete_fields = ('assigned_to',)
    date_hierarchy = 'acquired_date'


@admin.register(EquipmentDepreciation)
class EquipmentDepreciationAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'equipment', 'year', 'amount')
    list_filter = ('year',)
    search_fields = ('equipment__name', 'notes')
    autocomplete_fields = ('equipment',)
    list_select_related = ('equipment',)


# ---------------------------------------------------------------------------
# Legacy account / settings / permissions / audit
# ---------------------------------------------------------------------------


@admin.register(EntryType)
class EntryTypeAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'created_at')
    search_fields = ('name',)


@admin.register(Account)
class AccountAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'account_number', 'name', 'currency')
    list_filter = ('currency',)
    search_fields = ('account_number', 'name')


@admin.register(AccountEntry)
class AccountEntryAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'account', 'entry_type', 'debit_amount', 'credit_amount', 'entry_date', 'reference_number')
    list_filter = ('entry_type', 'entry_date')
    search_fields = ('reference_number', 'notes', 'account__account_number', 'account__name')
    autocomplete_fields = ('account', 'entry_type')
    date_hierarchy = 'entry_date'
    list_select_related = ('account', 'entry_type')


@admin.register(AccountingSettings)
class AccountingSettingsAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'is_configured', 'current_fiscal_year', 'updated_at')
    raw_id_fields = (
        'cash_account',
        'inventory_account',
        'accounts_receivable_account',
        'accounts_payable_account',
        'sales_revenue_account',
        'sales_returns_account',
        'cogs_account',
        'expense_account',
        'payroll_expense_account',
        'employee_advance_account',
        'loan_receivable_account',
        'loan_payable_account',
        'bank_account',
        'prepaid_expense_account',
        'sales_tax_payable_account',
        'equity_account',
        'retained_earnings_account',
        'other_income_account',
        'petty_cash_account',
        'fixed_asset_account',
        'accumulated_depreciation_account',
        'accrued_expenses_account',
        'opening_balance_equity_account',
        'purchase_discount_account',
        'sales_discount_account',
        'bank_charges_account',
        'stock_adjustment_account',
        'depreciation_expense_account',
        'bad_debt_expense_account',
        'current_fiscal_year',
    )


@admin.register(FiscalYear)
class FiscalYearAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'name', 'start_date', 'end_date', 'status', 'is_current', 'closed_at')
    list_filter = ('status', 'is_current')
    search_fields = ('name', 'notes')
    date_hierarchy = 'start_date'
    autocomplete_fields = ('closed_by', 'closing_journal')


@admin.register(DocumentNumberSequence)
class DocumentNumberSequenceAdmin(admin.ModelAdmin):
    list_display = ('key', 'last_value')
    search_fields = ('key',)
    ordering = ('key',)


@admin.register(Permission)
class PermissionAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'codename', 'name', 'module')
    list_filter = ('module',)
    search_fields = ('codename', 'name', 'description')


@admin.register(UserPermission)
class UserPermissionAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'user', 'permission', 'granted')
    list_filter = ('granted', 'permission__module')
    search_fields = ('user__email', 'user__username', 'permission__codename')
    autocomplete_fields = ('user', 'permission')
    list_select_related = ('user', 'permission')


@admin.register(AttachedDocument)
class AttachedDocumentAdmin(SoftDeleteModelAdmin):
    list_display = ('id', 'title', 'original_name', 'file_size', 'content_type', 'object_id', 'created_at')
    search_fields = ('title', 'original_name')
    list_filter = ('content_type',)
    date_hierarchy = 'created_at'


@admin.register(ActivityLog)
class ActivityLogAdmin(ReadOnlySoftDeleteAdmin):
    list_display = ('id', 'user', 'action', 'model_name', 'object_id', 'created_at')
    list_filter = ('action', 'model_name', 'created_at')
    search_fields = ('description', 'user__username', 'user__email', 'model_name')
    date_hierarchy = 'created_at'
    readonly_fields = (
        'user',
        'action',
        'model_name',
        'object_id',
        'description',
        'ip_address',
        'user_agent',
        'changes',
        'created_at',
        'updated_at',
        'deleted_at',
        'deleted_by',
        'content_type',
    )
