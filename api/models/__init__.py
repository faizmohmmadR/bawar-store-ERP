"""Import all api models so Django discovers them for migrations/admin."""

from .data.attachment import AttachedDocument  # noqa: F401
from .data.permissions import Permission, UserPermission  # noqa: F401
from .data.activity_log import ActivityLog  # noqa: F401
from .data.currency import ExchangeRate  # noqa: F401
from .data.currency_exchange import CurrencyExchange  # noqa: F401
from .data.fx_revaluation import FxRevaluation  # noqa: F401
from .data.fiscal_year import FiscalYear  # noqa: F401
from .data.journal import AccountingSettings, GLAccount, JournalEntry, JournalLine  # noqa: F401
from .data.uom import UnitCategory, UnitOfMeasure  # noqa: F401
from .data.warehouse import Warehouse  # noqa: F401
from .data.products import Product, ProductCategory  # noqa: F401
from .data.product_packaging import ProductPackaging, ProductBarcode, ProductPrice  # noqa: F401
from .data.inventory_ledger import (  # noqa: F401
    InventoryBalance,
    InventoryLot,
    InventoryPackageBalance,
    StockMovement,
)
from .data.purchases import Purchase, PurchaseItem, PurchaseLandedCost  # noqa: F401
from .data.stock import Stock  # noqa: F401
from .data.inventory_batch import InventoryBatch  # noqa: F401
from .data.stock_adjustment import StockAdjustment  # noqa: F401
from .data.stock_transfer import StockTransfer  # noqa: F401
from .data.sale_batch_allocation import SaleBatchAllocation  # noqa: F401
from .data.sales import Sales, SalesItems  # noqa: F401
from .data.returns import Return, ReturnItems  # noqa: F401
from .data.customers import Customer  # noqa: F401
from .data.vendors import Vendor  # noqa: F401
from .data.salesmen import Salesman  # noqa: F401
from .data.salesman_commission_payment import SalesmanCommissionPayment  # noqa: F401
from .data.withdrawal import Withdrawal  # noqa: F401
from .data.document_number_sequence import DocumentNumberSequence  # noqa: F401
from .data.payment import Payment, GeneralPayment  # noqa: F401
from .data.employee import Employee  # noqa: F401
from .data.payroll import Payroll  # noqa: F401
from .data.employee_pay_entries import EmployeeAbsenceEntry, EmployeeOvertimeEntry  # noqa: F401
from .data.attendance import Attendance, EmployeeLeave  # noqa: F401
from .data.expenses import Expense, ExpenseCategory  # noqa: F401
from .data.equipment import Equipment, EquipmentDepreciation  # noqa: F401
from .data.loan import Loan, LoanPayment  # noqa: F401
from .data.account import Account, AccountEntry, EntryType  # noqa: F401
from .data.notification import Notification  # noqa: F401
