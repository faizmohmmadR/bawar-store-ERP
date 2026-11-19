import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatReportDateParam } from '@/lib/reportPeriod';
import {
  buildReportHistoryPath,
  getBreakdownNavigation,
  getMetricNavigation,
  type ReportMetricKey,
  type ReportNavQuery,
} from '@/lib/reportNavigation';

export function useReportNavigation(reportQuery?: ReportNavQuery) {
  const navigate = useNavigate();

  const query = useMemo(
    () => ({
      startDate: formatReportDateParam(reportQuery?.startDate),
      endDate: formatReportDateParam(reportQuery?.endDate),
      currency: reportQuery?.currency,
    }),
    [reportQuery?.currency, reportQuery?.endDate, reportQuery?.startDate],
  );

  const navigateToHistory = useCallback(
    (params: { metric?: string; breakdown?: string; section?: string; currency?: string }) => {
      navigate(
        buildReportHistoryPath({
          ...params,
          startDate: query.startDate,
          endDate: query.endDate,
          currency: params.currency || query.currency,
        }),
      );
    },
    [navigate, query],
  );

  const navigateMetric = useCallback(
    (metric: ReportMetricKey, currencyCode?: string) => {
      const target = getMetricNavigation(metric);
      navigateToHistory({ metric: target.metric, currency: currencyCode });
    },
    [navigateToHistory],
  );

  const navigateBreakdown = useCallback(
    (label: string, currencyCode?: string) => {
      const target = getBreakdownNavigation(label);
      navigateToHistory({ breakdown: target.breakdown, currency: currencyCode });
    },
    [navigateToHistory],
  );

  return {
    navigateMetric,
    navigateBreakdown,
    navigateToHistory,
  };
}
