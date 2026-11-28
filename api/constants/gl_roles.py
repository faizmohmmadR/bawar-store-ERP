"""
Canonical GL role → account code map.

Native journal amounts are stored in the transaction currency on JournalLine.
AFN equivalents are stored as base_debit / base_credit at the historical rate.

"""

# Role name → bare GL code (matches DEFAULT_GL_ACCOUNTS)
GL_ROLE_CODES = {
    'cash': '1000',
    'bank': '1050',
    'sarafi': '1060',
    'inventory': '1100',
    'accounts_receivable': '1200',
    'employee_advance': '1300',
    'loan_receivable': '1310',
    'supplier_advance': '1320',
    'fixed_asset': '1400',
    'accumulated_depreciation': '1410',
    'accounts_payable': '2000',
    'loan_payable': '2100',
    'customer_advance': '2300',
    'opening_balance_equity': '3000',
    'owner_draw': '3100',
    'retained_earnings': '3200',
    'sales_revenue': '4000',
    'sales_returns': '4100',
    'other_income': '4200',
    'realized_fx_gain': '4300',
    'unrealized_fx_gain': '4400',
    'operating_expense': '5000',
    'stock_adjustment': '5070',
    'payroll_expense': '5100',
    'depreciation_expense': '5150',
    'cogs': '5200',
    'free_distribution': '5220',
    'realized_fx_loss': '5350',
    'unrealized_fx_loss': '5400',
    'sales_discount': '4000',  # contra revenue: netted into sales until separate CoA code exists
    'purchase_discount': '2000',
}

CURRENCY_SPECIFIC_GL_CODES = frozenset({'1000', '1050', '1060'})

# AccountingSettings FK field → role (for optional overrides / readiness checks)
SETTINGS_FIELD_TO_ROLE = {
    'cash_account': 'cash',
    'bank_account': 'bank',
    'petty_cash_account': 'cash',
    'inventory_account': 'inventory',
    'accounts_receivable_account': 'accounts_receivable',
    'employee_advance_account': 'employee_advance',
    'loan_receivable_account': 'loan_receivable',
    'fixed_asset_account': 'fixed_asset',
    'accumulated_depreciation_account': 'accumulated_depreciation',
    'accounts_payable_account': 'accounts_payable',
    'loan_payable_account': 'loan_payable',
    'opening_balance_equity_account': 'opening_balance_equity',
    'retained_earnings_account': 'retained_earnings',
    'equity_account': 'opening_balance_equity',
    'sales_revenue_account': 'sales_revenue',
    'sales_returns_account': 'sales_returns',
    'other_income_account': 'other_income',
    'expense_account': 'operating_expense',
    'payroll_expense_account': 'payroll_expense',
    'depreciation_expense_account': 'depreciation_expense',
    'cogs_account': 'cogs',
    'stock_adjustment_account': 'stock_adjustment',
    'sales_discount_account': 'sales_discount',
    'purchase_discount_account': 'purchase_discount',
}

PAYMENT_METHOD_ROLES = {
    'cash': 'cash',
    'bank': 'bank',
    'sarafi': 'sarafi',
}

REQUIRED_ROLES = (
    'cash',
    'inventory',
    'accounts_receivable',
    'employee_advance',
    'loan_receivable',
    'fixed_asset',
    'accumulated_depreciation',
    'accounts_payable',
    'loan_payable',
    'opening_balance_equity',
    'owner_draw',
    'retained_earnings',
    'sales_revenue',
    'sales_returns',
    'operating_expense',
    'stock_adjustment',
    'payroll_expense',
    'cogs',
    'free_distribution',
)

REQUIRED_GL_CODES = tuple(
    dict.fromkeys(GL_ROLE_CODES[role] for role in REQUIRED_ROLES)
)

REQUIRED_CURRENCY_SPECIFIC_CODES = tuple(
    code for code in REQUIRED_GL_CODES if code in CURRENCY_SPECIFIC_GL_CODES
)
REQUIRED_GENERIC_GL_CODES = tuple(
    code for code in REQUIRED_GL_CODES if code not in CURRENCY_SPECIFIC_GL_CODES
)


def is_currency_specific_gl_code(code):
    if not code:
        return False
    bare = str(code).split('-')[0]
    return bare in CURRENCY_SPECIFIC_GL_CODES
