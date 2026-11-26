import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Loader2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportFilters } from '@/components/reports/ReportFilters';
import useFetchObjects from '@/api/useFetchObjects';
import { buildFinancialReportParams } from '@/lib/reportPeriod';
import { formatReportMoney } from '@/lib/formatNumber';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

type BreakdownRow = { type: string; amount: number; count?: number };

type CurrencyRow = {
  currency_id?: number;
  symbol: string;
  name?: string;
  total_revenue?: number;
  total_returns?: number;
  total_income: number;
  cash_from_sales?: number;
  credit_sales?: number;
  total_purchases?: number;
  cogs?: number;
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
  loan_collections?: number;
  loan_repayments?: number;
  cash_in_breakdown?: BreakdownRow[];
  cash_out_breakdown?: BreakdownRow[];
  loan_breakdown?: BreakdownRow[];
};

type ByCurrencyResponse = {
  by_currency: Record<string, CurrencyRow>;
  currency_codes?: string[];
  currency_count?: number;
  period?: { start_date?: string; end_date?: string };
};

function Money({
  value,
  code,
  tone,
}: {
  value: number;
  code: string;
  tone?: 'good' | 'bad' | 'muted';
}) {
  return (
    <span
      className={cn(
        'tabular-nums font-medium whitespace-nowrap',
        tone === 'good' && 'text-emerald-700 dark:text-emerald-400',
        tone === 'bad' && 'text-red-700 dark:text-red-400',
        tone === 'muted' && 'text-muted-foreground',
      )}
    >
      {formatReportMoney(value, code)} {code}
    </span>
  );
}

function Stat({
  label,
  value,
  code,
  tone,
  icon,
}: {
  label: string;
  value: number;
  code: string;
  tone?: 'good' | 'bad';
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <p
        className={cn(
          'text-base font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-700 dark:text-emerald-400',
          tone === 'bad' && 'text-red-700 dark:text-red-400',
        )}
      >
        {formatReportMoney(value, code)}{' '}
        <span className="text-xs font-medium text-muted-foreground">{code}</span>
      </p>
    </div>
  );
}

