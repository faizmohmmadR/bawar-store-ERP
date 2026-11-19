import { Button } from '@/components/ui/button';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  type PartyPeriod,
  getPartyPeriodOptions,
  partyPeriodLabel,
} from '@/lib/partyPeriod';
import { cn } from '@/lib/utils';

type DetailDateRangeBarProps = {
  period: PartyPeriod;
  onPeriodChange: (value: PartyPeriod) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onClear?: () => void;
};

export function DetailDateRangeBar({
  period,
  onPeriodChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClear,
}: DetailDateRangeBarProps) {
  const { t } = useLanguage();
  const periodOptions = getPartyPeriodOptions(t);
  const showCustom = period === 'custom';
  const showClear = period !== 'all' || Boolean(dateFrom || dateTo);

  return (
    <div className="space-y-3 pt-2 border-t">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">
          {t('reports.period', 'Period')}
        </label>
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

      {showCustom && (
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[180px] max-w-[240px] flex-1">
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              {t('common.dateFrom')}
            </label>
            <DatePickerInput
              value={dateFrom}
              onChange={onDateFromChange}
              placeholder={t('common.dateFrom')}
            />
          </div>
          <div className="min-w-[180px] max-w-[240px] flex-1">
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              {t('common.dateTo')}
            </label>
            <DatePickerInput
              value={dateTo}
              onChange={onDateToChange}
              placeholder={t('common.dateTo')}
            />
          </div>
        </div>
      )}

      {period !== 'all' && period !== 'custom' && (
        <p className="text-xs text-muted-foreground">
          {partyPeriodLabel(period, t)}
          {dateFrom || dateTo
            ? `: ${dateFrom || '…'} → ${dateTo || '…'}`
            : ''}
        </p>
      )}

      {showClear && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (onClear) {
                onClear();
                return;
              }
              onPeriodChange('all');
              onDateFromChange('');
              onDateToChange('');
            }}
            className="h-9"
          >
            {t('common.clear')}
          </Button>
        </div>
      )}
    </div>
  );
}
