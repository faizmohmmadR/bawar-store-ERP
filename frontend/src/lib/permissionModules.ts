/** Ordered ERP permission modules for the user-permissions matrix. */

export type CrudAction = 'view' | 'add' | 'edit' | 'delete';

export const CRUD_ACTIONS: CrudAction[] = ['view', 'add', 'edit', 'delete'];

/** Display order for permission modules (matches ERP apps roughly). */
export const PERMISSION_MODULE_ORDER: string[] = [
  'dashboard',
  'stock',
  'products',
  'sales',
  'returns',
  'payments',
  'salesman_commission_payments',
  'customers',
  'vendors',
  'salesmen',
  'raw_materials',
  'raw_material_purchases',
  'raw_material_stocks',
  'raw_material_sales',
  'raw_material_processes',
  'storage_tanks',
  'packing',
  'equipment',
  'withdrawals',
  'employees',
  'attendance',
  'payroll',
  'loans',
  'expenses',
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
  sales: 'sales',
  returns: 'returns',
  payments: 'payments',
  salesman_commission_payments: 'salesmanCommissionPayments',
  customers: 'customers',
  vendors: 'vendors',
  salesmen: 'salesmen',
  raw_materials: 'rawMaterials',
  raw_material_purchases: 'rawMaterialPurchases',
  raw_material_stocks: 'rawMaterialStock',
  raw_material_sales: 'rawMaterialSales',
  raw_material_processes: 'rawMaterialProcesses',
  storage_tanks: 'storageTanks',
  packing: 'packing',
  equipment: 'equipment',
  withdrawals: 'withdrawals',
  employees: 'employees',
  attendance: 'attendance',
  payroll: 'payroll',
  loans: 'loans',
  expenses: 'expenses',
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
  sales: 'salesOps',
  returns: 'salesOps',
  payments: 'salesOps',
  salesman_commission_payments: 'salesOps',
  customers: 'contacts',
  vendors: 'contacts',
  salesmen: 'contacts',
  users: 'contacts',
  permissions: 'contacts',
  raw_materials: 'inventory',
  raw_material_purchases: 'inventory',
  raw_material_stocks: 'inventory',
  raw_material_sales: 'inventory',
  raw_material_processes: 'inventory',
  storage_tanks: 'inventory',
  packing: 'inventory',
  equipment: 'inventory',
  withdrawals: 'finance',
  expenses: 'finance',
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
