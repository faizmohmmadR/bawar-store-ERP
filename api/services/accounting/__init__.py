"""
Accounting services package.

Public API is re-exported here so existing imports keep working:
    from api.services.accounting import sync_sales_journal, ...
"""
from api.constants.gl_roles import REQUIRED_GL_CODES, CURRENCY_SPECIFIC_GL_CODES  # noqa: F401
from api.services.accounting.amounts import (  # noqa: F401
    amount_base as _amount_base,
    cogs_base as _cogs_base,
    d as _d,
    transaction_currency as _transaction_currency,
)
from api.services.accounting.coa import (  # noqa: F401
    _fill_missing_accounting_settings,
    _pick_default_account,
    _remap_settings_to_bare_gl,
    cleanup_base_gl_accounts,
    ensure_accounting_ready,
    ensure_default_gl_accounts,
    get_gl_account,
    get_gl_for_role,
    get_payment_asset_account,
    get_settings,
    gl_for_source as _gl,
    initialize_accounting_settings,
    is_accounting_ready,
    posting_currency_id,
    remap_gl_account_to_currency,
    resolve_gl_for_currency,
)
from api.services.accounting.coa_merge import (  # noqa: F401
    merge_generic_gl_accounts,
)
from api.services.accounting.posting import (  # noqa: F401
    delete_journal_for_source,
    replace_journal_for_source,
)
from api.services.accounting.journal_fx import (  # noqa: F401
    backfill_existing_journal_lines,
    prepare_posted_line,
)
from api.services.accounting.queries import (  # noqa: F401
    SOURCE_MODEL_ALIASES,
    get_journals_for_source,
)
from api.services.accounting.reports import (  # noqa: F401
    _credit_normal_amount,
    _debit_normal_amount,
    get_account_code_balance,
    get_balance_sheet,
    get_profit_and_loss,
    get_trial_balance,
)
from api.services.accounting.sync import (  # noqa: F401
    SKIP_JOURNAL_STATUSES,
    sync_batch_allocation_journal,
    sync_expense_journal,
    sync_withdrawal_journal,
    sync_inventory_batch_journal,
    sync_loan_journal,
    sync_loan_payment_journal,
    sync_packing_run_journal,
    sync_payment_journal,
    sync_payroll_journal,
    sync_purchase_journal,
    sync_raw_material_purchase_journal,
    sync_raw_material_stock_opening_journal,
    sync_salesman_commission_payment_journal,
    sync_return_journal,
    sync_sales_journal,
    sync_stock_adjustment_journal,
    sync_stock_bottle_damage_journal,
    sync_storage_tank_leak_journal,
    sync_stock_transfer_journal,
    sync_equipment_journal,
)
from api.services.accounting.currency_exchange import (  # noqa: F401
    sync_currency_exchange_journal,
)
from api.services.accounting.revaluation import (  # noqa: F401
    run_fx_revaluation,
    sync_fx_revaluation_journal,
)
from api.services.accounting.depreciation import (  # noqa: F401
    run_monthly_depreciation,
    sync_equipment_depreciation_journal,
)
from api.services.accounting.totals import (  # noqa: F401
    recalculate_return_totals,
    recalculate_sale_totals,
    sync_order_paid_amount,
)

PAYMENT_METHOD_GL_CODES = {
    'cash': '1000',
    'bank': '1050',
    'sarafi': '1060',
}

__all__ = [
    'REQUIRED_GL_CODES',
    'PAYMENT_METHOD_GL_CODES',
    'SKIP_JOURNAL_STATUSES',
    'SOURCE_MODEL_ALIASES',
    '_d',
    '_amount_base',
    '_cogs_base',
    '_transaction_currency',
    '_gl',
    '_credit_normal_amount',
    '_debit_normal_amount',
    'get_settings',
    'is_accounting_ready',
    'ensure_accounting_ready',
    'ensure_default_gl_accounts',
    'initialize_accounting_settings',
    'get_gl_account',
    'get_gl_for_role',
    'get_payment_asset_account',
    'posting_currency_id',
    'replace_journal_for_source',
    'delete_journal_for_source',
    'prepare_posted_line',
    'backfill_existing_journal_lines',
    'recalculate_sale_totals',
    'recalculate_return_totals',
    'sync_order_paid_amount',
    'sync_sales_journal',
    'sync_return_journal',
    'sync_expense_journal',
    'sync_withdrawal_journal',
    'sync_payroll_journal',
    'sync_loan_journal',
    'sync_loan_payment_journal',
    'sync_payment_journal',
    'sync_purchase_journal',
    'sync_raw_material_purchase_journal',
    'sync_raw_material_stock_opening_journal',
    'sync_salesman_commission_payment_journal',
    'sync_packing_run_journal',
    'sync_stock_adjustment_journal',
    'sync_stock_bottle_damage_journal',
    'sync_storage_tank_leak_journal',
    'sync_inventory_batch_journal',
    'sync_stock_transfer_journal',
    'sync_batch_allocation_journal',
    'sync_equipment_journal',
    'sync_currency_exchange_journal',
    'sync_fx_revaluation_journal',
    'run_fx_revaluation',
    'sync_equipment_depreciation_journal',
    'run_monthly_depreciation',
    'get_journals_for_source',
    'get_trial_balance',
    'get_profit_and_loss',
    'get_balance_sheet',
    'get_account_code_balance',
    'cleanup_base_gl_accounts',
    'remap_gl_account_to_currency',
    'resolve_gl_for_currency',
    'merge_generic_gl_accounts',
]
