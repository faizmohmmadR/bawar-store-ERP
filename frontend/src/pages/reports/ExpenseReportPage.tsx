import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  Building2,
  Loader2,
  Receipt,
  Store,
  Tags,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportFilters } from '@/components/reports/ReportFilters';
import {
  ReportCurrencyLabel,
  ReportMoney,
  ReportNumber,
  ReportTh,
} from '@/components/reports/ReportAmount';
import useFetchObjects from '@/api/useFetchObjects';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildFinancialReportParams } from '@/lib/reportPeriod';
import { formatNumber, formatReportMoney } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

type CurrencyRow = {
  currency_id: number;
  code: string;
  symbol: string;
  name: string;
  count: number;
  with_receipt_count: number;
  total_native: number;
  total_afn: number;
  cash_native: number;
  bank_native: number;
  sarafi_native: number;
  cash_afn: number;
  bank_afn: number;
  sarafi_afn: number;
};

type CategoryRow = {
  category_id: number | null;
  name: string;
  currency_code: string;
  count: number;
  total_native: number;
  total_afn: number;
};

type MethodRow = {
  payment_method: string;
  currency_code: string;
  count: number;
  total_native: number;
  total_afn: number;
};

type ExpenseLine = {
  id: number;
  category_id: number | null;
  category_name: string;
  description: string;
  payment_method: string;
  has_receipt: boolean;
  amount_native: number;
  amount_afn: number;
  currency_code: string;
  expense_date: string | null;
  user_name: string;
};

type ExpenseReportResponse = {
  currency: string;
  kpis: {
    expense_count: number;
    category_count: number;
    currency_count: number;
    with_receipt_count: number;
    total_afn: number;
    cash_afn: number;
    bank_afn: number;
    sarafi_afn: number;
  };
  by_currency?: Record<string, CurrencyRow>;
  currency_codes?: string[];
  by_category?: CategoryRow[];
  by_payment_method?: MethodRow[];
  expenses?: ExpenseLine[];
};

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];

