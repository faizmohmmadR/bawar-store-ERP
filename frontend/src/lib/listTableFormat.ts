import { formatDecimalDisplay } from './decimalDisplay';
import { getStoredCalendarSystem } from '@/contexts/CalendarPreferenceContext';
import type { Language } from '@/i18n';
import { getFinanceCurrencyCodes } from '@/lib/finance';
import { formatAppDate, type FormatAppDateOptions } from '@/lib/calendarDate';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';

export const listDateClass = 'text-xs text-muted-foreground whitespace-nowrap';
export const listTextClass = 'text-sm whitespace-nowrap';
export const listAmountClass = 'text-sm font-semibold tabular-nums whitespace-nowrap';
export const listBadgeClass = 'text-[11px] px-1.5 py-0 h-5 font-normal';

export function formatListDate(
  value: string | Date | null | undefined,
  language: Language = 'en',
  calendar: CalendarSystem = getStoredCalendarSystem(),
  options?: Omit<FormatAppDateOptions, 'language'>,
): string {
  return formatAppDate(value, calendar, { language, ...options });
}

export function formatListContactLine(primary: string, secondary?: string | null): string {
  if (!secondary) return primary;
  return `${primary} · ${secondary}`;
}

type FinanceBucket = {
  total_debit: number;
  total_credit: number;
  balance: number;
  currency?: string;
};

export function formatListFinanceLine(
  finance: Record<string, FinanceBucket> | null | undefined,
  field: 'total_debit' | 'total_credit' | 'balance',
): string {
  if (!finance) return '—';

  const overall = finance.overall;
  if (overall) {
    const currency = (overall.currency || 'AFN').toUpperCase();
    return `${formatDecimalDisplay(overall[field], 2)} ${currency}`;
  }

  const codes = getFinanceCurrencyCodes(finance);
  if (codes.length === 0) return '—';
  return codes
    .map((code) => {
      const bucket = finance[code] || finance[code.toLowerCase()] || finance[code.toUpperCase()];
      if (!bucket) return null;
      const currency = (bucket.currency || code).toUpperCase();
      return `${formatDecimalDisplay(bucket[field], 2)} ${currency}`;
    })
    .filter(Boolean)
    .join(', ');
}
