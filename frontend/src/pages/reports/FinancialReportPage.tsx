import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ReportFilters } from '@/components/reports/ReportFilters';
import {
  OperationalReportView,
  type OperationalReportResponse,
} from '@/components/reports/OperationalReportView';
import useFetchObjects from '@/api/useFetchObjects';
import { buildFinancialReportParams } from '@/lib/reportPeriod';
import { useLanguage } from '@/contexts/LanguageContext';

const FinancialReportPage = () => {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => ({
      ...buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
      top_limit: 10,
    }),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<OperationalReportResponse>({
    queryKey: ['financial_operational', calendar, period, startDate, endDate],
    endpoint: 'reports/operational',
    params,
    options: { staleTime: 0 },
  });

  return (
    <div className="w-full max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('reports.operationalReport', 'Operations Report')}
        subtitle={t(
          'reports.operationalReportHint',
          'Company performance in AFN: billed sales, collections, production, packing, expenses and accrual profit',
        )}
        icon={<Scale className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/reports/v2">{t('reports.ledgerReports', 'Ledger Reports')}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/reports/by-currency">
                {t('reports.byCurrencyReport', 'Multi-Currency Report')}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/accounting/income-statement">
                {t('reports.incomeStatement', 'Income Statement')}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/accounting/daily-ledger">
                {t('accounts.dailyLedger', 'Daily Transaction Book')}
              </Link>
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
            {t('reports.noFinancialData')}
          </CardContent>
        </Card>
      )}

      {!isLoading && data?.income && <OperationalReportView data={data} />}
    </div>
  );
};

export default FinancialReportPage;