function MiniBreakdown({
  title,
  rows,
  code,
  empty,
}: {
  title: string;
  rows: BreakdownRow[];
  code: string;
  empty: string;
}) {
  const list = (rows || []).filter((r) => (r.amount || 0) !== 0);
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-muted/40 px-3 py-2 text-sm font-medium">{title}</div>
      {list.length ? (
        <table className="w-full text-sm">
          <tbody>
            {list.map((row) => (
              <tr key={row.type} className="border-t">
                <td className="px-3 py-2">{row.type}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap">
                  {formatReportMoney(row.amount, code)} {code}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

const ByCurrencyReportPage = () => {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const params = useMemo(
    () => buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<ByCurrencyResponse>({
    queryKey: ['financial_by_currency', calendar, period, startDate, endDate],
    endpoint: 'reports/by_currency',
    params,
    options: { staleTime: 0 },
  });

  const codes = useMemo(() => {
    if (data?.currency_codes?.length) return data.currency_codes;
    return Object.keys(data?.by_currency || {});
  }, [data]);

  const rows = useMemo(
    () =>
      codes
        .map((code) => ({ code, row: data?.by_currency?.[code] }))
        .filter((item): item is { code: string; row: CurrencyRow } => !!item.row),
    [codes, data],
  );

  const active = selected && data?.by_currency?.[selected]
    ? { code: selected, row: data.by_currency[selected] }
    : null;

  const toggle = (code: string) => {
    setSelected((prev) => (prev === code ? null : code));
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('reports.byCurrencyReport', 'Multi-Currency Report')}
        subtitle={t(
          'reports.byCurrencyPageHint',
          'Each currency in its own units (no conversion). Gross profit uses ledger COGS; cash balance is the GL cash/bank/sarafi position.',
        )}
        icon={<Banknote className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/reports">{t('reports.operationalReport', 'Operations Report')}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/reports/v2">{t('reports.ledgerReports', 'Ledger Reports')}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                {t('core.dashboard.title', 'Operations Dashboard')}
              </Link>
            </Button>
          </div>
        }
        period={period}
        onPeriodChange={(value) => {
          setPeriod(value);
          setSelected(null);
        }}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
      />

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('reports.analyzingData')}</p>
        </div>
      )}

      {isError && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('reports.noFinancialData')}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {t('reports.currenciesWithActivity', 'Currencies with activity')}:{' '}
              {data?.currency_count ?? rows.length}
            </Badge>
            <p className="text-xs text-muted-foreground">
              {t('reports.allCurrenciesNote', 'All currencies shown separately — no conversion applied')}
            </p>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t('reports.byCurrencyBreakdown', 'Performance by Currency')}
              </CardTitle>
              <CardDescription>
                {t(
                  'reports.byCurrencyTableHint',
                  'Compare sales, collections, COGS-based profit and cash position for each currency',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {t('reports.noFinancialData')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y bg-muted/40 text-muted-foreground text-left">
                        <th className="px-4 py-3 font-medium">
                          {t('reports.currency', 'Currency')}
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          {t('reports.totalIncome', 'Income')}
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          {t('reports.collected', 'Collected')}
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          {t('reports.uncollected', 'Uncollected')}
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          {t('reports.totalExpenses', 'Expenses')}
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          {t('reports.netProfit', 'Net profit')}
                        </th>
                        <th className="px-4 py-3 font-medium text-right">
                          {t('reports.netCashFlow', 'Cash flow')}
                        </th>
                        <th className="px-4 py-3 font-medium text-right w-28">
                          {t('reports.details', 'Details')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ code, row }) => {
                        const open = selected === code;
                        return (
                          <tr
                            key={code}
                            className={cn(
                              'border-b last:border-0 transition-colors',
                              open ? 'bg-primary/5' : 'hover:bg-muted/30',
                            )}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge variant="outline" className="font-mono shrink-0">
                                  {code}
                                </Badge>
                                <div className="min-w-0">
                                  <div className="font-medium truncate">
                                    {row.name || code}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {row.symbol}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Money value={row.total_income} code={code} tone="good" />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Money value={row.cash_from_sales ?? 0} code={code} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Money
                                value={row.credit_sales ?? row.accounts_receivable ?? 0}
                                code={code}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Money value={row.total_expenses} code={code} tone="bad" />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Money
                                value={row.net_profit}
                                code={code}
                                tone={row.net_profit >= 0 ? 'good' : 'bad'}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Money
                                value={row.net_cash_flow}
                                code={code}
                                tone={row.net_cash_flow >= 0 ? 'good' : 'bad'}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                size="sm"
                                variant={open ? 'default' : 'outline'}
                                onClick={() => toggle(code)}
                              >
                                {open ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                                {open
                                  ? t('reports.hideDetails', 'Hide')
                                  : t('reports.details', 'Details')}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {active && (
            <Card className="overflow-hidden">
              <CardHeader className="pb-3 border-b bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge className="font-mono">{active.code}</Badge>
                      {active.row.name || active.code}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {t(
                        'reports.currencyDetailHint',
                        'Native amounts for this currency only — profit, cash, receivables and loans',
                      )}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    {t('reports.hideDetails', 'Hide')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    {t('reports.profitSection', 'Profit & loss')}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <Stat
                      label={t('reports.salesRevenue', 'Sales Revenue')}
                      value={active.row.total_revenue ?? active.row.total_income}
                      code={active.code}
                      tone="good"
                      icon={<TrendingUp className="h-3.5 w-3.5" />}
                    />
                    <Stat
                      label={t('reports.returns', 'Returns')}
                      value={active.row.total_returns ?? 0}
                      code={active.code}
                      tone="bad"
                      icon={<TrendingDown className="h-3.5 w-3.5" />}
                    />
                    <Stat
                      label={t('reports.costOfGoodsSold', 'Cost of Goods Sold')}
                      value={active.row.cogs ?? 0}
                      code={active.code}
                      tone="bad"
                    />
                    <Stat
                      label={t('reports.grossProfit', 'Gross profit')}
                      value={active.row.gross_profit}
                      code={active.code}
                    />
                    <Stat
                      label={t('reports.netProfit', 'Net profit')}
                      value={active.row.net_profit}
                      code={active.code}
                      tone={active.row.net_profit >= 0 ? 'good' : 'bad'}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    {t('reports.cashAndBalances', 'Cash & balances')}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat
                      label={t('reports.collected', 'Collected')}
                      value={active.row.cash_from_sales ?? 0}
                      code={active.code}
                      icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                    />
                    <Stat
                      label={t('reports.uncollected', 'Uncollected')}
                      value={active.row.credit_sales ?? active.row.accounts_receivable ?? 0}
                      code={active.code}
                    />
                    <Stat
                      label={t('reports.accountsPayable', 'Payable')}
                      value={active.row.accounts_payable}
                      code={active.code}
                    />
                    <Stat
                      label={t('reports.cashBalance', 'Cash in books')}
                      value={active.row.cash_balance}
                      code={active.code}
                      tone={active.row.cash_balance >= 0 ? 'good' : 'bad'}
                      icon={<Wallet className="h-3.5 w-3.5" />}
                    />
                    <Stat
                      label={t('reports.netCashFlow', 'Net money this period')}
                      value={active.row.net_cash_flow}
                      code={active.code}
                      tone={active.row.net_cash_flow >= 0 ? 'good' : 'bad'}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t(
                      'reports.cashBalanceVsFlowHint',
                      'Cash in books is the total cash/bank/sarafi in records. Money came in / went out / collected / costs are only for this period.',
                    )}
                  </p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Landmark className="h-4 w-4" />
                    {t('reports.financingSection', 'Financing (Loans)')}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat
                      label={t('reports.loansReceivable', 'Loans receivable')}
                      value={active.row.loans_receivable ?? 0}
                      code={active.code}
                      icon={<HandCoins className="h-3.5 w-3.5" />}
                    />
                    <Stat
                      label={t('reports.loansPayable', 'Loans payable')}
                      value={active.row.loans_payable ?? 0}
                      code={active.code}
                      icon={<Landmark className="h-3.5 w-3.5" />}
                    />
                    <Stat
                      label={t('reports.loansGiven', 'Loans given')}
                      value={active.row.loans_given ?? 0}
                      code={active.code}
                    />
                    <Stat
                      label={t('reports.loansReceived', 'Loans received')}
                      value={active.row.loans_received ?? 0}
                      code={active.code}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                  <MiniBreakdown
                    title={t('reports.cashInflowsByType', 'Cash inflows')}
                    rows={active.row.cash_in_breakdown || []}
                    code={active.code}
                    empty={t('reports.noChartData', 'No data for this period')}
                  />
                  <MiniBreakdown
                    title={t('reports.cashOutflowsByType', 'Cash outflows')}
                    rows={active.row.cash_out_breakdown || []}
                    code={active.code}
                    empty={t('reports.noChartData', 'No data for this period')}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default ByCurrencyReportPage;
