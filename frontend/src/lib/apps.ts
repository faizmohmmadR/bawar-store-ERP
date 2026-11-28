import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Warehouse,
  Users,
  Truck,
  CreditCard,
  RotateCcw,
  UserCheck,
  Wallet,
  Banknote,
  Calendar,
  Receipt,
  BarChart3,
  Settings,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  UsersIcon,
  Tag,
  BookOpen,
  BookOpenCheck,
  ArrowRightLeft,
  Monitor,
  AlertTriangle,
  AlertOctagon,
  CalendarRange,
  Scale,
  FileSpreadsheet,
  Layers,
  ListTree,
  History,
  DatabaseBackup,
  Trash2,
  SlidersHorizontal,
  RefreshCw,
  Gift,
  Box,
  FileBarChart,
} from 'lucide-react';
import { NAV_PERMISSIONS, type NavPermissionKey } from '@/lib/navigationPermissions';

export type AppSubItem = {
  key: string;
  icon: LucideIcon;
  path: string;
  permission?: string;
  permissions?: string[];
  /** Only the BAWAR Super Store system owner (superuser) can see this nav item */
  superuserOnly?: boolean;
};

export type AppDefinition = {
  key: string;
  icon: LucideIcon;
  path: string;
  section: string;
  /** Tailwind classes for the colored tile (Odoo-style) */
  color: string;
  colorHover: string;
  permission?: string;
  permissions?: string[];
  subItems?: AppSubItem[];
  /** HQ / system admin only */
  hqOnly?: boolean;
};

const navPerm = (key: NavPermissionKey): Pick<AppDefinition, 'permission' | 'permissions'> => {
  const value = NAV_PERMISSIONS[key];
  if (Array.isArray(value)) return { permissions: [...value] };
  return { permission: value };
};

/** Section tile colors — solid bg + white icons (brand blue, no purple). */
const TILE = {
  main: { color: 'bg-[#0E4EC9]', colorHover: 'hover:bg-[#0A3FA8]' },
  inventory: { color: 'bg-teal-600', colorHover: 'hover:bg-teal-700' },
  products: { color: 'bg-teal-500', colorHover: 'hover:bg-teal-600' },
  purchases: { color: 'bg-cyan-700', colorHover: 'hover:bg-cyan-800' },
  equipment: { color: 'bg-slate-600', colorHover: 'hover:bg-slate-700' },
  sales: { color: 'bg-emerald-600', colorHover: 'hover:bg-emerald-700' },
  payments: { color: 'bg-emerald-700', colorHover: 'hover:bg-emerald-800' },
  safe: { color: 'bg-amber-500', colorHover: 'hover:bg-amber-600' },
  withdrawals: { color: 'bg-amber-700', colorHover: 'hover:bg-amber-800' },
  expenses: { color: 'bg-rose-600', colorHover: 'hover:bg-rose-700' },
  loans: { color: 'bg-orange-600', colorHover: 'hover:bg-orange-700' },
  accounting: { color: 'bg-blue-800', colorHover: 'hover:bg-blue-900' },
  contacts: { color: 'bg-sky-600', colorHover: 'hover:bg-sky-700' },
  vendors: { color: 'bg-sky-700', colorHover: 'hover:bg-sky-800' },
  users: { color: 'bg-slate-700', colorHover: 'hover:bg-slate-800' },
  hr: { color: 'bg-cyan-700', colorHover: 'hover:bg-cyan-800' },
  reports: { color: 'bg-slate-700', colorHover: 'hover:bg-slate-800' },
  settings: { color: 'bg-neutral-700', colorHover: 'hover:bg-neutral-800' },
} as const;

