import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  HandCoins,
  Loader2,
  Percent,
  Scale,
  TrendingDown,
  TrendingUp,
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

type CurrencySection = {
  code: string;
  name: string;
  billed_native: number;
  returns_native: number;
  net_billed_native: number;
  collected_native: number;
  uncollected_native: number;
  invoice_count: number;
  cogs_afn?: number;
  gross_profit_afn?: number;
  margin_pct?: number;
};

type TopProduct = {
  product_id: number;
  name: string;
  sku?: string;
  barcode?: string;
  quantity_pieces: number;
  revenue_base: number;
  cogs_base: number;
  gross_profit_base: number;
};

type SalesReportResponse = {
  currency: string;
  kpis: {
    billed_afn: number;
    returns_afn: number;
    net_billed_afn: number;
    collected_afn: number;
    uncollected_afn: number;
    cogs_afn?: number;
    gross_profit_afn?: number;
    margin_pct?: number;
    invoice_count: number;
  };
  profit?: {
    revenue_afn?: number;
    cogs_afn?: number;
    gross_profit_afn?: number;
    margin_pct?: number;
    note?: string;
  };
  top_products?: TopProduct[];
  by_currency?: Record<string, CurrencySection>;
  currency_codes?: string[];
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
  hint?: string;
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
            <p dir="ltr" className="text-xl sm:text-2xl font-semibold tabular-nums whitespace-nowrap text-start">
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

const SalesReportPage = () => {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<SalesReportResponse>({
    queryKey: ['sales_report', calendar, period, startDate, endDate],
    endpoint: 'sales/report',
    params,
    options: { staleTime: 0 },
  });

  const currency = data?.currency || 'AFN';
  const kpis = data?.kpis;
  const profit = data?.profit;
  const topProducts = data?.top_products || [];
  const currencyCodes = data?.currency_codes?.length
    ? data.currency_codes
    : Object.keys(data?.by_currency || {});

  const cogs = Number(kpis?.cogs_afn ?? profit?.cogs_afn ?? 0);
  const grossProfit = Number(kpis?.gross_profit_afn ?? profit?.gross_profit_afn ?? 0);
  const marginPct = Number(kpis?.margin_pct ?? profit?.margin_pct ?? 0);

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('sales.reportTitle', 'Sales Report')}
        subtitle={t(
          'sales.reportHint',
          'Billed, collected, unpaid, and gross profit from sold goods',
        )}
        icon={<TrendingUp className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/reports">{t('reports.hubTitle', 'Reports')}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/sales">
                <ArrowLeft className="h-4 w-4" />
                {t('sales.title', 'Sales')}
              </Link>
            </Button>
          </div>
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
            {t('sales.reportLoadError', 'Could not load the sales report.')}
          </CardContent>
        </Card>
      )}

      {!isLoading && kpis && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              title={t('reports.netBilled', 'Net billed')}
              value={kpis.net_billed_afn}
              currency={currency}
              hint={`${formatNumber(kpis.invoice_count)} ${t('sales.reportInvoices', 'invoices')} · ${t('reports.returns', 'Returns')} ${formatReportMoney(kpis.returns_afn, currency)}`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <KpiCard
              title={t('reports.collected', 'Collected')}
              value={kpis.collected_afn}
              currency={currency}
              icon={<HandCoins className="h-5 w-5" />}
              tone="good"
            />
            <KpiCard
              title={t('reports.uncollected', 'Uncollected')}
              value={kpis.uncollected_afn}
              currency={currency}
              icon={<TrendingDown className="h-5 w-5" />}
              tone={kpis.uncollected_afn > 0 ? 'bad' : 'default'}
            />
            <KpiCard
              title={t('reports.returns', 'Returns')}
              value={kpis.returns_afn}
              currency={currency}
              hint={`${t('sales.reportBilled', 'Billed')} ${formatReportMoney(kpis.billed_afn, currency)} ${currency}`}
              icon={<TrendingDown className="h-5 w-5" />}
              tone="neutral"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <KpiCard
              title={t('sales.reportCogs', 'Cost of goods')}
              value={cogs}
              currency={currency}
              hint={t(
                'sales.reportCogsHint',
                'AVCO cost on sold lines in this period (AFN)',
              )}
              icon={<Scale className="h-5 w-5" />}
              tone="neutral"
            />
            <KpiCard
              title={t('sales.reportGrossProfit', 'Gross profit')}
              value={grossProfit}
              currency={currency}
              hint={t(
                'sales.reportGrossProfitHint',
                'Sold goods revenue − cost of goods',
              )}
              icon={<TrendingUp className="h-5 w-5" />}
              tone={grossProfit >= 0 ? 'good' : 'bad'}
            />
            <KpiCard
              title={t('sales.reportMargin', 'Margin')}
              value={marginPct}
              hint={t('sales.reportMarginHint', 'Gross profit ÷ sold goods revenue')}
              icon={<Percent className="h-5 w-5" />}
              tone={marginPct >= 0 ? 'good' : 'bad'}
              formatValue={(v) => `${formatNumber(v)}%`}
            />
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('sales.reportByCurrency', 'Sales by currency')}
              </CardTitle>
              <CardDescription>
                {t(
                  'sales.reportByCurrencyHint',
                  'Native billed amounts; COGS and profit always in AFN',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('rawMaterials.reportCurrency', 'Currency')}</ReportTh>
                    <ReportTh>{t('sales.reportInvoices', 'Invoices')}</ReportTh>
                    <ReportTh>{t('sales.reportBilled', 'Billed')}</ReportTh>
                    <ReportTh>{t('reports.returns', 'Returns')}</ReportTh>
                    <ReportTh>{t('reports.netBilled', 'Net billed')}</ReportTh>
                    <ReportTh>{t('reports.collected', 'Collected')}</ReportTh>
                    <ReportTh>{t('reports.uncollected', 'Uncollected')}</ReportTh>
                    <ReportTh>{t('sales.reportCogs', 'COGS')}</ReportTh>
                    <ReportTh>{t('sales.reportGrossProfit', 'Profit')}</ReportTh>
                    <ReportTh>{t('sales.reportMargin', 'Margin')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {currencyCodes.map((code) => {
                    const row = data.by_currency?.[code];
                    if (!row) return null;
                    return (
                      <tr key={code} className="border-b last:border-0">
                        <td className="py-2"><ReportCurrencyLabel code={code} name={row.name} /></td>
                        <td className="py-2"><ReportNumber value={row.invoice_count} /></td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.billed_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.returns_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums font-medium">
                          <ReportMoney value={row.net_billed_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.collected_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.uncollected_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.cogs_afn || 0} code="AFN" />
                        </td>
                        <td className="py-2 tabular-nums font-medium">
                          <ReportMoney value={row.gross_profit_afn || 0} code="AFN" />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportNumber value={row.margin_pct || 0} />%
                        </td>
                      </tr>
                    );
                  })}
                  {!currencyCodes.length && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-muted-foreground">
                        {t('sales.reportNoData', 'No sales in this period')}
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
                {t('sales.reportTopProducts', 'Top products by profit')}
              </CardTitle>
              <CardDescription>
                {t(
                  'sales.reportTopProductsHint',
                  'Revenue, cost, and gross profit per product (AFN)',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('sales.productCode', 'Code')}</ReportTh>
                    <ReportTh>{t('sales.product', 'Product')}</ReportTh>
                    <ReportTh>{t('sales.reportQty', 'Qty')}</ReportTh>
                    <ReportTh>{t('sales.reportRevenue', 'Revenue')}</ReportTh>
                    <ReportTh>{t('sales.reportCogs', 'COGS')}</ReportTh>
                    <ReportTh>{t('sales.reportGrossProfit', 'Profit')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((row) => {
                    const code = (row.sku || row.barcode || '').trim();
                    return (
                      <tr key={row.product_id} className="border-b last:border-0">
                        <td className="py-2 tabular-nums text-muted-foreground" dir="ltr">
                          {code || '—'}
                        </td>
                        <td className="py-2 font-medium">{row.name || '—'}</td>
                        <td className="py-2"><ReportNumber value={row.quantity_pieces} /></td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.revenue_base} code="AFN" />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.cogs_base} code="AFN" />
                        </td>
                        <td className="py-2 tabular-nums font-medium">
                          <ReportMoney value={row.gross_profit_base} code="AFN" />
                        </td>
                      </tr>
                    );
                  })}
                  {!topProducts.length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t('sales.reportNoProductProfit', 'No sold products with cost in this period')}
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

export default SalesReportPage;
