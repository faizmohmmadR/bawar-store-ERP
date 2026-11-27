import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, LayoutDashboard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DashboardActivitySection } from '@/components/dashboard/DashboardActivitySection';
import { ReportFilters } from '@/components/reports/ReportFilters';
import useFetchObjects from '@/api/useFetchObjects';
import { buildFinancialReportParams } from '@/lib/reportPeriod';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';

const DASHBOARD_PERIODS = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];

type DashboardReport = {
  currency?: string;
  period?: { label?: string };
  activity?: {
    currency?: string;
    rows?: Array<{
      key: string;
      label: string;
      amount_afn: number;
      count?: number;
      kind?: string;
      group?: string;
    }>;
    totals?: Record<string, number>;
    balances?: Record<string, number>;
    notes?: string[];
  };
};

export const Dashboard = () => {
  const { t } = useLanguage();
  const { calendar } = useCalendarPreference();
  const { user } = useAuth();
  const [period, setPeriod] = useState('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => ({
      ...buildFinancialReportParams(period, startDate, endDate, 'daily', calendar),
      top_limit: 1,
    }),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<DashboardReport>({
    queryKey: ['dashboard_operational', calendar, period, startDate, endDate],
    endpoint: 'reports/operational',
    params,
    options: { staleTime: 30_000 },
  });

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || '';
  const periodLabel = data?.period?.label
    || (period === 'daily'
      ? t('reports.today', 'Today')
      : period === 'weekly'
        ? t('reports.thisWeek', 'This week')
        : period === 'monthly'
          ? t('reports.thisMonth', 'This month')
          : period === 'yearly'
            ? t('reports.thisYear', 'This year')
            : t('reports.customRange', 'Custom range'));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <ReportFilters
        title={t('core.dashboard.title', 'Operations Dashboard')}
        subtitle={
          firstName
            ? `${t('core.dashboard.welcome', 'Company performance for the selected period')} — ${firstName}`
            : t('core.dashboard.welcome', 'Company performance for the selected period')
        }
        icon={<LayoutDashboard className="h-6 w-6 shrink-0 text-primary" />}
        headerAction={
          <Button variant="outline" size="sm" asChild>
            <Link to="/reports">
              <BarChart3 className="h-4 w-4" />
              {t('core.dashboard.fullReports', 'Full reports')}
            </Link>
          </Button>
        }
        period={period}
        onPeriodChange={setPeriod}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        periods={DASHBOARD_PERIODS}
      />

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {isError && !isLoading && (
        <Card className="shadow-none">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('reports.noFinancialData')}
          </CardContent>
        </Card>
      )}

      {!isLoading && data?.activity && (
        <DashboardActivitySection
          activity={data.activity}
          periodLabel={periodLabel}
          currency={data.currency || data.activity.currency || 'AFN'}
        />
      )}
    </div>
  );
};
