import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Boxes,
  Factory,
  Loader2,
  ShoppingCart,
  TrendingDown,
  Warehouse,
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
  purchased_native: number;
  purchased_afn: number;
  unpaid_native: number;
  purchase_count: number;
};

type RawMaterialReportResponse = {
  currency: string;
  kpis: {
    stock_value_afn: number;
    stock_skus: number;
    purchased_value_afn: number;
    purchase_count: number;
    consumed_value_afn: number;
    production_consumed_afn: number;
    packing_consumed_afn: number;
    purchases_unpaid_afn: number;
  };
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
}: {
  title: string;
  value: number;
  hint?: string;
  currency?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'neutral';
}) {
  const toneClass =
    tone === 'good'
      ? 'border-l-emerald-500'
      : tone === 'bad'
        ? 'border-l-red-500'
        : tone === 'neutral'
          ? 'border-l-sky-500'
          : 'border-l-primary';

  return (
    <Card className={cn('h-full border-l-4 shadow-sm', toneClass)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <p dir="ltr" className="text-xl sm:text-2xl font-semibold tabular-nums whitespace-nowrap text-start">
              <span>{formatReportMoney(value, currency)}</span>
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

const RawMaterialReportPage = () => {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<RawMaterialReportResponse>({
    queryKey: ['raw_material_report', calendar, period, startDate, endDate],
    endpoint: 'raw-materials/report',
    params,
    options: { staleTime: 0 },
  });

  const currency = data?.currency || 'AFN';
  const kpis = data?.kpis;
  const currencyCodes = data?.currency_codes?.length
    ? data.currency_codes
    : Object.keys(data?.by_currency || {});

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('rawMaterials.reportTitle', 'Raw Materials Report')}
        subtitle={t('rawMaterials.reportHint', 'Stock, purchases by currency, and consumption')}
        icon={<Boxes className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <Button variant="outline" asChild>
            <Link to="/raw-materials">
              <ArrowLeft className="h-4 w-4" />
              {t('rawMaterials.title', 'Raw Materials')}
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
            {t('rawMaterials.reportLoadError', 'Could not load the raw materials report.')}
          </CardContent>
        </Card>
      )}

      {!isLoading && kpis && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              title={t('rawMaterials.reportStockValue', 'Stock value')}
              value={kpis.stock_value_afn}
              currency={currency}
              hint={`${formatNumber(kpis.stock_skus)} ${t('rawMaterials.reportSkus', 'SKUs')}`}
              icon={<Warehouse className="h-5 w-5" />}
            />
            <KpiCard
              title={t('rawMaterials.reportPurchased', 'Purchased')}
              value={kpis.purchased_value_afn}
              currency={currency}
              hint={`${formatNumber(kpis.purchase_count)} ${t('rawMaterials.reportPurchases', 'purchases')}`}
              icon={<ShoppingCart className="h-5 w-5" />}
              tone="neutral"
            />
            <KpiCard
              title={t('rawMaterials.reportConsumed', 'Consumed')}
              value={kpis.consumed_value_afn}
              currency={currency}
              hint={`${t('rawMaterials.reportProduction', 'Production')} ${formatReportMoney(kpis.production_consumed_afn, currency)} · ${t('rawMaterials.reportPacking', 'Packing')} ${formatReportMoney(kpis.packing_consumed_afn, currency)}`}
              icon={<Factory className="h-5 w-5" />}
              tone="bad"
            />
            <KpiCard
              title={t('rawMaterials.reportUnpaidPurchases', 'Unpaid purchases')}
              value={kpis.purchases_unpaid_afn}
              currency={currency}
              icon={<TrendingDown className="h-5 w-5" />}
              tone={kpis.purchases_unpaid_afn > 0 ? 'bad' : 'default'}
            />
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('rawMaterials.reportByCurrency', 'Purchases by currency')}
              </CardTitle>
              <CardDescription>
                {t(
                  'rawMaterials.reportByCurrencyHint',
                  'Native amounts per currency — not mixed',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('rawMaterials.reportCurrency', 'Currency')}</ReportTh>
                    <ReportTh>{t('rawMaterials.reportPurchases', 'Purchases')}</ReportTh>
                    <ReportTh>{t('rawMaterials.reportNative', 'Native')}</ReportTh>
                    <ReportTh>{t('rawMaterials.reportAfnEquiv', 'AFN equiv.')}</ReportTh>
                    <ReportTh>{t('rawMaterials.reportUnpaidPurchases', 'Unpaid')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {currencyCodes.map((code) => {
                    const row = data.by_currency?.[code];
                    if (!row) return null;
                    return (
                      <tr key={code} className="border-b last:border-0">
                        <td className="py-2"><ReportCurrencyLabel code={code} name={row.name} /></td>
                        <td className="py-2"><ReportNumber value={row.purchase_count} /></td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.purchased_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.purchased_afn} code="AFN" />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.unpaid_native} code={code} />
                        </td>
                      </tr>
                    );
                  })}
                  {!currencyCodes.length && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        {t('rawMaterials.reportNoPurchases', 'No received purchases in this period')}
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

export default RawMaterialReportPage;
