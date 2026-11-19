import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  useCalendarPreference,
  type CalendarSystem,
} from '@/contexts/CalendarPreferenceContext';
import { CALENDAR_SYSTEM_OPTIONS, formatAppDate } from '@/lib/calendarDate';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { useState } from 'react';

export function PreferencesSettings() {
  const { t, language } = useLanguage();
  const { calendar, setCalendar } = useCalendarPreference();
  const [sampleDate, setSampleDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const todayPreview = formatAppDate(new Date(), calendar, { language });

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-6 px-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
          <CalendarDays className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">
            {t('settings.preferences.title', 'Preferences')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'settings.preferences.description',
              'Choose how dates are shown and picked across the system. The server always uses Gregorian dates.',
            )}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t('settings.preferences.calendarTitle', 'Calendar format')}
          </CardTitle>
          <CardDescription>
            {t(
              'settings.preferences.calendarHint',
              'This affects date display and date pickers on all pages. API values remain Gregorian (yyyy-mm-dd).',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={calendar}
            onValueChange={(value) => setCalendar(value as CalendarSystem)}
            className="space-y-3"
          >
            {CALENDAR_SYSTEM_OPTIONS.map((option) => (
              <label
                key={option.value}
                htmlFor={`calendar-${option.value}`}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem
                  value={option.value}
                  id={`calendar-${option.value}`}
                  className="mt-0.5"
                />
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium">
                    {t(option.labelKey, option.fallback)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {option.value === 'gregorian' &&
                      t(
                        'settings.preferences.gregorianHint',
                        'Western calendar used by the database and APIs.',
                      )}
                    {option.value === 'jalali' &&
                      t(
                        'settings.preferences.jalaliHint',
                        'Solar Hijri calendar (Afghanistan / Iran).',
                      )}
                    {option.value === 'hijri' &&
                      t(
                        'settings.preferences.hijriHint',
                        'Lunar Hijri calendar (Islamic).',
                      )}
                  </p>
                </div>
              </label>
            ))}
          </RadioGroup>

          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('settings.preferences.todayPreview', 'Today preview')}
              </Label>
              <p className="mt-1 text-lg font-semibold tabular-nums">{todayPreview}</p>
            </div>

            <div className="space-y-2 max-w-xs">
              <Label className="text-sm">
                {t('settings.preferences.tryPicker', 'Try the calendar')}
              </Label>
              <DatePickerInput
                value={sampleDate}
                onChange={setSampleDate}
                placeholder={t('settings.preferences.pickDate', 'Pick a date')}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.preferences.apiValue', 'Stored / API value')}:{' '}
                <span className="font-mono tabular-nums">{sampleDate || '—'}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default PreferencesSettings;
