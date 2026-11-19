import DateObject from 'react-date-object';
import gregorian from 'react-date-object/calendars/gregorian';
import persian from 'react-date-object/calendars/persian';
import arabic from 'react-date-object/calendars/arabic';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import gregorian_fa from 'react-date-object/locales/gregorian_fa';
import arabic_en from 'react-date-object/locales/arabic_en';
import arabic_fa from 'react-date-object/locales/arabic_fa';
import {
  gregorian_af_fa,
  persian_af_en,
  persian_af_fa,
  persian_af_ps,
  type DateObjectLocaleShape,
} from '@/lib/calendars/afghanistanShamsiLocales';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { getCurrentLanguage, type Language } from '@/i18n';
import { getStoredCalendarSystem } from '@/contexts/CalendarPreferenceContext';

type DateObjectCalendar = typeof gregorian;

export type FormatAppDateOptions = {
  /** Display pattern for react-date-object. Default: medium list style. */
  pattern?: string;
  language?: Language;
};

/** Project-wide display format for calendar dates. */
export const APP_DATE_PATTERN = 'DD/MM/YYYY';
const SHORT_PATTERN = APP_DATE_PATTERN;
const COMPACT_PATTERN = APP_DATE_PATTERN;
const LONG_PATTERN = APP_DATE_PATTERN;

export function getDateObjectCalendar(system: CalendarSystem): DateObjectCalendar {
  switch (system) {
    case 'jalali':
      // Afghanistan Solar Hijri uses the same astronomical Solar Hijri calendar.
      return persian;
    case 'hijri':
      return arabic;
    case 'gregorian':
    default:
      return gregorian;
  }
}

/** Locales: Afghan Shamsi for jalali (not Iranian Farvardin names). */
export function getDateObjectLocale(
  system: CalendarSystem,
  language: Language = 'en',
): DateObjectLocaleShape | typeof gregorian_en {
  const useFaDigits = language === 'fa' || language === 'ps';

  switch (system) {
    case 'jalali':
      if (language === 'ps') return persian_af_ps;
      if (language === 'fa') return persian_af_fa;
      return persian_af_en;
    case 'hijri':
      return useFaDigits ? arabic_fa : arabic_en;
    case 'gregorian':
    default:
      if (language === 'fa') return gregorian_af_fa;
      return useFaDigits ? gregorian_fa : gregorian_en;
  }
}

