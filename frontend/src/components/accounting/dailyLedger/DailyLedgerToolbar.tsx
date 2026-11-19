import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpenCheck, CalendarDays, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  DAILY_LEDGER_SECTION_OPTIONS,
  type DailyLedgerPeriodMode,
} from '@/lib/dailyLedger/constants';
import { cn } from '@/lib/utils';

interface DailyLedgerToolbarProps {
  periodMode: DailyLedgerPeriodMode;
  onPeriodModeChange: (mode: DailyLedgerPeriodMode) => void;
  selectedDate: string;
  onDateChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  section: string;
  onSectionChange: (value: string) => void;
  baseCode: string;
  baseSymbol: string;
}

export function DailyLedgerToolbar({
  periodMode,
  onPeriodModeChange,
  selectedDate,
  onDateChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  section,
  onSectionChange,
  baseCode,
  baseSymbol,
}: DailyLedgerToolbarProps) {
  const { t } = useLanguage();

  return (
    <div className="no-print space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="outline" size="icon" className="shrink-0" asChild>
            <Link to="/accounting">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5">
              <BookOpenCheck className="h-6 w-6 text-primary shrink-0" />
              <h1 className="truncate text-2xl font-heading font-bold tracking-tight">
                {t('accounts.dailyLedger', 'Daily Transaction Book')}
              </h1>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t(
                'accounts.dailyLedgerDesc',
                'Business transactions for a day or date range. Native amounts plus AFN reporting equivalents.',
              )}
            </p>
          </div>
        </div>
        <Button onClick={() => window.print()} className="shrink-0 self-start">
          <Printer className="h-4 w-4" />
          {t('accounts.printDailyLedger', 'Print')}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid gap-0 lg:grid-cols-[1.2fr_1fr]">
            {/* Period */}
            <div className="space-y-3 border-b p-4 sm:p-5 lg:border-b-0 lg:border-e">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                {t('reports.period')}
              </div>

              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/70 p-1 max-w-xs">
                <button
                  type="button"
                  onClick={() => onPeriodModeChange('daily')}
                  className={cn(
                    'h-9 rounded-md text-xs font-medium transition-colors',
                    periodMode === 'daily'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('accounts.periodDaily', 'Daily')}
                </button>
                <button
                  type="button"
                  onClick={() => onPeriodModeChange('range')}
                  className={cn(
                    'h-9 rounded-md text-xs font-medium transition-colors',
                    periodMode === 'range'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('accounts.periodRange', 'Date range')}
                </button>
              </div>

              {periodMode === 'daily' ? (
                <div className="max-w-xs space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t('accounts.selectDay', 'Day')}
                  </Label>
                  <DatePickerInput
                    value={selectedDate}
                    onChange={onDateChange}
                    className="h-9"
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('reports.startDate')}
                    </Label>
                    <DatePickerInput
                      value={startDate}
                      onChange={onStartDateChange}
                      className="h-9 w-[10.5rem]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t('reports.endDate')}
                    </Label>
                    <DatePickerInput
                      value={endDate}
                      onChange={onEndDateChange}
                      className="h-9 w-[10.5rem]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Type + reporting currency */}
            <div className="flex flex-col justify-between gap-4 p-4 sm:p-5">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t('reports.type', 'Type')}
                  </Label>
                  <Select value={section} onValueChange={onSectionChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAILY_LEDGER_SECTION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {t(opt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t(
                    'accounts.dailyLedgerFilterHint',
                    'Filter by day (default) or a custom range. AFN column is reporting equivalent, not Cash AFN.',
                  )}
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('accounts.reportingCurrency', 'Reporting currency')}:{' '}
                <span className="font-medium text-foreground">
                  {baseCode} ({baseSymbol})
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
