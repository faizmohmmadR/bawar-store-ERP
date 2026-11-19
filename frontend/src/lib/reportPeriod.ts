import { getStoredCalendarSystem, type CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { calendarPeriodRange } from '@/lib/calendarDate';
/** Build query params for GL accounting reports. */
export function buildGlReportParams(
  period: string,
  startDate: string,
  endDate: string,
  fiscalYearId?: string,
  currencyId?: string,
  mode?: string,
  calendar: CalendarSystem = getStoredCalendarSystem(),
): Record<string, string> {
  let filters: Record<string, string>;
  if (fiscalYearId) {
    filters = { fiscal_year_id: fiscalYearId };
  } else if (period === 'custom') {
    filters = { period: 'custom' };
    if (startDate) filters.start_date = startDate;
    if (endDate) filters.end_date = endDate;
  } else if (period === 'all') {
    filters = { period: 'all' };
  } else if (period === 'fiscal_year') {
    filters = { period: 'fiscal_year' };
  } else if (period === 'monthly' || period === 'yearly') {
    const range = calendarPeriodRange(period, calendar);
    filters = { period: 'custom', start_date: range.dateFrom, end_date: range.dateTo };
  } else {
    filters = { period };
  }
  if (currencyId) {
    filters.currency = currencyId;
  }
  if (mode) {
    filters.mode = mode;
  }
  return filters;
}

/** All report period presets (matches backend resolve_report_period). */
export function getReportPeriodOptions(t: (key: string) => string) {
  return [
    { value: 'daily', label: t('reports.today') },
    { value: 'weekly', label: t('reports.thisWeek') },
    { value: 'monthly', label: t('reports.thisMonth') },
    { value: 'yearly', label: t('reports.thisYear') },
    { value: 'fiscal_year', label: t('accounts.fiscalYearCurrentPeriod') },
    { value: 'all', label: t('accounts.allTime') },
    { value: 'custom', label: t('reports.customRange') },
  ];
}

/** @deprecated Use getReportPeriodOptions — kept for any external imports */
export function getReportExtraPeriodOptions(t: (key: string) => string) {
  return getReportPeriodOptions(t).filter((opt) =>
    ['fiscal_year', 'all'].includes(opt.value),
  );
}

/** Build query params for operational financial reports API. */
export function buildFinancialReportParams(
  period: string,
  startDate: string,
  endDate: string,
  defaultPeriod: string,
  calendar: CalendarSystem = getStoredCalendarSystem(),
): Record<string, string> {
  const resolvedPeriod = period || defaultPeriod;
  return buildGlReportParams(resolvedPeriod, startDate, endDate, undefined, undefined, undefined, calendar);
}

/** Normalize API/datetime values to YYYY-MM-DD for report history links. */
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
