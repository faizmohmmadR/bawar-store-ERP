import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Gift,
  HandCoins,
  Loader2,
  Package,
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
};

type FreeCurrencySection = {
  code: string;
  name: string;
  invoice_count: number;
  pieces: number;
  carton_amount?: number;
  bottle_amount?: number;
  plastic_amount?: number;
  cost_afn: number;
};

type FreeItemRow = {
  key: string;
  name: string;
  item_type: string;
  barcode?: string;
  invoice_count: number;
  carton_amount: number;
  bottle_amount: number;
  plastic_amount: number;
  liter_amount?: number;
  kg_amount?: number;
  pieces: number;
  cost_afn: number;
};

type SalesReportResponse = {
  currency: string;
  kpis: {
    billed_afn: number;
    returns_afn: number;
    net_billed_afn: number;
    collected_afn: number;
    uncollected_afn: number;
    invoice_count: number;
    free_invoice_count: number;
    free_pieces: number;
    free_carton_amount?: number;
    free_bottle_amount?: number;
    free_plastic_amount?: number;
    free_cost_afn: number;
  };
  by_currency?: Record<string, CurrencySection>;
  currency_codes?: string[];
  free?: {
    invoice_count: number;
    pieces: number;
    carton_amount?: number;
    bottle_amount?: number;
    plastic_amount?: number;
    cost_afn: number;
    items?: FreeItemRow[];
    by_currency?: Record<string, FreeCurrencySection>;
    currency_codes?: string[];
  };
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
  const currencyCodes = data?.currency_codes?.length
    ? data.currency_codes
    : Object.keys(data?.by_currency || {});
  const free = data?.free;
  const freeCurrencyCodes = free?.currency_codes?.length
    ? free.currency_codes
    : Object.keys(free?.by_currency || {});

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('sales.reportTitle', 'Sales Report')}
        subtitle={t(
          'sales.reportHint',
          'Paid sales and free goods — billed, collected, and cost by currency',
        )}
        icon={<TrendingUp className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <Button variant="outline" asChild>
            <Link to="/sales">
              <ArrowLeft className="h-4 w-4" />
              {t('sales.title', 'Sales')}
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
            {t('sales.reportLoadError', 'Could not load the sales report.')}
          </CardContent>
        </Card>
      )}

      {!isLoading && kpis && (
        <>
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">
                {t('sales.reportPaidSection', 'Paid sales')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  'sales.reportPaidSectionHint',
                  'Invoices with sell price — free goods are excluded',
                )}
              </p>
            </div>
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
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('sales.reportByCurrency', 'Sales by currency')}
              </CardTitle>
              <CardDescription>
                {t(
                  'sales.reportByCurrencyHint',
                  'Native amounts per currency — not mixed',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('rawMaterials.reportCurrency', 'Currency')}</ReportTh>
                    <ReportTh>{t('sales.reportInvoices', 'Invoices')}</ReportTh>
                    <ReportTh>{t('sales.reportBilled', 'Billed')}</ReportTh>
                    <ReportTh>{t('reports.returns', 'Returns')}</ReportTh>
                    <ReportTh>{t('reports.netBilled', 'Net billed')}</ReportTh>
                    <ReportTh>{t('reports.collected', 'Collected')}</ReportTh>
                    <ReportTh>{t('reports.uncollected', 'Uncollected')}</ReportTh>
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
                      </tr>
                    );
                  })}
                  {!currencyCodes.length && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        {t('sales.reportNoData', 'No sales in this period')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">
                {t('sales.reportFreeSection', 'Free sales')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  'sales.reportFreeSectionHint',
                  'Goods given away — valued at distribution cost (AFN), not sell price',
                )}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4">
              <KpiCard
                title={t('sales.reportFreeInvoices', 'Free invoices')}
                value={kpis.free_invoice_count ?? free?.invoice_count ?? 0}
                icon={<Gift className="h-5 w-5" />}
                tone="neutral"
                formatValue={(v) => formatNumber(v)}
              />
              <KpiCard
                title={t('sales.carton', 'Carton')}
                value={kpis.free_carton_amount ?? free?.carton_amount ?? 0}
                icon={<Package className="h-5 w-5" />}
                tone="neutral"
                formatValue={(v) => formatNumber(v)}
              />
              <KpiCard
                title={t('sales.bottle', 'Bottle')}
                value={kpis.free_bottle_amount ?? free?.bottle_amount ?? 0}
                icon={<Package className="h-5 w-5" />}
                tone="neutral"
                formatValue={(v) => formatNumber(v)}
              />
              <KpiCard
                title={t('sales.plastic', 'Plastic')}
                value={kpis.free_plastic_amount ?? free?.plastic_amount ?? 0}
                icon={<Package className="h-5 w-5" />}
                tone="neutral"
                formatValue={(v) => formatNumber(v)}
              />
              <KpiCard
                title={t('sales.reportFreeCost', 'Distribution cost')}
                value={kpis.free_cost_afn ?? free?.cost_afn ?? 0}
                currency={currency}
                icon={<TrendingDown className="h-5 w-5" />}
                tone="bad"
              />
            </div>
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('sales.reportFreeItems', 'Free items')}
              </CardTitle>
              <CardDescription>
                {t(
                  'sales.reportFreeItemsHint',
                  'Each product given away — carton, bottle, and plastic amounts',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('sales.reportFreeItem', 'Item')}</ReportTh>
                    <ReportTh>{t('sales.carton', 'Carton')}</ReportTh>
                    <ReportTh>{t('sales.bottle', 'Bottle')}</ReportTh>
                    <ReportTh>{t('sales.plastic', 'Plastic')}</ReportTh>
                    <ReportTh>{t('sales.reportFreeCost', 'Distribution cost')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {(free?.items || []).map((row) => (
                    <tr key={row.key} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        {row.name}
                        {row.barcode ? (
                          <span dir="ltr" className="ms-2 text-xs text-muted-foreground">
                            {row.barcode}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2"><ReportNumber value={row.carton_amount} /></td>
                      <td className="py-2"><ReportNumber value={row.bottle_amount} /></td>
                      <td className="py-2"><ReportNumber value={row.plastic_amount} /></td>
                      <td className="py-2 tabular-nums font-medium">
                        <ReportMoney value={row.cost_afn} code="AFN" />
                      </td>
                    </tr>
                  ))}
                  {!(free?.items || []).length && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        {t('sales.reportFreeNoData', 'No free sales in this period')}
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
                {t('sales.reportFreeByCurrency', 'Free sales by currency')}
              </CardTitle>
              <CardDescription>
                {t(
                  'sales.reportFreeByCurrencyHint',
                  'Count and pack amounts by invoice currency — cost always in AFN',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('rawMaterials.reportCurrency', 'Currency')}</ReportTh>
                    <ReportTh>{t('sales.reportFreeInvoices', 'Free invoices')}</ReportTh>
                    <ReportTh>{t('sales.carton', 'Carton')}</ReportTh>
                    <ReportTh>{t('sales.bottle', 'Bottle')}</ReportTh>
                    <ReportTh>{t('sales.plastic', 'Plastic')}</ReportTh>
                    <ReportTh>{t('sales.reportFreeCost', 'Distribution cost')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {freeCurrencyCodes.map((code) => {
                    const row = free?.by_currency?.[code];
                    if (!row) return null;
                    return (
                      <tr key={code} className="border-b last:border-0">
                        <td className="py-2"><ReportCurrencyLabel code={code} name={row.name} /></td>
                        <td className="py-2"><ReportNumber value={row.invoice_count} /></td>
                        <td className="py-2"><ReportNumber value={row.carton_amount || 0} /></td>
                        <td className="py-2"><ReportNumber value={row.bottle_amount || 0} /></td>
                        <td className="py-2"><ReportNumber value={row.plastic_amount || 0} /></td>
                        <td className="py-2 tabular-nums font-medium">
                          <ReportMoney value={row.cost_afn} code="AFN" />
                        </td>
                      </tr>
                    );
                  })}
                  {!freeCurrencyCodes.length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t('sales.reportFreeNoData', 'No free sales in this period')}
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
