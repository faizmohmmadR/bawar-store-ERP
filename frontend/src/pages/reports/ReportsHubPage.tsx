import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  BarChart3,
  BookOpen,
  DollarSign,
  FileSpreadsheet,
  Package,
  Receipt,
  Scale,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { canAccessApp, ERP_APPS, isHqAdminUser } from '@/lib/apps';
import { cn } from '@/lib/utils';

type ReportLink = {
  key: string;
  titleKey: string;
  titleFallback: string;
  hintKey: string;
  hintFallback: string;
  path: string;
  icon: LucideIcon;
  color: string;
  /** Nav permission key from ERP_APPS / NAV_PERMISSIONS */
  permissionAppKey?: string;
};

const CORE_REPORTS: ReportLink[] = [
  {
    key: 'sales',
    titleKey: 'core.navigation.salesReport',
    titleFallback: 'Sales Report',
    hintKey: 'reports.hub.salesHint',
    hintFallback: 'Billed, collected, returns, and unpaid',
    path: '/sales/report',
    icon: TrendingUp,
    color: 'bg-emerald-600',
    permissionAppKey: 'sales',
  },
  {
    key: 'purchases',
    titleKey: 'core.navigation.purchasesReport',
    titleFallback: 'Purchases Report',
    hintKey: 'reports.hub.purchasesHint',
    hintFallback: 'Received bills, paid and unpaid by vendor currency',
    path: '/purchases/report',
    icon: ShoppingCart,
    color: 'bg-cyan-700',
    permissionAppKey: 'purchases',
  },
  {
    key: 'stock',
    titleKey: 'core.navigation.stockReport',
    titleFallback: 'Stock Report',
    hintKey: 'reports.hub.stockHint',
    hintFallback: 'On-hand inventory and stock value',
    path: '/stock/report',
    icon: Package,
    color: 'bg-teal-600',
    permissionAppKey: 'stock',
  },
  {
    key: 'safe',
    titleKey: 'core.navigation.cashRegisterReports',
    titleFallback: 'Cash Register Report',
    hintKey: 'reports.hub.safeHint',
    hintFallback: 'Cash Register sessions, income, and outcome',
    path: '/cash-register/reports',
    icon: Banknote,
    color: 'bg-amber-500',
    permissionAppKey: 'cashRegister',
  },
  {
    key: 'expenses',
    titleKey: 'core.navigation.expensesReport',
    titleFallback: 'Expense Report',
    hintKey: 'reports.hub.expensesHint',
    hintFallback: 'Spending by category and payment method',
    path: '/expenses/report',
    icon: Receipt,
    color: 'bg-rose-600',
    permissionAppKey: 'expenses',
  },
  {
    key: 'payroll',
    titleKey: 'core.navigation.hrReport',
    titleFallback: 'HR & Payroll Report',
    hintKey: 'reports.hub.hrHint',
    hintFallback: 'Salaries, advances, and employee costs',
    path: '/employees/report',
    icon: Users,
    color: 'bg-cyan-700',
    permissionAppKey: 'hr',
  },
  {
    key: 'loans',
    titleKey: 'core.navigation.loansReport',
    titleFallback: 'Loans Report',
    hintKey: 'reports.hub.loansHint',
    hintFallback: 'Loans given, received, and collections',
    path: '/loans/report',
    icon: DollarSign,
    color: 'bg-orange-600',
    permissionAppKey: 'loans',
  },
];

const ACCOUNTING_REPORTS: ReportLink[] = [
  {
    key: 'pnl',
    titleKey: 'core.navigation.incomeStatement',
    titleFallback: 'Profit & Loss',
    hintKey: 'reports.hub.pnlHint',
    hintFallback: 'Income and expenses for the period',
    path: '/accounting/income-statement',
    icon: Scale,
    color: 'bg-blue-800',
    permissionAppKey: 'accounting',
  },
  {
    key: 'balance',
    titleKey: 'core.navigation.balanceSheet',
    titleFallback: 'Balance Sheet',
    hintKey: 'reports.hub.balanceHint',
    hintFallback: 'Assets, liabilities, and equity',
    path: '/accounting/balance-sheet',
    icon: FileSpreadsheet,
    color: 'bg-blue-800',
    permissionAppKey: 'accounting',
  },
  {
    key: 'trial',
    titleKey: 'core.navigation.trialBalance',
    titleFallback: 'Trial Balance',
    hintKey: 'reports.hub.trialHint',
    hintFallback: 'Debits and credits by account',
    path: '/accounting/trial-balance',
    icon: BookOpen,
    color: 'bg-blue-800',
    permissionAppKey: 'accounting',
  },
];

const EXTRA_REPORTS: ReportLink[] = [
  {
    key: 'currency',
    titleKey: 'core.navigation.byCurrencyReport',
    titleFallback: 'By Currency',
    hintKey: 'reports.hub.currencyHint',
    hintFallback: 'Trade and cash broken down by currency',
    path: '/reports/by-currency',
    icon: Wallet,
    color: 'bg-slate-700',
  },
  {
    key: 'ledger',
    titleKey: 'core.navigation.ledgerReports',
    titleFallback: 'Advanced Ledger',
    hintKey: 'reports.hub.ledgerHint',
    hintFallback: 'Detailed ledger checks for accountants',
    path: '/reports/v2',
    icon: Scale,
    color: 'bg-slate-700',
  },
];

function ReportCard({
  report,
  t,
}: {
  report: ReportLink;
  t: (key: string, fallback?: string) => string;
}) {
  const Icon = report.icon;
  return (
    <Link
      to={report.path}
      className="group flex flex-col gap-3 rounded-2xl border border-border/70 bg-background p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ring-1 ring-black/10',
            report.color,
          )}
        >
          <Icon className="h-5 w-5 text-white" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold leading-snug text-foreground">
            {t(report.titleKey, report.titleFallback)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(report.hintKey, report.hintFallback)}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function ReportsHubPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const permissionOpts = {
    isCustomer: user?.role === 'customer',
    hasPermission,
    hasAnyPermission,
    isSuperUser: !!user?.is_superuser,
    isAdmin: isHqAdminUser(user),
  };

  const canSee = (report: ReportLink) => {
    if (!report.permissionAppKey) return true;
    const app = ERP_APPS.find((row) => row.key === report.permissionAppKey);
    if (!app) return true;
    return canAccessApp(app, permissionOpts);
  };

  const core = CORE_REPORTS.filter(canSee);
  const accounting = ACCOUNTING_REPORTS.filter(canSee);
  const extras = EXTRA_REPORTS;

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_90%_0%,hsl(var(--primary)/.10),transparent_24rem),hsl(var(--muted)/.25)]">
      <div className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-700 text-white shadow-sm">
              <BarChart3 className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-heading font-bold tracking-tight">
                {t('reports.hubTitle', 'Reports')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(
                  'reports.hubSubtitle',
                  'Simple reports for sales, stock, Cash Register, expenses, payroll, loans, and accounts.',
                )}
              </p>
            </div>
          </div>
        </header>

        {core.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('reports.hubOperations', 'Operations')}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {core.map((report) => (
                <ReportCard key={report.key} report={report} t={t} />
              ))}
            </div>
          </section>
        ) : null}

        {accounting.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('reports.hubAccounting', 'Accounting')}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {accounting.map((report) => (
                <ReportCard key={report.key} report={report} t={t} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('reports.hubMore', 'More')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {extras.map((report) => (
              <ReportCard key={report.key} report={report} t={t} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