/** Top-level ERP apps shown as an Odoo-style launcher grid */
export const ERP_APPS: AppDefinition[] = [
  {
    key: 'dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    section: 'main',
    ...TILE.main,
    ...navPerm('dashboard'),
  },
  {
    key: 'stock',
    icon: Warehouse,
    path: '/stock',
    section: 'inventory',
    ...TILE.inventory,
    ...navPerm('stock'),
    subItems: [
      { key: 'allStock', icon: Package, path: '/stock', ...navPerm('allStock') },
      { key: 'stockReport', icon: FileBarChart, path: '/stock/report', ...navPerm('stockReport') },
      { key: 'lowStock', icon: TrendingDown, path: '/stock/low-stock', ...navPerm('lowStock') },
      { key: 'expiringStock', icon: AlertTriangle, path: '/stock/expiring', ...navPerm('expiringStock') },
      { key: 'damagedStock', icon: AlertOctagon, path: '/stock/damaged', ...navPerm('damagedStock') },
    ],
  },
  {
    key: 'products',
    icon: Tag,
    path: '/products',
    section: 'inventory',
    ...TILE.products,
    ...navPerm('products'),
  },
  {
    key: 'purchases',
    icon: ShoppingCart,
    path: '/purchases',
    section: 'inventory',
    ...TILE.purchases,
    ...navPerm('purchases'),
    subItems: [
      { key: 'purchases', icon: ShoppingCart, path: '/purchases', ...navPerm('purchases') },
      { key: 'purchasesReport', icon: FileBarChart, path: '/purchases/report', ...navPerm('purchases') },
    ],
  },
  {
    key: 'sales',
    icon: TrendingUp,
    path: '/sales',
    section: 'salesOps',
    ...TILE.sales,
    ...navPerm('sales'),
    subItems: [
      { key: 'sales', icon: TrendingUp, path: '/sales', ...navPerm('sales') },
      { key: 'salesReport', icon: FileBarChart, path: '/sales/report', ...navPerm('salesReport') },
      { key: 'returns', icon: RotateCcw, path: '/returns', ...navPerm('returns') },
    ],
  },
  {
    key: 'payments',
    icon: CreditCard,
    path: '/sale-payments',
    section: 'salesOps',
    ...TILE.payments,
    ...navPerm('payments'),
    subItems: [
      { key: 'salePayments', icon: ArrowUpRight, path: '/sale-payments', ...navPerm('salePayments') },
      { key: 'purchasePayments', icon: ArrowDownLeft, path: '/purchase-payments', ...navPerm('purchasePayments') },
    ],
  },
  {
    key: 'cashRegister',
    icon: Banknote,
    path: '/cash-register',
    section: 'finance',
    ...TILE.safe,
    ...navPerm('cashRegister'),
    subItems: [
      { key: 'cashRegisterDashboard', icon: Banknote, path: '/cash-register', ...navPerm('cashRegisterDashboard') },
      { key: 'cashRegisterTransactions', icon: ListTree, path: '/cash-register/transactions', ...navPerm('cashRegisterTransactions') },
      { key: 'cashRegisterReports', icon: FileBarChart, path: '/cash-register/reports', ...navPerm('cashRegisterReports') },
    ],
  },
  {
    key: 'withdrawals',
    icon: Banknote,
    path: '/withdrawals',
    section: 'finance',
    ...TILE.withdrawals,
    ...navPerm('withdrawals'),
    subItems: [
      { key: 'withdrawalsList', icon: Banknote, path: '/withdrawals', ...navPerm('withdrawalsList') },
    ],
  },

  {
    key: 'equipment',
    icon: Monitor,
    path: '/equipment',
    section: 'inventory',
    ...TILE.equipment,
    ...navPerm('equipment'),
    subItems: [
      { key: 'equipmentList', icon: Monitor, path: '/equipment', ...navPerm('equipmentList') },
      {
        key: 'equipmentReport',
        icon: FileBarChart,
        path: '/equipment/report',
        ...navPerm('equipmentReport'),
      },
    ],
  },
  {
    key: 'customers',
    icon: Users,
    path: '/customers',
    section: 'contacts',
    ...TILE.contacts,
    ...navPerm('customers'),
  },
  {
    key: 'vendors',
    icon: Truck,
    path: '/vendors',
    section: 'contacts',
    ...TILE.vendors,
    ...navPerm('vendors'),
  },
  {
    key: 'users',
    icon: UserCheck,
    path: '/users',
    section: 'contacts',
    ...TILE.users,
    ...navPerm('users'),
  },
  {
    key: 'hr',
    icon: UsersIcon,
    path: '/employees',
    section: 'hr',
    ...TILE.hr,
    ...navPerm('hr'),
    subItems: [
      { key: 'employees', icon: UserCheck, path: '/employees', ...navPerm('employees') },
      { key: 'hrReport', icon: FileBarChart, path: '/employees/report', ...navPerm('hrReport') },
      { key: 'payroll', icon: Wallet, path: '/payroll', ...navPerm('payroll') },
      { key: 'attendance', icon: Calendar, path: '/attendance', ...navPerm('attendance') },
    ],
  },
  {
    key: 'expenses',
    icon: Receipt,
    path: '/expenses',
    section: 'finance',
    ...TILE.expenses,
    ...navPerm('expenses'),
    subItems: [
      { key: 'expensesList', icon: Receipt, path: '/expenses', ...navPerm('expensesList') },
      {
        key: 'expensesReport',
        icon: FileBarChart,
        path: '/expenses/report',
        ...navPerm('expensesReport'),
      },
      { key: 'expenseCategories', icon: Tag, path: '/expense-categories', ...navPerm('expenseCategories') },
    ],
  },
  {
    key: 'loans',
    icon: DollarSign,
    path: '/loans',
    section: 'finance',
    ...TILE.loans,
    ...navPerm('loans'),
    subItems: [
      { key: 'loans', icon: DollarSign, path: '/loans', ...navPerm('loans') },
      { key: 'loansReport', icon: FileBarChart, path: '/loans/report', ...navPerm('loansReport') },
      { key: 'loanPayments', icon: CreditCard, path: '/loan-payments', ...navPerm('loans') },
    ],
  },
  {
    key: 'accounting',
    icon: BookOpen,
    path: '/accounting',
    section: 'finance',
    ...TILE.accounting,
    ...navPerm('accounting'),
    subItems: [
      { key: 'accountingOverview', icon: BookOpen, path: '/accounting', ...navPerm('accountingOverview') },
      { key: 'dailyLedger', icon: BookOpenCheck, path: '/accounting/daily-ledger', ...navPerm('dailyLedger') },
      { key: 'trialBalance', icon: Scale, path: '/accounting/trial-balance', ...navPerm('trialBalance') },
      { key: 'balanceSheet', icon: FileSpreadsheet, path: '/accounting/balance-sheet', ...navPerm('balanceSheet') },
      { key: 'incomeStatement', icon: TrendingUp, path: '/accounting/income-statement', ...navPerm('incomeStatement') },
      { key: 'fiscalYears', icon: CalendarRange, path: '/accounting/fiscal-years', ...navPerm('fiscalYears') },
      { key: 'glAccounts', icon: ListTree, path: '/gl-accounts', ...navPerm('glAccounts') },
      { key: 'journalEntries', icon: Layers, path: '/journal-entries', ...navPerm('journalEntries') },
      { key: 'currencyExchanges', icon: ArrowRightLeft, path: '/accounting/currency-exchanges', ...navPerm('currencyExchanges') },
      { key: 'fxRevaluations', icon: RefreshCw, path: '/accounting/fx-revaluations', ...navPerm('fxRevaluations') },
    ],
  },
  {
    key: 'reports',
    icon: BarChart3,
    path: '/reports',
    section: 'analytics',
    ...TILE.reports,
    ...navPerm('reports'),
    subItems: [
      { key: 'reportsHub', icon: BarChart3, path: '/reports', ...navPerm('reports') },
      { key: 'salesReport', icon: TrendingUp, path: '/sales/report', ...navPerm('salesReport') },
      { key: 'purchasesReport', icon: ShoppingCart, path: '/purchases/report', ...navPerm('purchases') },
      { key: 'stockReport', icon: Package, path: '/stock/report', ...navPerm('stockReport') },
      { key: 'cashRegisterReports', icon: Banknote, path: '/cash-register/reports', ...navPerm('cashRegisterReports') },
      { key: 'expensesReport', icon: Receipt, path: '/expenses/report', ...navPerm('expensesReport') },
      { key: 'hrReport', icon: UsersIcon, path: '/employees/report', ...navPerm('hrReport') },
      { key: 'loansReport', icon: DollarSign, path: '/loans/report', ...navPerm('loansReport') },
      { key: 'incomeStatement', icon: Scale, path: '/accounting/income-statement', ...navPerm('incomeStatement') },
      { key: 'balanceSheet', icon: FileSpreadsheet, path: '/accounting/balance-sheet', ...navPerm('balanceSheet') },
    ],
  },
  {
    key: 'settings',
    icon: Settings,
    path: '/settings/exchange-rates',
    section: 'system',
    ...TILE.settings,
    ...navPerm('settings'),
    subItems: [
      { key: 'exchangeRates', icon: TrendingUp, path: '/settings/exchange-rates', ...navPerm('exchangeRates') },
      { key: 'preferences', icon: SlidersHorizontal, path: '/settings/preferences', ...navPerm('preferences') },
      { key: 'activityLogs', icon: History, path: '/activity-logs', ...navPerm('activityLogs') },
      { key: 'backups', icon: DatabaseBackup, path: '/settings/backups', ...navPerm('backups') },
      { key: 'trash', icon: Trash2, path: '/settings/trash', ...navPerm('trash') },
    ],
  },
];

