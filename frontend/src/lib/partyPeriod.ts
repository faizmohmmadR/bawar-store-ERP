import { getStoredCalendarSystem, type CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { calendarPeriodRange } from '@/lib/calendarDate';
/** Period presets for customer / vendor finance filters. */

export type PartyPeriod = 'all' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export function formatPartyDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Resolve a period preset into API `date_from` / `date_to` (YYYY-MM-DD). */
export function resolvePartyPeriodRange(
  period: PartyPeriod,
  customFrom = '',
  customTo = '',
  calendar: CalendarSystem = getStoredCalendarSystem(),
): { dateFrom: string; dateTo: string } {
  console.log('resolvePartyPeriodRange called with period:', period);

  if (period === 'all') {
    return { dateFrom: '', dateTo: '' };
  }

  if (period === 'custom') {
    return { dateFrom: customFrom || '', dateTo: customTo || '' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatPartyDate(today);

  if (period === 'daily') {
    const result = { dateFrom: todayStr, dateTo: todayStr };
    console.log('Daily result:', result);
    return result;
  }

  if (period === 'weekly') {
    // Monday-start week (matches Python datetime.weekday()).
    const start = new Date(today);
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    const result = { dateFrom: formatPartyDate(start), dateTo: todayStr };
    console.log('Weekly result:', result);
    return result;
  }

  if (period === 'monthly' || period === 'yearly') {
    console.log('Calling calendarPeriodRange for:', period);
    const result = calendarPeriodRange(period, calendar);
    console.log('Monthly/Yearly result:', result);
    return result;
  }

  return { dateFrom: '', dateTo: '' };
}

export function getPartyPeriodOptions(
  t: (key: string, fallback?: string) => string,
): { value: PartyPeriod; label: string }[] {
  return [
    { value: 'all', label: t('reports.allTime', 'All time') },
    { value: 'daily', label: t('reports.today', 'Today') },
    { value: 'weekly', label: t('reports.thisWeek', 'This Week') },
    { value: 'monthly', label: t('reports.thisMonth', 'This Month') },
    { value: 'yearly', label: t('reports.thisYear', 'This Year') },
    { value: 'custom', label: t('reports.customRange', 'Custom Range') },
  ];
}

export function partyPeriodLabel(
  period: PartyPeriod,
  t: (key: string, fallback?: string) => string,
): string {
  return getPartyPeriodOptions(t).find((opt) => opt.value === period)?.label || period;
}
