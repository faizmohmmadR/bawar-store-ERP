import { useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import {
  formatAppDate,
  formatAppDateLong,
  formatAppDateTime,
  type FormatAppDateOptions,
} from '@/lib/calendarDate';

/** Hook for formatting dates with the active calendar preference. */
export function useFormatAppDate() {
  const { language } = useLanguage();
  const { calendar } = useCalendarPreference();

  const formatDate = useCallback(
    (value: string | Date | null | undefined, options?: Omit<FormatAppDateOptions, 'language'>) =>
      formatAppDate(value, calendar, { language, ...options }),
    [calendar, language],
  );

  const formatDateTime = useCallback(
    (value: string | Date | null | undefined) => formatAppDateTime(value, calendar, language),
    [calendar, language],
  );

  const formatDateLong = useCallback(
    (value: string | Date | null | undefined) => formatAppDateLong(value, calendar, language),
    [calendar, language],
  );

  return { calendar, language, formatDate, formatDateTime, formatDateLong };
}