export const APP_SECTIONS: Record<string, string> = {
  main: 'Main',
  inventory: 'Inventory',
  salesOps: 'Sales & Operations',
  contacts: 'Contacts',
  hr: 'Human Resources',
  finance: 'Finance',
  analytics: 'Analytics',
  system: 'System',
};

const CUSTOMER_HIDDEN_APPS = new Set([
  'dashboard',
  'returns',
  'sales',
  'vendors',
  'users',
  'hr',
  'expenses',
  'loans',
  'reports',
  'settings',
  'accounting',
]);

function pathMatches(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Longest concrete path on this app that matches the current location. */
function appMatchLength(pathname: string, app: AppDefinition): number {
  if (app.key === 'dashboard') {
    return pathname === '/dashboard' ? app.path.length : 0;
  }

  let best = 0;
  if (pathMatches(pathname, app.path)) {
    best = Math.max(best, app.path.length);
  }
  for (const sub of app.subItems ?? []) {
    if (pathMatches(pathname, sub.path)) {
      best = Math.max(best, sub.path.length);
    }
  }
  return best;
}

export function pathMatchesApp(pathname: string, app: AppDefinition): boolean {
  return appMatchLength(pathname, app) > 0;
}

export function findActiveApp(pathname: string): AppDefinition | undefined {
  if (pathname === '/' || pathname === '') return undefined;

  // Prefer the app whose matching path is longest (most specific)
  const matches = ERP_APPS
    .map((app) => ({ app, len: appMatchLength(pathname, app) }))
    .filter((m) => m.len > 0);
  if (matches.length === 0) return undefined;

  return matches.sort((a, b) => b.len - a.len)[0].app;
}

export function isHqAdminUser(user: {
  is_admin?: boolean;
  is_superuser?: boolean;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.is_superuser) return true;
  return !!user.is_admin;
}

export function canAccessApp(
  app: Pick<AppDefinition, 'permission' | 'permissions' | 'key' | 'subItems' | 'hqOnly'>,
  opts: {
    isCustomer: boolean;
    hasPermission: (p: string) => boolean;
    hasAnyPermission: (p: string[]) => boolean;
    isSuperUser?: boolean;
    isAdmin?: boolean;
    isBranchScoped?: boolean;
  },
): boolean {
  if (opts.isCustomer && CUSTOMER_HIDDEN_APPS.has(app.key)) return false;
  if (app.hqOnly && !(opts.isAdmin || opts.isSuperUser)) return false;
  if (app.subItems?.length) {
    return app.subItems.some((sub) => {
      if (sub.superuserOnly && !opts.isSuperUser) return false;
      if (sub.permission) return opts.hasPermission(sub.permission);
      if (sub.permissions?.length) return opts.hasAnyPermission(sub.permissions);
      return false;
    });
  }

  if (app.permission) return opts.hasPermission(app.permission);
  if (app.permissions?.length) return opts.hasAnyPermission(app.permissions);
  return false;
}

export function getVisibleSubItems(
  app: AppDefinition,
  opts: {
    hasPermission: (p: string) => boolean;
    hasAnyPermission: (p: string[]) => boolean;
    isSuperUser?: boolean;
  },
): AppSubItem[] {
  return (app.subItems ?? []).filter((sub) => {
    if (sub.superuserOnly && !opts.isSuperUser) return false;
    if (sub.permission) return opts.hasPermission(sub.permission);
    if (sub.permissions?.length) return opts.hasAnyPermission(sub.permissions);
    return false;
  });
}

/** First sub-page this user can open. */
export function getAppLandingPath(
  app: AppDefinition,
  opts: {
    hasPermission: (p: string) => boolean;
    hasAnyPermission: (p: string[]) => boolean;
    isSuperUser?: boolean;
  },
): string {
  const visible = getVisibleSubItems(app, opts);
  return visible[0]?.path || app.path;
}
