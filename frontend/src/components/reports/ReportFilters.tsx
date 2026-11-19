import type { ReactNode } from 'react';
import { Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { getReportPeriodOptions } from '@/lib/reportPeriod';
import { cn } from '@/lib/utils';

interface ReportFiltersProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  headerAction?: ReactNode;
  period: string;
  onPeriodChange: (value: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  /** When set, only these period presets are shown (e.g. daily/weekly/monthly/custom). */
  periods?: string[];
  className?: string;
}

export function ReportFilters({
  title,
  subtitle,
  icon,
  headerAction,
  period,
  onPeriodChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  periods,
  className,
}: ReportFiltersProps) {
  const { t } = useLanguage();
  const periodOptions = getReportPeriodOptions(t).filter(
    (opt) => !periods?.length || periods.includes(opt.value),
  );

  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
              {icon}
              <span className="truncate">{title}</span>
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {headerAction && (
            <div className="flex shrink-0 items-center">{headerAction}</div>
          )}
        </div>

        <div className="border-t pt-4 sm:pt-5 space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4 shrink-0" />
              {t('reports.period')}
            </Label>

            <div className="relative -mx-1">
              <div
                className={cn(
                  'flex gap-1.5 overflow-x-auto px-1 pb-1',
                  'scrollbar-thin scrollbar-thumb-muted-foreground/20',
                  '[&::-webkit-scrollbar]:h-1.5',
                  '[&::-webkit-scrollbar-thumb]:rounded-full',
                  '[&::-webkit-scrollbar-thumb]:bg-muted-foreground/25',
                )}
              >
                {periodOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={period === opt.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 shrink-0 px-3 text-xs sm:text-sm sm:px-4"
                    onClick={() => onPeriodChange(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {period === 'custom' && (
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t('reports.startDate')}</Label>
                <DatePickerInput
                  value={startDate}
                  max={endDate || undefined}
                  onChange={onStartDateChange}
                  className="h-9 w-auto min-w-[9.5rem] max-w-[11rem] px-2 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t('reports.endDate')}</Label>
                <DatePickerInput
                  value={endDate}
                  min={startDate || undefined}
                  onChange={onEndDateChange}
                  className="h-9 w-auto min-w-[9.5rem] max-w-[11rem] px-2 text-sm"
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