export function parseGregorianIso(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Prefer date-only as local noon to avoid timezone day shifts.
  const dateOnly = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) && raw.length === 10) {
    const [y, m, d] = dateOnly.split('-').map(Number);
    const local = new Date(y, m - 1, d, 12, 0, 0, 0);
    return Number.isNaN(local.getTime()) || local.getFullYear() !== y || local.getMonth() !== m - 1 || local.getDate() !== d ? null : local;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toGregorianIsoDate(value: Date | DateObject | string | null | undefined): string {
  if (!value) return '';

  if (typeof value === 'string') {
    const date = parseGregorianIso(value);
    if (!date) return '';
    return formatIsoFromDate(date);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return formatIsoFromDate(value);
  }

  try {
    const gregorianDate = new DateObject(value).convert(gregorian);
    const y = gregorianDate.year;
    const m = String(gregorianDate.month.number).padStart(2, '0');
    const d = String(gregorianDate.day).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch {
    return '';
  }
}

function formatIsoFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toDateObject(
  value: string | Date | null | undefined,
  system: CalendarSystem,
  language: Language = 'en',
): DateObject | null {
  const date = parseGregorianIso(value);
  if (!date) return null;

  return new DateObject({
    date,
    calendar: getDateObjectCalendar(system),
    locale: getDateObjectLocale(system, language),
  });
}

export function formatAppDate(
  value: string | Date | null | undefined,
  system: CalendarSystem,
  options: FormatAppDateOptions = {},
): string {
  const { pattern = SHORT_PATTERN, language = 'en' } = options;
  const dateObject = toDateObject(value, system, language);
  if (!dateObject) return '—';
  try {
    return dateObject.format(pattern);
  } catch {
    return '—';
  }
}

export function formatAppDateCompact(
  value: string | Date | null | undefined,
  system: CalendarSystem,
  language: Language = 'en',
): string {
  return formatAppDate(value, system, { pattern: COMPACT_PATTERN, language });
}

export function formatAppDateTime(
  value: string | Date | null | undefined,
  system: CalendarSystem,
  language: Language = 'en',
): string {
  const date = parseGregorianIso(value);
  if (!date) return '—';
  const datePart = formatAppDate(date, system, { language });
  const timePart = date.toLocaleTimeString(language === 'fa' || language === 'ps' ? 'fa-AF' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${datePart} ${timePart}`;
}

export function formatAppDateLong(
  value: string | Date | null | undefined,
  system: CalendarSystem,
  language: Language = 'en',
): string {
  return formatAppDate(value, system, {
    language,
    pattern: LONG_PATTERN,
  });
}

export const CALENDAR_SYSTEM_OPTIONS: Array<{
  value: CalendarSystem;
  labelKey: string;
  fallback: string;
}> = [
    { value: 'gregorian', labelKey: 'settings.preferences.gregorian', fallback: 'Gregorian (میلادی)' },
    {
      value: 'jalali',
      labelKey: 'settings.preferences.jalali',
      fallback: 'Afghanistan Solar Hijri (هجری شمسی افغانی)',
    },
    { value: 'hijri', labelKey: 'settings.preferences.hijri', fallback: 'Lunar Hijri (هجری قمری)' },
  ];

/** Calendar boundaries are converted to Gregorian only at the API boundary. */
export function calendarPeriodRange(
  period: 'monthly' | 'yearly',
  system: CalendarSystem = getStoredCalendarSystem(),
  reference: string | Date = new Date(),
) {
  console.log('=== calendarPeriodRange START ===');
  console.log('Input:', { period, system, reference });

  const current = toDateObject(reference, system, 'en');
  if (!current) {
    console.log('ERROR: toDateObject returned null');
    return { dateFrom: '', dateTo: '' };
  }

  console.log('Current DateObject:', { year: current.year, month: current.month.number, day: current.day });

  // Set to first day of period
  const start = new DateObject(current).set('day', 1);
  if (period === 'yearly') {
    start.set('month', 1);
  }

  console.log('Start DateObject:', { year: start.year, month: start.month.number, day: start.day });

  // Calculate last day by going to first day of next period, then back 1 day
  const end = new DateObject(start);
  if (period === 'yearly') {
    end.add(1, 'year');
  } else {
    end.add(1, 'month');
  }
  end.subtract(1, 'day');

  console.log('End DateObject:', { year: end.year, month: end.month.number, day: end.day });

  const dateFrom = toGregorianIsoDate(start);
  const dateTo = toGregorianIsoDate(end);

  console.log('Final Gregorian result:', { dateFrom, dateTo });
  console.log('=== calendarPeriodRange END ===');

  return { dateFrom, dateTo };
}

export function formatStoredDate(value: string | Date | null | undefined, language: Language = getCurrentLanguage()) {
  return formatAppDate(value, getStoredCalendarSystem(), { language });
}

export function formatStoredDateTime(value: string | Date | null | undefined, language: Language = getCurrentLanguage()) {
  return formatAppDateTime(value, getStoredCalendarSystem(), language);
}

export const PAYROLL_MONTH_KEYS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'] as const;

export function payrollPeriodStart(month: string, year: number, system: CalendarSystem = 'gregorian') {
  const index = PAYROLL_MONTH_KEYS.indexOf(month.toLowerCase() as typeof PAYROLL_MONTH_KEYS[number]);
  if (index < 0 || !Number.isInteger(year) || year <= 0) return '';
  return toGregorianIsoDate(new DateObject({ year, month: index + 1, day: 1, calendar: getDateObjectCalendar(system), locale: getDateObjectLocale(system, 'en') }));
}

export function payrollPeriodFromDate(value: string | Date, system: CalendarSystem) {
  const date = toDateObject(value, system, 'en');
  if (!date) return null;
  return { month: PAYROLL_MONTH_KEYS[date.month.index], year: date.year, period_calendar: system };
}

export function formatPayrollPeriod(
  month: string, year: number, source: CalendarSystem = 'gregorian',
  target: CalendarSystem = getStoredCalendarSystem(), language: Language = 'en',
) {
  const start = payrollPeriodStart(month, Number(year), source);
  const date = toDateObject(start, source, 'en');
  if (!date) return '—';
  if (source === target) return formatAppDate(start, target, { pattern: 'MMMM YYYY', language });
  const end = toGregorianIsoDate(new DateObject(date).add(1, 'month').subtract(1, 'day'));
  return `${formatAppDate(start, target, { language })} – ${formatAppDate(end, target, { language })}`;
}

export function calendarMonthOptions(system: CalendarSystem, language: Language = 'en') {
  const date = new DateObject({ calendar: getDateObjectCalendar(system), locale: getDateObjectLocale(system, language) }).set('day', 1);
  return PAYROLL_MONTH_KEYS.map((value, index) => ({ value, label: new DateObject(date).set('month', index + 1).format('MMMM') }));
}
