/** Ordered ERP permission modules for the user-permissions matrix. */

export type CrudAction = 'view' | 'add' | 'edit' | 'delete';

export const CRUD_ACTIONS: CrudAction[] = ['view', 'add', 'edit', 'delete'];

/** Display order for permission modules (matches ERP apps). */
export const PERMISSION_MODULE_ORDER: string[] = [
  'dashboard',
  'stock',
  'products',
  'purchases',
  'warehouses',
  'uom',
  'sales',
  'returns',
  'payments',
  'salesman_commission_payments',
  'customers',
  'vendors',
  'salesmen',
  'equipment',
  'cash_register',
  'withdrawals',
  'employees',
  'attendance',
  'payroll',
  'loans',
  'expenses',
  'expense_categories',
  'accounting',
  'currencies',
  'reports',
  'settings',
  'users',
  'permissions',
  'notifications',
];

/** snake_case module → core.navigation.* key (or user.permissionModules.* fallback). */
export const PERMISSION_MODULE_NAV_KEY: Record<string, string> = {
  dashboard: 'dashboard',
  stock: 'stock',
  products: 'products',
  purchases: 'purchases',
  warehouses: 'warehouses',
  uom: 'uom',
  sales: 'sales',
  returns: 'returns',
  payments: 'payments',
  salesman_commission_payments: 'salesmanCommissionPayments',
  customers: 'customers',
  vendors: 'vendors',
  salesmen: 'salesmen',
  equipment: 'equipment',
  cash_register: 'cashRegister',
  withdrawals: 'withdrawals',
  employees: 'employees',
  attendance: 'attendance',
  payroll: 'payroll',
  loans: 'loans',
  expenses: 'expenses',
  expense_categories: 'expenseCategories',
  accounting: 'accounting',
  currencies: 'currencies',
  reports: 'reports',
  settings: 'settings',
  users: 'users',
  notifications: 'notifications',
};

export const PERMISSION_MODULE_GROUP: Record<string, string> = {
  dashboard: 'main',
  stock: 'inventory',
  products: 'inventory',
  purchases: 'inventory',
  warehouses: 'inventory',
  uom: 'inventory',
  equipment: 'inventory',
  sales: 'salesOps',
  returns: 'salesOps',
  payments: 'salesOps',
  salesman_commission_payments: 'salesOps',
  customers: 'contacts',
  vendors: 'contacts',
  salesmen: 'contacts',
  users: 'contacts',
  permissions: 'contacts',
  cash_register: 'finance',
  withdrawals: 'finance',
  expenses: 'finance',
  expense_categories: 'finance',
  loans: 'finance',
  accounting: 'finance',
  currencies: 'finance',
  employees: 'hr',
  attendance: 'hr',
  payroll: 'hr',
  reports: 'analytics',
  settings: 'system',
  notifications: 'system',
};

export function crudCodename(action: CrudAction, module: string): string {
  return `${action}_${module}`;
}

export function isCrudCodename(codename: string, module: string): boolean {
  return CRUD_ACTIONS.some((action) => codename === crudCodename(action, module));
}

export function sortPermissionModules(modules: string[]): string[] {
  const rank = new Map(PERMISSION_MODULE_ORDER.map((m, i) => [m, i]));
  return [...modules].sort((a, b) => {
    const ai = rank.get(a) ?? 1000;
    const bi = rank.get(b) ?? 1000;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}
