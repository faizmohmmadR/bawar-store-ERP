import { getStoredCalendarSystem } from '@/contexts/CalendarPreferenceContext';
import type { Language } from '@/i18n';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { formatAppDateLong } from '@/lib/calendarDate';

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDailyLedgerDisplayDate(
  iso: string,
  language: Language | string,
  calendar: CalendarSystem = getStoredCalendarSystem(),
): string {
  return formatAppDateLong(iso, calendar, (language as Language) || 'en');
}

export function formatDailyLedgerPeriodLabel(
  startIso: string,
  endIso: string,
  language: Language | string,
  calendar: CalendarSystem = getStoredCalendarSystem(),
): string {
  const start = formatDailyLedgerDisplayDate(startIso, language, calendar);
  if (!endIso || endIso === startIso) return start;
  const end = formatDailyLedgerDisplayDate(endIso, language, calendar);
  return `${start} — ${end}`;
}

export function formatLedgerAmount(value: number, currency?: string): string {
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}
