export type ReportMetricKey =
  | 'total_income'
  | 'total_expenses'
  | 'net_profit'
  | 'gross_profit'
  | 'cash_balance'
  | 'accounts_receivable'
  | 'accounts_payable'
  | 'net_cash_flow'
  | 'loans_receivable'
  | 'loans_payable'
  | 'loans_given'
  | 'loans_received';

export interface ReportNavQuery {
  startDate?: string;
  endDate?: string;
  currency?: string;
}

export function formatReportDateParam(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.split('T')[0] || value;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildReportHistoryPath(params: {
  metric?: ReportMetricKey | string;
  breakdown?: string;
  section?: string;
  startDate?: string;
  endDate?: string;
  currency?: string;
}): string {
  const search = new URLSearchParams();
  if (params.metric) search.set('metric', params.metric);
  if (params.breakdown) search.set('breakdown', params.breakdown);
  if (params.section) search.set('section', params.section);
  if (params.startDate) search.set('start_date', params.startDate);
  if (params.endDate) search.set('end_date', params.endDate);
  if (params.currency) search.set('currency', params.currency);
  const qs = search.toString();
  return `/reports/history${qs ? `?${qs}` : ''}`;
}

export function getMetricNavigation(metric: ReportMetricKey) {
  return { metric };
}

export function getBreakdownNavigation(label: string) {
  return { breakdown: label };
}
