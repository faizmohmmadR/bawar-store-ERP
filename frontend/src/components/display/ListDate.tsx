import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { formatAppDate } from '@/lib/calendarDate';
import { listDateClass } from '@/lib/listTableFormat';

export function ListDate({ value }: { value: string | Date | null | undefined }) {
  const { language } = useLanguage();
  const { calendar } = useCalendarPreference();
  return (
    <span className={listDateClass}>
      {formatAppDate(value, calendar, { language })}
    </span>
  );
}
