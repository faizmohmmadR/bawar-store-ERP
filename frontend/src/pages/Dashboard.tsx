import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, LayoutDashboard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  OperationalReportView,
  type OperationalReportResponse,
} from '@/components/reports/OperationalReportView';
import { ReportFilters } from '@/components/reports/ReportFilters';
import useFetchObjects from '@/api/useFetchObjects';
import { buildFinancialReportParams } from '@/lib/reportPeriod';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

export const Dashboard = () => {
  const { t } = useLanguage();
  const { calendar } = useCalendarPreference();
  const { user } = useAuth();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => ({
      ...buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
      top_limit: 8,
    }),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<OperationalReportResponse>({
    queryKey: ['dashboard_operational', calendar, period, startDate, endDate],
    endpoint: 'reports/operational',
    params,
    options: { staleTime: 0 },
  });

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';

  return (
    <div className="w-full max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('core.dashboard.title', 'Operations Dashboard')}
        subtitle={`${t('core.dashboard.welcome', 'Company performance for the selected period')}${firstName ? ` — ${firstName}` : ''}`}
        icon={<LayoutDashboard className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/reports">
                <BarChart3 className="h-4 w-4" />
                {t('reports.operationalReport', 'Operations Report')}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/reports/by-currency">
                {t('reports.byCurrencyReport', 'Multi-Currency Report')}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/reports/v2">
                {t('reports.ledgerReports', 'Ledger Reports')}
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
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {isError && !isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {t('reports.noFinancialData')}
          </CardContent>
        </Card>
      )}

      {!isLoading && data?.income && <OperationalReportView data={data} compact />}
    </div>
  );
};