function KpiCard({
  title,
  value,
  hint,
  currency,
  icon,
  tone = 'default',
  formatValue,
}: {
  title: string;
  value: number;
  hint?: React.ReactNode;
  currency?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'neutral';
  formatValue?: (value: number, currency?: string) => string;
}) {
  const toneClass =
    tone === 'good'
      ? 'border-l-emerald-500'
      : tone === 'bad'
        ? 'border-l-red-500'
        : tone === 'neutral'
          ? 'border-l-sky-500'
          : 'border-l-primary';

  const display = formatValue
    ? formatValue(value, currency)
    : formatReportMoney(value, currency);

  return (
    <Card className={cn('h-full border-l-4 shadow-sm', toneClass)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <p
              dir="ltr"
              className="text-xl sm:text-2xl font-semibold tabular-nums whitespace-nowrap text-start"
            >
              <span>{display}</span>
              {currency ? <span className="ms-1">{currency}</span> : null}
            </p>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          <div className="rounded-md bg-muted/60 p-2 text-muted-foreground shrink-0">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const ExpenseReportPage = () => {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<ExpenseReportResponse>({
    queryKey: ['expense_report', calendar, period, startDate, endDate],
    endpoint: 'expenses/report',
    params,
    options: { staleTime: 0 },
  });

  const kpis = data?.kpis;
  const currencyCodes = data?.currency_codes?.length
    ? data.currency_codes
    : Object.keys(data?.by_currency || {});
  const byCurrency = data?.by_currency || {};
  const byCategory = data?.by_category || [];
  const byMethod = data?.by_payment_method || [];
  const expenses = data?.expenses || [];

  const primaryCode =
    currencyCodes.find((code) => (byCurrency[code]?.total_afn || 0) > 0 && code !== 'AFN') ||
    currencyCodes.find((code) => (byCurrency[code]?.total_native || 0) > 0) ||
    currencyCodes[0] ||
    'AFN';
  const primary = byCurrency[primaryCode];
  const singleCurrency = currencyCodes.length === 1;
  const kpiCode = singleCurrency ? primaryCode : 'AFN';
  const kpiTotal = singleCurrency
    ? (primary?.total_native ?? kpis?.total_afn ?? 0)
    : (kpis?.total_afn ?? 0);

  const methodLabel = (method: string) => {
    const map: Record<string, string> = {
      cash: t('expenses.paymentCash', 'Cash'),
      bank: t('expenses.paymentBank', 'Bank'),
      sarafi: t('expenses.paymentSarafi', 'Sarafi'),
    };
    return map[method] || method;
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('expenses.reportTitle', 'Expense Report')}
        subtitle={t(
          'expenses.reportHint',
          'Expenses by currency, category, and payment method',
        )}
        icon={<Receipt className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <Button variant="outline" asChild>
            <Link to="/expenses">
              <ArrowLeft className="h-4 w-4" />
              {t('expenses.expenses', 'Expenses')}
            </Link>
          </Button>
        }
        periods={PERIODS}
        period={period}
        onPeriodChange={setPeriod}
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
            {t('expenses.reportLoadError', 'Could not load the expense report.')}
          </CardContent>
        </Card>
      )}

      {!isLoading && kpis && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              title={t('expenses.reportTotal', 'Total expenses')}
              value={kpiTotal}
              currency={kpiCode}
              hint={
                singleCurrency && primary && primaryCode !== 'AFN' ? (
                  <>
                    {t('expenses.reportAfnEq', 'AFN eq.')}{' '}
                    <ReportMoney value={primary.total_afn} code="AFN" />
                  </>
                ) : !singleCurrency ? (
                  t('expenses.reportAfnTotalHint', 'All currencies as AFN')
                ) : (
                  `${formatNumber(kpis.expense_count)} ${t('expenses.reportItems', 'items')}`
                )
              }
              icon={<Wallet className="h-5 w-5" />}
              tone="bad"
            />
            <KpiCard
              title={t('expenses.reportCount', 'Expense count')}
              value={kpis.expense_count}
              hint={`${formatNumber(kpis.with_receipt_count)} ${t('expenses.reportWithReceipt', 'with receipt')}`}
              icon={<Receipt className="h-5 w-5" />}
              formatValue={(v) => formatNumber(v)}
            />
            <KpiCard
              title={t('expenses.reportCategories', 'Categories')}
              value={kpis.category_count}
              hint={`${formatNumber(kpis.currency_count)} ${t('expenses.reportCurrencies', 'currencies')}`}
              icon={<Tags className="h-5 w-5" />}
              tone="neutral"
              formatValue={(v) => formatNumber(v)}
            />
            <KpiCard
              title={t('expenses.reportCashPaid', 'Cash paid')}
              value={
                singleCurrency
                  ? (primary?.cash_native ?? kpis.cash_afn)
                  : kpis.cash_afn
              }
              currency={kpiCode}
              hint={
                <>
                  {t('expenses.paymentBank', 'Bank')}{' '}
                  <ReportMoney
                    value={singleCurrency ? (primary?.bank_native ?? 0) : kpis.bank_afn}
                    code={kpiCode}
                  />
                  {' · '}
                  {t('expenses.paymentSarafi', 'Sarafi')}{' '}
                  <ReportMoney
                    value={singleCurrency ? (primary?.sarafi_native ?? 0) : kpis.sarafi_afn}
                    code={kpiCode}
                  />
                </>
              }
              icon={<Banknote className="h-5 w-5" />}
              tone="neutral"
            />
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('expenses.reportByCurrency', 'Expenses by currency')}
              </CardTitle>
              <CardDescription>
                {t(
                  'expenses.reportByCurrencyHint',
                  'Native amounts per currency — never mixed',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('expenses.currency', 'Currency')}</ReportTh>
                    <ReportTh>{t('expenses.reportCount', 'Count')}</ReportTh>
                    <ReportTh>{t('expenses.reportTotal', 'Total')}</ReportTh>
                    <ReportTh>{t('expenses.paymentCash', 'Cash')}</ReportTh>
                    <ReportTh>{t('expenses.paymentBank', 'Bank')}</ReportTh>
                    <ReportTh>{t('expenses.paymentSarafi', 'Sarafi')}</ReportTh>
                    <ReportTh>{t('expenses.reportAfnEq', 'AFN eq.')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {currencyCodes.map((code) => {
                    const row = byCurrency[code];
                    if (!row) return null;
                    return (
                      <tr key={code} className="border-b last:border-0">
                        <td className="py-2">
                          <ReportCurrencyLabel code={code} name={row.name} />
                        </td>
                        <td className="py-2">
                          <ReportNumber value={row.count} />
                          {row.with_receipt_count > 0 ? (
                            <span className="ms-1 text-xs text-muted-foreground">
                              ({formatNumber(row.with_receipt_count)}{' '}
                              {t('expenses.hasReceipt', 'Has Receipt')})
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 font-medium">
                          <ReportMoney value={row.total_native} code={code} />
                        </td>
                        <td className="py-2">
                          <ReportMoney value={row.cash_native} code={code} />
                        </td>
                        <td className="py-2">
                          <ReportMoney value={row.bank_native} code={code} />
                        </td>
                        <td className="py-2">
                          <ReportMoney value={row.sarafi_native} code={code} />
                        </td>
                        <td className="py-2 text-muted-foreground">
                          <ReportMoney value={row.total_afn} code="AFN" />
                        </td>
                      </tr>
                    );
                  })}
                  {!currencyCodes.length && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        {t('expenses.reportNoData', 'No expenses in this period')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t('expenses.reportByCategory', 'By category')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'expenses.reportByCategoryHint',
                    'Native totals per category and currency',
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <ReportTh>{t('expenses.category', 'Category')}</ReportTh>
                      <ReportTh>{t('expenses.currency', 'Currency')}</ReportTh>
                      <ReportTh>{t('expenses.reportCount', 'Count')}</ReportTh>
                      <ReportTh>{t('expenses.reportTotal', 'Total')}</ReportTh>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map((row) => (
                      <tr
                        key={`${row.category_id ?? 'none'}-${row.currency_code}`}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 font-medium">{row.name}</td>
                        <td className="py-2">
                          <ReportCurrencyLabel code={row.currency_code} />
                        </td>
                        <td className="py-2">
                          <ReportNumber value={row.count} />
                        </td>
                        <td className="py-2 font-medium">
                          <ReportMoney value={row.total_native} code={row.currency_code} />
                        </td>
                      </tr>
                    ))}
                    {!byCategory.length && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          {t('expenses.reportNoData', 'No expenses in this period')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {t('expenses.reportByMethod', 'By payment method')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'expenses.reportByMethodHint',
                    'Cash book used for each currency',
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <ReportTh>{t('expenses.paymentMethod', 'Payment method')}</ReportTh>
                      <ReportTh>{t('expenses.currency', 'Currency')}</ReportTh>
                      <ReportTh>{t('expenses.reportCount', 'Count')}</ReportTh>
                      <ReportTh>{t('expenses.reportTotal', 'Total')}</ReportTh>
                    </tr>
                  </thead>
                  <tbody>
                    {byMethod.map((row) => (
                      <tr
                        key={`${row.payment_method}-${row.currency_code}`}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 font-medium">
                          <span className="inline-flex items-center gap-2">
                            {row.payment_method === 'bank' ? (
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            ) : row.payment_method === 'sarafi' ? (
                              <Store className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Banknote className="h-4 w-4 text-muted-foreground" />
                            )}
                            {methodLabel(row.payment_method)}
                          </span>
                        </td>
                        <td className="py-2">
                          <ReportCurrencyLabel code={row.currency_code} />
                        </td>
                        <td className="py-2">
                          <ReportNumber value={row.count} />
                        </td>
                        <td className="py-2 font-medium">
                          <ReportMoney value={row.total_native} code={row.currency_code} />
                        </td>
                      </tr>
                    ))}
                    {!byMethod.length && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          {t('expenses.reportNoData', 'No expenses in this period')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('expenses.reportLines', 'Expenses in period')}
              </CardTitle>
              <CardDescription>
                {t(
                  'expenses.reportLinesHint',
                  'Top expenses in the currency they were saved',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[920px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('expenses.category', 'Category')}</ReportTh>
                    <ReportTh>{t('expenses.description', 'Description')}</ReportTh>
                    <ReportTh>{t('expenses.paymentMethod', 'Paid from')}</ReportTh>
                    <ReportTh>{t('expenses.currency', 'Currency')}</ReportTh>
                    <ReportTh>{t('expenses.amount', 'Amount')}</ReportTh>
                    <ReportTh>{t('expenses.reportAfnEq', 'AFN eq.')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <Link
                          to={`/expenses/${row.id}`}
                          className="text-primary hover:underline"
                        >
                          {row.category_name}
                        </Link>
                      </td>
                      <td className="py-2 text-muted-foreground max-w-[240px] truncate">
                        {row.description || '—'}
                      </td>
                      <td className="py-2">{methodLabel(row.payment_method)}</td>
                      <td className="py-2">
                        <ReportCurrencyLabel code={row.currency_code} />
                      </td>
                      <td className="py-2 font-medium">
                        <ReportMoney value={row.amount_native} code={row.currency_code} />
                      </td>
                      <td className="py-2 text-muted-foreground">
                        <ReportMoney value={row.amount_afn} code="AFN" />
                      </td>
                    </tr>
                  ))}
                  {!expenses.length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t('expenses.reportNoData', 'No expenses in this period')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default ExpenseReportPage;
