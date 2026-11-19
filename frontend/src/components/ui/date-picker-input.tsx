import { useMemo, type AriaAttributes } from 'react';
import DatePicker, { type DatePickerProps } from 'react-multi-date-picker';
import Toolbar from 'react-multi-date-picker/plugins/toolbar';
import type DateObject from 'react-date-object';
import type { Locale } from 'react-date-object';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import {
  APP_DATE_PATTERN,
  getDateObjectCalendar,
  getDateObjectLocale,
  parseGregorianIso,
  toGregorianIsoDate,
} from '@/lib/calendarDate';
import { cn } from '@/lib/utils';
import '@/styles/app-date-picker.css';

type DatePickerInputProps = {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  onlyMonthPicker?: boolean;
  min?: string;
  max?: string;
  id?: string;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: AriaAttributes['aria-invalid'];
};

export function DatePickerInput({
  value,
  onChange,
  className,
  placeholder = 'dd/mm/yyyy',
  disabled = false,
  onlyMonthPicker = false,
  min,
  max,
  id,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
}: DatePickerInputProps) {
  const { language, direction, t } = useLanguage();
  const { calendar } = useCalendarPreference();

  const dateObjectCalendar = getDateObjectCalendar(calendar);
  const locale = getDateObjectLocale(calendar, language);
  const selected = parseGregorianIso(value);
  const isRtl = direction === 'rtl' || calendar === 'jalali' || calendar === 'hijri';

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
    const single = Array.isArray(date) ? date[0] : date;
    onChange(toGregorianIsoDate(single as DateObject));
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
      format={onlyMonthPicker ? 'MMMM YYYY' : APP_DATE_PATTERN}
      onlyMonthPicker={onlyMonthPicker}
      minDate={parseGregorianIso(min) ?? undefined}
      maxDate={parseGregorianIso(max) ?? undefined}
      containerClassName="w-full"
      className="mbz-datepicker green"
      portal
      highlightToday
      monthYearSeparator=" | "
      showOtherDays
      weekStartDayIndex={calendar === 'gregorian' ? 0 : undefined}
      plugins={[
        <Toolbar
          key="toolbar"
          position="bottom"
          sort={['today', 'deselect', 'close']}
          names={toolbarNames}
        />,
      ]}
      placeholder={placeholder}
      render={(inputValue, openCalendar) => (
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
            !inputValue && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate tabular-nums">{inputValue || placeholder}</span>
        </button>
      )}
    />
  );
}
