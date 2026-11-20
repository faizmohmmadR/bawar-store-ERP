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
  Briefcase,
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
  /** Only the Mirbat Zada system owner (superuser) can see this nav item */
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

/** Top-level ERP apps shown as an Odoo-style launcher grid */
export const ERP_APPS: AppDefinition[] = [
  {
    key: 'dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
    section: 'main',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
    ...navPerm('dashboard'),
  },
  {
    key: 'stock',
    icon: Warehouse,
    path: '/stock',
    section: 'inventory',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
    ...navPerm('stock'),
    subItems: [
      { key: 'allStock', icon: Package, path: '/stock', ...navPerm('allStock') },
      { key: 'stockReport', icon: FileBarChart, path: '/stock/report', ...navPerm('stockReport') },
      { key: 'lowStock', icon: TrendingDown, path: '/stock/low-stock', ...navPerm('lowStock') },
      { key: 'expiringStock', icon: AlertTriangle, path: '/stock/expiring', ...navPerm('expiringStock') },
    ],
  },
  {
    key: 'products',
    icon: Tag,
    path: '/products',
    section: 'inventory',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
    ...navPerm('products'),
  },
  {
    key: 'purchases',
    icon: ShoppingCart,
    path: '/purchases',
    section: 'inventory',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
    ...navPerm('purchases'),
  },
  {
    key: 'sales',
    icon: TrendingUp,
    path: '/sales',
    section: 'salesOps',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
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
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
    ...navPerm('payments'),
    subItems: [
      { key: 'salePayments', icon: ArrowUpRight, path: '/sale-payments', ...navPerm('salePayments') },
      { key: 'purchasePayments', icon: ArrowDownLeft, path: '/purchase-payments', ...navPerm('purchasePayments') },
      {
        key: 'salesmanCommissionPayments',
        icon: Wallet,
        path: '/salesman-commission-payments',
        ...navPerm('salesmanCommissionPayments'),
      },
    ],
  },
  {
    key: 'withdrawals',
    icon: Banknote,
    path: '/withdrawals',
    section: 'finance',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
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
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
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
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
    ...navPerm('customers'),
  },
  {
    key: 'vendors',
    icon: Truck,
    path: '/vendors',
    section: 'contacts',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
    ...navPerm('vendors'),
  },
  {
    key: 'salesmen',
    icon: Briefcase,
    path: '/salesmen',
    section: 'contacts',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
    ...navPerm('salesmen'),
  },
  {
    key: 'users',
    icon: UserCheck,
    path: '/users',
    section: 'contacts',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
    ...navPerm('users'),
  },
  {
    key: 'hr',
    icon: UsersIcon,
    path: '/employees',
    section: 'hr',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
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
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
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
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
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
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
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
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
    ...navPerm('reports'),
    subItems: [
      { key: 'operationsReport', icon: BarChart3, path: '/reports', ...navPerm('reports') },
      { key: 'byCurrencyReport', icon: TrendingUp, path: '/reports/by-currency', ...navPerm('reports') },
      {
        key: 'expenseReport',
        icon: Receipt,
        path: '/reports/expenses',
        ...navPerm('expenseReport'),
      },
      { key: 'ledgerReports', icon: Scale, path: '/reports/v2', ...navPerm('reports') },
      { key: 'reportHistory', icon: History, path: '/reports/history', ...navPerm('reports') },
    ],
  },
  {
    key: 'settings',
    icon: Settings,
    path: '/settings/exchange-rates',
    section: 'system',
    color: 'bg-black',
    colorHover: 'hover:bg-neutral-900',
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
  'salesmen',
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
