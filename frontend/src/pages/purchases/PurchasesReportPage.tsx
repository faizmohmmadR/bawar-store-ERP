import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  HandCoins,
  Loader2,
  ShoppingCart,
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
  paid_native: number;
  unpaid_native: number;
  invoice_count: number;
  cash_paid_in_period_native?: number;
};

type PurchasesReportResponse = {
  currency: string;
  kpis: {
    billed_afn: number;
    returns_afn: number;
    net_billed_afn: number;
    paid_afn: number;
    unpaid_afn: number;
    cash_paid_in_period_afn: number;
    invoice_count: number;
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

export default function PurchasesReportPage() {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<PurchasesReportResponse>({
    queryKey: ['purchases_report', calendar, period, startDate, endDate],
    endpoint: 'purchases/report',
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
        title={t('purchases.reportTitle', 'Purchases Report')}
        subtitle={t(
          'purchases.reportHint',
          'Received vendor bills — billed, paid, and unpaid by currency',
        )}
        icon={<ShoppingCart className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/reports">{t('reports.hubTitle', 'Reports')}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/purchases">
                <ArrowLeft className="h-4 w-4" />
                {t('core.navigation.purchases', 'Purchases')}
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
            {t('purchases.reportLoadError', 'Could not load the purchases report.')}
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
              hint={`${formatNumber(kpis.invoice_count)} ${t('purchases.reportInvoices', 'bills')}`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <KpiCard
              title={t('reports.paid', 'Paid')}
              value={kpis.paid_afn}
              currency={currency}
              icon={<HandCoins className="h-5 w-5" />}
              tone="good"
            />
            <KpiCard
              title={t('reports.unpaid', 'Unpaid')}
              value={kpis.unpaid_afn}
              currency={currency}
              icon={<TrendingDown className="h-5 w-5" />}
              tone={kpis.unpaid_afn > 0 ? 'bad' : 'default'}
            />
            <KpiCard
              title={t('purchases.cashPaidInPeriod', 'Cash paid in period')}
              value={kpis.cash_paid_in_period_afn}
              currency={currency}
              hint={t('purchases.cashPaidHint', 'Includes payments on older bills')}
              icon={<HandCoins className="h-5 w-5" />}
              tone="neutral"
            />
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('purchases.reportByCurrency', 'Purchases by currency')}
              </CardTitle>
              <CardDescription>
                {t(
                  'purchases.reportByCurrencyHint',
                  'Native amounts per currency — not mixed',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('reports.currency', 'Currency')}</ReportTh>
                    <ReportTh>{t('purchases.reportInvoices', 'Bills')}</ReportTh>
                    <ReportTh>{t('sales.reportBilled', 'Billed')}</ReportTh>
                    <ReportTh>{t('reports.netBilled', 'Net billed')}</ReportTh>
                    <ReportTh>{t('reports.paid', 'Paid')}</ReportTh>
                    <ReportTh>{t('reports.unpaid', 'Unpaid')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {currencyCodes.map((code) => {
                    const row = data.by_currency?.[code];
                    if (!row) return null;
                    return (
                      <tr key={code} className="border-b last:border-0">
                        <td className="py-2">
                          <ReportCurrencyLabel code={code} name={row.name} />
                        </td>
                        <td className="py-2">
                          <ReportNumber value={row.invoice_count} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.billed_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums font-medium">
                          <ReportMoney value={row.net_billed_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.paid_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={row.unpaid_native} code={code} />
                        </td>
                      </tr>
                    );
                  })}
                  {!currencyCodes.length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t('purchases.reportNoData', 'No purchases in this period')}
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
}
