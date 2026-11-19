import { DatePickerInput } from '@/components/ui/date-picker-input';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { formatPayrollPeriod, payrollPeriodFromDate, payrollPeriodStart } from '@/lib/calendarDate';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';

type PayrollPeriod = { month: string; year: number; period_calendar: CalendarSystem };

/** Keep month/year/calendar aligned with the active date preference (esp. Shamsi). */
export function normalizePayrollPeriod(
  month: string,
  year: number,
  periodCalendar: CalendarSystem,
  targetCalendar: CalendarSystem,
): PayrollPeriod | null {
  const start = payrollPeriodStart(month, year, periodCalendar);
  if (!start) return null;
  return payrollPeriodFromDate(start, targetCalendar);
}

export function PayrollPeriodInput({ month, year, period_calendar, onChange }: PayrollPeriod & { onChange: (period: PayrollPeriod) => void }) {
  const { calendar } = useCalendarPreference();
  const { language } = useLanguage();
  // Always drive the picker from the preference calendar so Shamsi month picks
  // never submit overlapping Gregorian month keys by accident.
  const display = period_calendar === calendar
    ? { month, year, period_calendar }
    : (normalizePayrollPeriod(month, year, period_calendar, calendar) || { month, year, period_calendar: calendar });

  return <div className="space-y-1">
    <DatePickerInput onlyMonthPicker value={payrollPeriodStart(display.month, display.year, calendar)} onChange={(value) => {
      const period = payrollPeriodFromDate(value, calendar);
      if (period) onChange(period);
    }} />
    {period_calendar !== calendar && <p className="text-xs text-muted-foreground">
      {formatPayrollPeriod(month, year, period_calendar, calendar, language)}
    </p>}
  </div>;
}
