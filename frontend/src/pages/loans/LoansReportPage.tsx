import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowDownLeft,
  DollarSign,
  Loader2,
  Scale,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportFilters } from '@/components/reports/ReportFilters';
import {
  ReportCurrencyLabel,
  ReportMoney,
  ReportTh,
} from '@/components/reports/ReportAmount';
import useFetchObjects from '@/api/useFetchObjects';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildFinancialReportParams } from '@/lib/reportPeriod';
import { formatReportMoney } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

type SideAmounts = {
  total_native: number;
  paid_native: number;
  balance_native: number;
};

type CurrencySection = {
  code: string;
  name: string;
  owed_to_me?: SideAmounts;
  i_owe?: SideAmounts;
  receivable_total_native: number;
  receivable_paid_native: number;
  loans_receivable_native: number;
  payable_total_native: number;
  payable_paid_native: number;
  loans_payable_native: number;
};

type LoansReportResponse = {
  currency: string;
  kpis: {
    owed_to_me_total_afn: number;
    owed_to_me_paid_afn: number;
    owed_to_me_balance_afn: number;
    i_owe_total_afn: number;
    i_owe_paid_afn: number;
    i_owe_balance_afn: number;
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

function SideBlock({
  title,
  subtitle,
  total,
  paid,
  balance,
  currency,
  tone,
}: {
  title: string;
  subtitle: string;
  total: number;
  paid: number;
  balance: number;
  currency: string;
  tone: 'owed' | 'owe';
}) {
  const { t } = useLanguage();
  const headerTone = tone === 'owed' ? 'text-emerald-700' : 'text-amber-700';

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className={cn('text-base', headerTone)}>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard
            title={t('loans.reportTotal', 'Total')}
            value={total}
            currency={currency}
            icon={<Wallet className="h-5 w-5" />}
            tone="neutral"
          />
          <KpiCard
            title={t('loans.reportPaid', 'Paid')}
            value={paid}
            currency={currency}
            icon={<ArrowDownLeft className="h-5 w-5" />}
            tone="good"
          />
          <KpiCard
            title={t('loans.reportBalance', 'Balance')}
            value={balance}
            currency={currency}
            icon={<Scale className="h-5 w-5" />}
            tone={tone === 'owed' ? 'default' : 'bad'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

const LoansReportPage = () => {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<LoansReportResponse>({
    queryKey: ['loans_report', calendar, period, startDate, endDate],
    endpoint: 'loans/report',
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
        title={t('loans.reportTitle', 'Loans Report')}
        subtitle={t(
          'loans.reportHint',
          'Loans owed to me and loans I owe — total, paid, and balance',
        )}
        icon={<DollarSign className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <Button variant="outline" asChild>
            <Link to="/loans">
              <ArrowLeft className="h-4 w-4" />
              {t('loans.title', 'Loans')}
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
            {t('loans.reportLoadError', 'Could not load the loans report.')}
          </CardContent>
        </Card>
      )}

      {!isLoading && kpis && (
        <>
          <SideBlock
            title={t('loans.reportOwedToMe', 'Loans owed to me')}
            subtitle={t(
              'loans.reportOwedToMeHint',
              'Money others borrowed from you',
            )}
            total={kpis.owed_to_me_total_afn}
            paid={kpis.owed_to_me_paid_afn}
            balance={kpis.owed_to_me_balance_afn}
            currency={currency}
            tone="owed"
          />

          <SideBlock
            title={t('loans.reportIOwe', 'Loans I owe')}
            subtitle={t('loans.reportIOweHint', 'Money you borrowed from others')}
            total={kpis.i_owe_total_afn}
            paid={kpis.i_owe_paid_afn}
            balance={kpis.i_owe_balance_afn}
            currency={currency}
            tone="owe"
          />

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('loans.reportByCurrency', 'Loans by currency')}
              </CardTitle>
              <CardDescription>
                {t(
                  'loans.reportByCurrencyHint',
                  'Native amounts per currency — not mixed',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('rawMaterials.reportCurrency', 'Currency')}</ReportTh>
                    <ReportTh colSpan={3}>{t('loans.reportOwedToMe', 'Owed to me')}</ReportTh>
                    <ReportTh colSpan={3}>{t('loans.reportIOwe', 'I owe')}</ReportTh>
                  </tr>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh />
                    <ReportTh>{t('loans.reportTotal', 'Total')}</ReportTh>
                    <ReportTh>{t('loans.reportPaid', 'Paid')}</ReportTh>
                    <ReportTh>{t('loans.reportBalance', 'Balance')}</ReportTh>
                    <ReportTh>{t('loans.reportTotal', 'Total')}</ReportTh>
                    <ReportTh>{t('loans.reportPaid', 'Paid')}</ReportTh>
                    <ReportTh>{t('loans.reportBalance', 'Balance')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {currencyCodes.map((code) => {
                    const row = data.by_currency?.[code];
                    if (!row) return null;
                    const owed = row.owed_to_me || {
                      total_native: row.receivable_total_native,
                      paid_native: row.receivable_paid_native,
                      balance_native: row.loans_receivable_native,
                    };
                    const owe = row.i_owe || {
                      total_native: row.payable_total_native,
                      paid_native: row.payable_paid_native,
                      balance_native: row.loans_payable_native,
                    };
                    return (
                      <tr key={code} className="border-b last:border-0">
                        <td className="py-2"><ReportCurrencyLabel code={code} name={row.name} /></td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={owed.total_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={owed.paid_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums font-medium">
                          <ReportMoney value={owed.balance_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={owe.total_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums">
                          <ReportMoney value={owe.paid_native} code={code} />
                        </td>
                        <td className="py-2 tabular-nums font-medium">
                          <ReportMoney value={owe.balance_native} code={code} />
                        </td>
                      </tr>
                    );
                  })}
                  {!currencyCodes.length && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        {t('loans.reportNoData', 'No loan activity in this period')}
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

export default LoansReportPage;
