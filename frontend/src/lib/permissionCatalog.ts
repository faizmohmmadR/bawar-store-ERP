/** Logical permission matrix: groups → sections → View/Add/Edit/Delete codenames.
 * Keep aligned with ERP_APPS sections and api/services/default_permissions.py.
 */

export type CrudAction = 'view' | 'add' | 'edit' | 'delete';

export const CRUD_ACTIONS: CrudAction[] = ['view', 'add', 'edit', 'delete'];

export type PermissionRowDef = {
  id: string;
  /** i18n key, e.g. core.navigation.stock */
  labelKey: string;
  /** Codenames toggled together for each CRUD column. */
  actions: Partial<Record<CrudAction, string[]>>;
};

export type PermissionGroupDef = {
  id: string;
  labelKey: string;
  rows: PermissionRowDef[];
};

const crud = (module: string): PermissionRowDef['actions'] => ({
  view: [`view_${module}`],
  add: [`add_${module}`],
  edit: [`edit_${module}`],
  delete: [`delete_${module}`],
});

const viewOnly = (...codes: string[]): PermissionRowDef['actions'] => ({
  view: codes,
});

export const PERMISSION_CATALOG: PermissionGroupDef[] = [
  {
    id: 'main',
    labelKey: 'user.permissionGroups.main',
    rows: [
      {
        id: 'dashboard',
        labelKey: 'core.navigation.dashboard',
        actions: viewOnly(
          'view_dashboard',
          'view_sales_dashboard',
          'view_finance_dashboard',
          'view_hr_dashboard',
        ),
      },
    ],
  },
  {
    id: 'inventory',
    labelKey: 'user.permissionGroups.inventory',
    rows: [
      {
        id: 'stock',
        labelKey: 'core.navigation.stock',
        actions: {
          view: ['view_stock'],
          add: ['add_stock'],
          edit: ['edit_stock'],
          delete: ['delete_stock'],
        },
      },
      {
        id: 'damaged_stock',
        labelKey: 'core.navigation.damagedStock',
        actions: {
          view: ['view_stock'],
          add: ['record_damaged_stock'],
        },
      },
      {
        id: 'expiring_stock',
        labelKey: 'core.navigation.expiringStock',
        actions: {
          view: ['view_stock'],
          edit: ['record_expired_stock'],
        },
      },
      { id: 'products', labelKey: 'core.navigation.products', actions: crud('products') },
      { id: 'purchases', labelKey: 'core.navigation.purchases', actions: crud('purchases') },
      { id: 'warehouses', labelKey: 'user.permissionModules.warehouses', actions: crud('warehouses') },
      { id: 'uom', labelKey: 'user.permissionModules.uom', actions: crud('uom') },
      { id: 'equipment', labelKey: 'core.navigation.equipment', actions: crud('equipment') },
    ],
  },
  {
    id: 'salesOps',
    labelKey: 'user.permissionGroups.salesOps',
    rows: [
      { id: 'sales', labelKey: 'core.navigation.sales', actions: crud('sales') },
      { id: 'returns', labelKey: 'core.navigation.returns', actions: crud('returns') },
      {
        id: 'sale_payments',
        labelKey: 'core.navigation.salePayments',
        actions: {
          view: ['view_sale_payments'],
          add: ['add_payments'],
          edit: ['edit_payments'],
          delete: ['delete_payments'],
        },
      },
      {
        id: 'purchase_payments',
        labelKey: 'core.navigation.purchasePayments',
        actions: {
          view: ['view_purchase_payments'],
          add: ['add_payments'],
          edit: ['edit_payments'],
          delete: ['delete_payments'],
        },
      },
    ],
  },
  {
    id: 'contacts',
    labelKey: 'user.permissionGroups.contacts',
    rows: [
      { id: 'customers', labelKey: 'core.navigation.customers', actions: crud('customers') },
      { id: 'vendors', labelKey: 'core.navigation.vendors', actions: crud('vendors') },
      { id: 'users', labelKey: 'core.navigation.users', actions: crud('users') },
      {
        id: 'permissions',
        labelKey: 'user.permissionModules.permissions',
        actions: {
          view: ['view_permissions'],
          edit: ['edit_permissions', 'assign_roles'],
        },
      },
    ],
  },
  {
    id: 'hr',
    labelKey: 'user.permissionGroups.hr',
    rows: [
      { id: 'employees', labelKey: 'core.navigation.employees', actions: crud('employees') },
      { id: 'attendance', labelKey: 'core.navigation.attendance', actions: crud('attendance') },
      {
        id: 'payroll',
        labelKey: 'core.navigation.payroll',
        actions: {
          view: ['view_payroll'],
          add: ['add_payroll'],
          edit: ['edit_payroll', 'process_payroll'],
          delete: ['delete_payroll'],
        },
      },
    ],
  },
  {
    id: 'finance',
    labelKey: 'user.permissionGroups.finance',
    rows: [
      {
        id: 'cash_register',
        labelKey: 'core.navigation.cashRegister',
        actions: {
          view: ['view_cash_register', 'view_cash_transactions', 'view_cash_reports'],
          add: ['open_cash_session', 'record_cash_adjustment'],
          edit: ['close_cash_session', 'approve_cash_difference'],
        },
      },
      { id: 'withdrawals', labelKey: 'core.navigation.withdrawals', actions: crud('withdrawals') },
      {
        id: 'expenses',
        labelKey: 'core.navigation.expenses',
        actions: {
          view: ['view_expenses'],
          add: ['add_expenses'],
          edit: ['edit_expenses', 'approve_expenses'],
          delete: ['delete_expenses'],
        },
      },
      {
        id: 'expense_categories',
        labelKey: 'core.navigation.expenseCategories',
        actions: crud('expense_categories'),
      },
      {
        id: 'loans',
        labelKey: 'core.navigation.loans',
        actions: {
          view: ['view_loans'],
          add: ['add_loans'],
          edit: ['edit_loans', 'approve_loans'],
          delete: ['delete_loans'],
        },
      },
      {
        id: 'accounting',
        labelKey: 'core.navigation.accounting',
        actions: {
          view: ['view_accounting'],
          edit: ['edit_accounting'],
        },
      },
      {
        id: 'daily_ledger',
        labelKey: 'core.navigation.dailyLedger',
        actions: viewOnly('view_daily_ledger'),
      },
      {
        id: 'trial_balance',
        labelKey: 'core.navigation.trialBalance',
        actions: viewOnly('view_trial_balance'),
      },
      {
        id: 'balance_sheet',
        labelKey: 'core.navigation.balanceSheet',
        actions: viewOnly('view_balance_sheet'),
      },
      {
        id: 'income_statement',
        labelKey: 'core.navigation.incomeStatement',
        actions: viewOnly('view_income_statement'),
      },
      {
        id: 'fiscal_years',
        labelKey: 'core.navigation.fiscalYears',
        actions: viewOnly('view_fiscal_years'),
      },
      {
        id: 'gl_accounts',
        labelKey: 'core.navigation.glAccounts',
        actions: viewOnly('view_gl_accounts'),
      },
      {
        id: 'journal_entries',
        labelKey: 'core.navigation.journalEntries',
        actions: viewOnly('view_journal_entries'),
      },
      {
        id: 'currency_exchanges',
        labelKey: 'core.navigation.currencyExchanges',
        actions: crud('currency_exchanges'),
      },
      {
        id: 'fx_revaluations',
        labelKey: 'core.navigation.fxRevaluations',
        actions: crud('fx_revaluations'),
      },
      { id: 'currencies', labelKey: 'core.navigation.currencies', actions: crud('currencies') },
    ],
  },
  {
    id: 'analytics',
    labelKey: 'user.permissionGroups.analytics',
    rows: [
      {
        id: 'reports',
        labelKey: 'core.navigation.reports',
        actions: {
          view: ['view_reports'],
          edit: ['export_reports'],
        },
      },
      {
        id: 'financial_reports',
        labelKey: 'user.permissionModules.financial_reports',
        actions: viewOnly('view_financial_reports'),
      },
      {
        id: 'sales_reports',
        labelKey: 'user.permissionModules.sales_reports',
        actions: viewOnly('view_sales_reports'),
      },
      {
        id: 'inventory_reports',
        labelKey: 'user.permissionModules.inventory_reports',
        actions: viewOnly('view_inventory_reports'),
      },
      {
        id: 'hr_reports',
        labelKey: 'user.permissionModules.hr_reports',
        actions: viewOnly('view_hr_reports'),
      },
    ],
  },
  {
    id: 'system',
    labelKey: 'user.permissionGroups.system',
    rows: [
      {
        id: 'settings',
        labelKey: 'core.navigation.settings',
        actions: {
          view: ['view_settings'],
          edit: ['edit_settings', 'system_config'],
        },
      },
      {
        id: 'exchange_rates',
        labelKey: 'core.navigation.exchangeRates',
        actions: crud('exchange_rates'),
      },
      {
        id: 'activity_logs',
        labelKey: 'core.navigation.activityLogs',
        actions: viewOnly('view_activity_logs'),
      },
      {
        id: 'backups',
        labelKey: 'core.navigation.backups',
        actions: {
          view: ['view_backups'],
          add: ['backup_system'],
        },
      },
      {
        id: 'notifications',
        labelKey: 'user.permissionModules.notifications',
        actions: viewOnly('view_notifications'),
      },
    ],
  },
];

export function rowCodenames(row: PermissionRowDef): string[] {
  const codes = new Set<string>();
  for (const action of CRUD_ACTIONS) {
    for (const code of row.actions[action] ?? []) {
      codes.add(code);
    }
  }
  return [...codes];
}

export function groupCodenames(group: PermissionGroupDef): string[] {
  const codes = new Set<string>();
  for (const row of group.rows) {
    for (const code of rowCodenames(row)) {
      codes.add(code);
    }
  }
  return [...codes];
}

export function allCatalogCodenames(): string[] {
  const codes = new Set<string>();
  for (const group of PERMISSION_CATALOG) {
    for (const code of groupCodenames(group)) {
      codes.add(code);
    }
  }
  return [...codes];
}
