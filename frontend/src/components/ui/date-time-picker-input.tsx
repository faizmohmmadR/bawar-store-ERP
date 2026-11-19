import { useMemo, type AriaAttributes } from 'react';
import DatePicker, { type DatePickerProps } from 'react-multi-date-picker';
import DateObject from 'react-date-object';
import TimePicker from 'react-multi-date-picker/plugins/time_picker';
import Toolbar from 'react-multi-date-picker/plugins/toolbar';
import type { Locale } from 'react-date-object';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import {
  APP_DATE_PATTERN,
  getDateObjectCalendar,
  getDateObjectLocale,
  toGregorianIsoDate,
} from '@/lib/calendarDate';
import { cn } from '@/lib/utils';
import '@/styles/app-date-picker.css';

type DateTimePickerInputProps = {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: AriaAttributes['aria-invalid'];
};

/** Combined date + time picker respecting the app calendar preference (gregorian / jalali / hijri). */
export function DateTimePickerInput({
  value,
  onChange,
  className,
  placeholder,
  disabled = false,
  id,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
}: DateTimePickerInputProps) {
  const { language, direction, t } = useLanguage();
  const { calendar } = useCalendarPreference();

  const dateObjectCalendar = getDateObjectCalendar(calendar);
  const locale = getDateObjectLocale(calendar, language);
  const isRtl = direction === 'rtl' || calendar === 'jalali' || calendar === 'hijri';

  const displayFormat = `${APP_DATE_PATTERN} HH:mm`;

  // Parse ISO datetime string (YYYY-MM-DDTHH:mm) into a DateObject for the picker
  const selected = useMemo(() => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return new DateObject({
      date: d,
      calendar: dateObjectCalendar,
      locale: locale as Locale,
    });
  }, [value, dateObjectCalendar, locale]);

  const displayValue = useMemo(() => {
    if (!selected) return '';
    try {
      return selected.format(displayFormat);
    } catch {
      return '';
    }
  }, [selected, displayFormat]);

  const toolbarNames = useMemo(
    () => ({
      today: t('common.today', language === 'fa' ? 'امروز' : language === 'ps' ? 'نن' : 'Today'),
      deselect: t('common.clear', language === 'fa' ? 'پاک' : language === 'ps' ? 'پاک' : 'Clear'),
      close: t('common.close', language === 'fa' ? 'بستن' : language === 'ps' ? 'بندول' : 'Close'),
    }),
    [language, t],
  );

  const handleChange: DatePickerProps['onChange'] = (date) => {
    if (!date) {
      onChange('');
      return;
    }
    const single = Array.isArray(date) ? date[0] : (date as DateObject);
    // Convert calendar date back to Gregorian ISO date, then append time
    const isoDate = toGregorianIsoDate(single);
    const h = String(single.hour ?? 0).padStart(2, '0');
    const m = String(single.minute ?? 0).padStart(2, '0');
    onChange(`${isoDate}T${h}:${m}`);
  };

  return (
    <DatePicker
      value={selected}
      onChange={handleChange}
      calendar={dateObjectCalendar}
      locale={locale as Locale}
      calendarPosition={isRtl ? 'bottom-right' : 'bottom-left'}
      editable={false}
      disabled={disabled}
      format={displayFormat}
      containerClassName="w-full"
      className="mbz-datepicker green"
      portal
      highlightToday
      monthYearSeparator=" | "
      showOtherDays
      weekStartDayIndex={calendar === 'gregorian' ? 0 : undefined}
      plugins={[
        <TimePicker key="time" position="bottom" />,
        <Toolbar
          key="toolbar"
          position="bottom"
          sort={['today', 'deselect', 'close']}
          names={toolbarNames}
        />,
      ]}
      render={(_inputValue, openCalendar) => (
        <button
          id={id}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          type="button"
          disabled={disabled}
          onClick={openCalendar}
          className={cn(
            'flex h-9 w-full items-center justify-start gap-1.5 rounded-md border border-input bg-background px-2 text-left text-sm font-normal shadow-none',
            'hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !displayValue && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate tabular-nums">{displayValue || placeholder || 'DD/MM/YYYY HH:mm'}</span>
        </button>
      )}
    />
  );
}
