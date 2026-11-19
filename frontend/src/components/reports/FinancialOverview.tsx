import type { ReactNode } from 'react';
import {
  BarChart3,
  Building2,
  ChevronRight,
  CircleDollarSign,
  DollarSign,
  HandCoins,
  Landmark,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/formatNumber';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReportNavigation } from '@/hooks/useReportNavigation';
import type { ReportMetricKey } from '@/lib/reportNavigation';
import { cn } from '@/lib/utils';

export interface CurrencyReportRow {
  currency_id?: number;
  symbol: string;
  name?: string;
  total_revenue?: number;
  total_returns?: number;
  total_income: number;
  cash_from_sales?: number;
  credit_sales?: number;
  total_purchases?: number;
  gross_profit: number;
  operating_expenses?: number;
  total_payroll?: number;
  total_advances?: number;
  total_expenses: number;
  net_profit: number;
  total_cash_in: number;
  total_cash_out: number;
  net_cash_flow: number;
  cash_balance: number;
  accounts_receivable: number;
  accounts_payable: number;
  loans_receivable: number;
  loans_payable: number;
  loans_given: number;
  loans_received: number;
  loan_collections: number;
  loan_repayments: number;
  cash_in_breakdown?: Array<{ type: string; amount: number; count: number }>;
  cash_out_breakdown?: Array<{ type: string; amount: number; count: number }>;
  expense_breakdown?: Array<{ type: string; amount: number; count: number }>;
  loan_breakdown?: Array<{ type: string; amount: number; count: number }>;
}

export interface FinancialOverviewData {
  currency: string;
  currency_symbol?: string;
  base_currency?: { id: number; code: string; symbol: string; name?: string };
  summary?: CurrencyReportRow | null;
  by_currency: Record<string, CurrencyReportRow>;
  currency_codes?: string[];
  cash_in_breakdown?: Array<{ type: string; amount: number; count: number }>;
  cash_out_breakdown?: Array<{ type: string; amount: number; count: number }>;
  expense_breakdown?: Array<{ type: string; amount: number; count: number }>;
}

interface MetricCardProps {
  title: string;
  value: number;
  subtitle?: ReactNode;
  currencyCode: string;
  icon: React.ReactNode;
  accent: 'green' | 'red' | 'blue' | 'purple' | 'orange' | 'indigo' | 'teal' | 'amber' | 'cyan' | 'rose';
  valueClassName?: string;
  onClick?: () => void;
}

const borderAccent = {
  green: 'border-l-primary',
  red: 'border-l-destructive',
  blue: 'border-l-primary',
  purple: 'border-l-accent',
  orange: 'border-l-accent',
  indigo: 'border-l-accent',
  teal: 'border-l-primary',
  amber: 'border-l-accent',
  cyan: 'border-l-primary',
  rose: 'border-l-destructive',
};

const titleAccent = {
  green: 'text-primary',
  red: 'text-destructive',
  blue: 'text-primary',
  purple: 'text-accent',
  orange: 'text-accent',
  indigo: 'text-accent',
  teal: 'text-primary',
  amber: 'text-accent',
  cyan: 'text-primary',
  rose: 'text-destructive',
};

const valueAccent = {
  green: 'text-primary',
  red: 'text-destructive',
  blue: 'text-primary',
  purple: 'text-accent',
  orange: 'text-accent',
  indigo: 'text-accent',
  teal: 'text-primary',
  amber: 'text-accent',
  cyan: 'text-primary',
  rose: 'text-destructive',
};

function hasPeriodActivity(row: CurrencyReportRow): boolean {
  const keys: (keyof CurrencyReportRow)[] = [
    'total_revenue', 'total_income', 'cash_from_sales', 'credit_sales',
    'total_expenses', 'net_profit', 'gross_profit',
    'total_cash_in', 'total_cash_out', 'net_cash_flow', 'cash_balance',
    'accounts_receivable', 'accounts_payable', 'loans_receivable', 'loans_payable',
    'loans_given', 'loans_received',
  ];
  return keys.some((key) => Math.abs(Number(row[key] ?? 0)) > 0.001);
}

function MetricCard({ title, value, subtitle, currencyCode, icon, accent, valueClassName, onClick }: MetricCardProps) {
  return (
    <Card
      className={cn(
        'border-l-4',
        borderAccent[accent],
        onClick && 'cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group',
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className={cn('text-sm font-medium flex items-center gap-2', titleAccent[accent])}>
          {icon}
          <span className="flex-1">{title}</span>
          {onClick && <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-70 transition-opacity shrink-0" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className={cn('text-xl sm:text-2xl font-bold', valueClassName || valueAccent[accent])}>
          {formatNumber(value)}{' '}
          <span className="text-sm font-medium text-muted-foreground">{currencyCode}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function IncomeDetails({
  sales,
  returns,
  currencyCode,
  labels,
}: {
  sales: number;
  returns: number;
  currencyCode: string;
  labels: { sales: string; returns: string };
}) {
  return (
    <span className="block space-y-1 pt-0.5">
      <span className="flex items-center justify-between gap-2">
        <span>{labels.sales}</span>
        <span className="font-medium tabular-nums">
          {formatNumber(sales)} {currencyCode}
        </span>
      </span>
      {returns > 0 && (
        <span className="flex items-center justify-between gap-2">
          <span>{labels.returns}</span>
          <span className="font-medium text-red-600 dark:text-red-400 tabular-nums">
            −{formatNumber(returns)} {currencyCode}
          </span>
        </span>
      )}
    </span>
  );
}

function BreakdownList({
  title,
  total,
  currencyCode,
  items,
  variant,
  onItemClick,
}: {
  title: string;
  total: number;
  currencyCode: string;
  items: Array<{ type: string; amount: number; count: number }>;
  variant: 'in' | 'out';
  onItemClick?: (label: string) => void;
}) {
  const { t } = useLanguage();
  const isIn = variant === 'in';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Badge variant="outline" className={isIn ? 'text-primary' : 'text-red-700'}>
          {formatNumber(total)} {currencyCode}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{t('reports.noDataAvailable')}</p>
      ) : (
        items.map((item) => (
          <button
            key={item.type}
            type="button"
            onClick={() => onItemClick?.(item.type)}
            className={cn(
              'w-full flex justify-between items-center gap-2 p-2.5 rounded-md border bg-muted/20 text-sm text-start',
              onItemClick && 'hover:bg-muted/50 hover:border-primary/30 cursor-pointer transition-colors group',
            )}
          >
            <span className="truncate flex items-center gap-2">
              {item.type}
              {onItemClick && <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-70 shrink-0" />}
            </span>
            <span className={cn('font-semibold shrink-0', isIn ? 'text-primary' : 'text-red-600')}>
              {formatNumber(Math.abs(item.amount))}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function CurrencySection({
  code,
  row,
  compact,
  showBreakdowns,
  onMetricClick,
  onBreakdownClick,
  navCurrency,
}: {
  code: string;
  row: CurrencyReportRow;
  compact?: boolean;
  showBreakdowns?: boolean;
  onMetricClick?: (metric: ReportMetricKey, currencyCode: string) => void;
  onBreakdownClick?: (label: string, currencyCode: string) => void;
  navCurrency?: string;
}) {
  const { t } = useLanguage();
  const filterCurrency = navCurrency ?? '';

  return (
    <Card className="border overflow-hidden">
      <CardHeader className="border-b bg-muted/30 py-4">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Badge className="text-base px-3 py-1 font-bold">{code}</Badge>
            <span className="text-sm text-muted-foreground font-normal">
              {row.name} ({row.symbol})
            </span>
          </div>
          <span className={cn('text-lg font-bold', row.net_profit >= 0 ? 'text-primary' : 'text-red-600')}>
            {t('reports.netProfit')}: {formatNumber(row.net_profit)} {code}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-5 space-y-5">
        <div className={cn('grid gap-3', 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4')}>
          <MetricCard
            title={t('reports.totalIncome', 'Total Income')}
            value={row.total_income}
            subtitle={
              <IncomeDetails
                sales={row.total_revenue ?? row.total_income}
                returns={row.total_returns ?? 0}
                currencyCode={code}
                labels={{
                  sales: t('reports.salesRevenue', 'Sales'),
                  returns: t('reports.returns', 'Returns'),
                }}
              />
            }
            currencyCode={code}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="green"
            onClick={onMetricClick ? () => onMetricClick('total_income', filterCurrency) : undefined}
          />
          <MetricCard
            title={t('reports.cashCollected', 'Cash Collected')}
            value={row.cash_from_sales ?? 0}
            subtitle={t('reports.cashCollectedHint', 'Sale payments received in period')}
            currencyCode={code}
            icon={<CircleDollarSign className="h-4 w-4" />}
            accent="green"
            onClick={onBreakdownClick ? () => onBreakdownClick('Sales Payments', filterCurrency) : undefined}
          />
          <MetricCard
            title={t('reports.totalExpenses', 'Total Expenses')}
            value={row.total_expenses}
            subtitle={t('reports.totalExpensesHint', 'Purchases, payroll, expenses & advances')}
            currencyCode={code}
            icon={<TrendingDown className="h-4 w-4" />}
            accent="red"
            onClick={onMetricClick ? () => onMetricClick('total_expenses', filterCurrency) : undefined}
          />
          <MetricCard
            title={t('reports.netProfit')}
            value={row.net_profit}
            subtitle={t('reports.netProfitHint', 'Income minus all expenses')}
            currencyCode={code}
            icon={<BarChart3 className="h-4 w-4" />}
            accent="indigo"
            valueClassName={row.net_profit >= 0 ? valueAccent.indigo : valueAccent.red}
            onClick={onMetricClick ? () => onMetricClick('net_profit', filterCurrency) : undefined}
          />
        </div>

        {!compact && (
          <div className={cn('grid gap-3', 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4')}>
            <MetricCard
              title={t('reports.grossProfit')}
              value={row.gross_profit}
              subtitle={t('reports.salesMinusPurchases')}
              currencyCode={code}
              icon={<DollarSign className="h-4 w-4" />}
              accent="purple"
              onClick={onMetricClick ? () => onMetricClick('gross_profit', filterCurrency) : undefined}
            />
          </div>
        )}

        <div className={cn('grid gap-3', 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4')}>
          <MetricCard
            title={t('reports.cashBalance', 'Cash in books')}
            value={row.cash_balance}
            subtitle={t(
              'reports.cashBalanceHint',
              'Cash + bank + sarafi in the books today. This is not Money collected minus costs.',
            )}
            currencyCode={code}
            icon={<Wallet className="h-4 w-4" />}
            accent="teal"
            valueClassName={row.cash_balance >= 0 ? valueAccent.teal : valueAccent.red}
            onClick={onMetricClick ? () => onMetricClick('cash_balance', filterCurrency) : undefined}
          />
          <MetricCard
            title={t('reports.accountsReceivable', 'On Credit')}
            value={row.accounts_receivable}
            subtitle={t('reports.onCreditHint', 'Unpaid balance on period sales')}
            currencyCode={code}
            icon={<Users className="h-4 w-4" />}
            accent="blue"
            onClick={onMetricClick ? () => onMetricClick('accounts_receivable', filterCurrency) : undefined}
          />
          <MetricCard
            title={t('reports.accountsPayable', 'Accounts Payable')}
            value={row.accounts_payable}
            subtitle={t('reports.accountsPayableHint', 'Amount owed to vendors')}
            currencyCode={code}
            icon={<Building2 className="h-4 w-4" />}
            accent="amber"
            onClick={onMetricClick ? () => onMetricClick('accounts_payable', filterCurrency) : undefined}
          />
          <MetricCard
            title={t('reports.netCashFlow')}
            value={row.net_cash_flow}
            subtitle={t('reports.cashInMinusCashOut')}
            currencyCode={code}
            icon={<Wallet className="h-4 w-4" />}
            accent="orange"
            valueClassName={row.net_cash_flow >= 0 ? valueAccent.orange : valueAccent.red}
            onClick={onMetricClick ? () => onMetricClick('net_cash_flow', filterCurrency) : undefined}
          />
        </div>

        <div className={cn('grid gap-3', compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4')}>
          <MetricCard
            title={t('reports.loansReceivable', 'Loans Receivable')}
            value={row.loans_receivable ?? 0}
            subtitle={t('reports.loansReceivableHint', 'Outstanding loans given')}
            currencyCode={code}
            icon={<HandCoins className="h-4 w-4" />}
            accent="cyan"
            onClick={onMetricClick ? () => onMetricClick('loans_receivable', filterCurrency) : undefined}
          />
          <MetricCard
            title={t('reports.loansPayable', 'Loans Payable')}
            value={row.loans_payable ?? 0}
            subtitle={t('reports.loansPayableHint', 'Outstanding loans received')}
            currencyCode={code}
            icon={<Landmark className="h-4 w-4" />}
            accent="rose"
            onClick={onMetricClick ? () => onMetricClick('loans_payable', filterCurrency) : undefined}
          />
          {!compact && (
            <>
              <MetricCard
                title={t('reports.loansGiven', 'Loans Given')}
                value={row.loans_given ?? 0}
                subtitle={t('reports.loansGivenHint', 'Cash lent in period')}
                currencyCode={code}
                icon={<TrendingDown className="h-4 w-4" />}
                accent="red"
                onClick={onMetricClick ? () => onMetricClick('loans_given', filterCurrency) : undefined}
              />
              <MetricCard
                title={t('reports.loansReceived', 'Loans Received')}
                value={row.loans_received ?? 0}
                subtitle={t('reports.loansReceivedHint', 'Cash borrowed in period')}
                currencyCode={code}
                icon={<TrendingUp className="h-4 w-4" />}
                accent="green"
                onClick={onMetricClick ? () => onMetricClick('loans_received', filterCurrency) : undefined}
              />
            </>
          )}
        </div>

        {showBreakdowns && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t">
            <BreakdownList
              title={t('reports.cashInflowsByType')}
              total={row.total_cash_in}
              currencyCode={code}
              items={row.cash_in_breakdown || []}
              variant="in"
              onItemClick={onBreakdownClick ? (label) => onBreakdownClick(label, filterCurrency) : undefined}
            />
            <BreakdownList
              title={t('reports.cashOutflowsByType')}
              total={row.total_cash_out}
              currencyCode={code}
              items={row.cash_out_breakdown || []}
              variant="out"
              onItemClick={onBreakdownClick ? (label) => onBreakdownClick(label, filterCurrency) : undefined}
            />
          </div>
        )}

        {showBreakdowns && (row.loan_breakdown?.length ?? 0) > 0 && (
          <div className="pt-2 border-t">
            <BreakdownList
              title={t('reports.loanActivity', 'Loan Activity')}
              total={(row.loans_given ?? 0) + (row.loans_received ?? 0) + (row.loan_collections ?? 0) + (row.loan_repayments ?? 0)}
              currencyCode={code}
              items={row.loan_breakdown || []}
              variant="in"
              onItemClick={onBreakdownClick ? (label) => onBreakdownClick(label, filterCurrency) : undefined}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FinancialOverviewProps {
  data: FinancialOverviewData;
  variant?: 'base' | 'by_currency';
  showBreakdowns?: boolean;
  compact?: boolean;
  reportPeriod?: { start_date?: string; end_date?: string };
}

export function FinancialOverview({
  data,
  variant = 'base',
  showBreakdowns = true,
  compact = false,
  reportPeriod,
}: FinancialOverviewProps) {
  const { t } = useLanguage();
  const { navigateMetric, navigateBreakdown } = useReportNavigation({
    startDate: reportPeriod?.start_date,
    endDate: reportPeriod?.end_date,
  });
  const currencyCodes = data.currency_codes?.length
    ? data.currency_codes
    : Object.keys(data.by_currency || {});
  const entries = currencyCodes
    .map((code) => [code, data.by_currency[code]] as const)
    .filter(([, row]) => row != null);
  const baseCode = data.base_currency?.code || data.currency || 'AFN';
  const baseSymbol = data.base_currency?.symbol || data.currency_symbol || baseCode;
  const summary = data.summary;

  const summaryRow: CurrencyReportRow | null = summary
    ? {
        symbol: baseSymbol,
        name: data.base_currency?.name || baseCode,
        total_revenue: summary.total_revenue ?? 0,
        total_returns: summary.total_returns ?? 0,
        total_income: summary.total_income ?? 0,
        cash_from_sales: summary.cash_from_sales ?? 0,
        credit_sales: summary.credit_sales ?? 0,
        total_expenses: summary.total_expenses ?? 0,
        net_profit: summary.net_profit ?? 0,
        gross_profit: summary.gross_profit ?? 0,
        total_cash_in: summary.total_cash_in ?? 0,
        total_cash_out: summary.total_cash_out ?? 0,
        net_cash_flow: summary.net_cash_flow ?? 0,
        cash_balance: summary.cash_balance ?? 0,
        accounts_receivable: summary.accounts_receivable ?? 0,
        accounts_payable: summary.accounts_payable ?? 0,
        loans_receivable: summary.loans_receivable ?? 0,
        loans_payable: summary.loans_payable ?? 0,
        loans_given: summary.loans_given ?? 0,
        loans_received: summary.loans_received ?? 0,
        loan_collections: summary.loan_collections ?? 0,
        loan_repayments: summary.loan_repayments ?? 0,
        cash_in_breakdown: summary.cash_in_breakdown ?? data.cash_in_breakdown,
        cash_out_breakdown: summary.cash_out_breakdown ?? data.cash_out_breakdown,
        expense_breakdown: summary.expense_breakdown ?? data.expense_breakdown,
        loan_breakdown: summary.loan_breakdown,
      }
    : null;

  if (variant === 'base' && !summary) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          {t('reports.noFinancialData')}
        </CardContent>
      </Card>
    );
  }

  if (variant === 'base' && summaryRow && !hasPeriodActivity(summaryRow)) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          {t('reports.noFinancialData')}
        </CardContent>
      </Card>
    );
  }

  if (variant === 'by_currency' && entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          {t('reports.noFinancialData')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {variant === 'base' && summaryRow && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t('reports.baseCurrencySummary')}</h2>
            <Badge variant="default" className="font-mono">
              {baseCode} ({baseSymbol})
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('reports.baseCurrencyDashboardNote')}
          </p>
          <CurrencySection
            code={baseCode}
            row={summaryRow}
            compact={compact}
            showBreakdowns={showBreakdowns}
            onMetricClick={navigateMetric}
            onBreakdownClick={navigateBreakdown}
          />
        </div>
      )}

      {variant === 'by_currency' && entries.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('reports.byCurrencyBreakdown')}</h2>
          <div className="grid gap-4">
            {entries.map(([code, row]) => (
              <CurrencySection
                key={code}
                code={code}
                row={row}
                compact={compact}
                showBreakdowns={showBreakdowns}
                onMetricClick={navigateMetric}
                onBreakdownClick={navigateBreakdown}
                navCurrency={code}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
