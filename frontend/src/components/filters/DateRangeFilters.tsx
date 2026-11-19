import { DatePickerInput } from '@/components/ui/date-picker-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CustomFilter } from '@/components/ui/data-table';
import {
  type PartyPeriod,
  getPartyPeriodOptions,
} from '@/lib/partyPeriod';

type PartyPeriodFiltersOptions = {
  period: PartyPeriod;
  onPeriodChange: (value: PartyPeriod) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
};

/** Period + optional custom From/To pickers for list DataTable customFilters. */
export function usePartyPeriodCustomFilters({
  period,
  onPeriodChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: PartyPeriodFiltersOptions): CustomFilter[] {
  const { t } = useLanguage();
  const periodOptions = getPartyPeriodOptions(t);

  const filters: CustomFilter[] = [
    {
      key: 'period',
      label: t('reports.period', 'Period'),
      width: 'sm:w-44',
      component: (
        <Select
          value={period}
          onValueChange={(value) => onPeriodChange(value as PartyPeriod)}
        >
          <SelectTrigger className="h-9 w-full border border-border/70 bg-background text-sm shadow-none focus:ring-primary/30">
            <SelectValue placeholder={t('reports.period', 'Period')} />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];

  if (period === 'custom') {
    filters.push(
      {
        key: 'dateFrom',
        label: t('common.dateFrom'),
        width: 'sm:w-44',
        component: (
          <DatePickerInput
            value={dateFrom}
            onChange={onDateFromChange}
            placeholder={t('common.dateFrom')}
          />
        ),
      },
      {
        key: 'dateTo',
        label: t('common.dateTo'),
        width: 'sm:w-44',
        component: (
          <DatePickerInput
            value={dateTo}
            onChange={onDateToChange}
            placeholder={t('common.dateTo')}
          />
        ),
      },
    );
  }

  return filters;
}

/** @deprecated Prefer usePartyPeriodCustomFilters */
export function useDateRangeCustomFilters({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
}): CustomFilter[] {
  return usePartyPeriodCustomFilters({
    period: 'custom',
    onPeriodChange: () => undefined,
    dateFrom,
    dateTo,
    onDateFromChange,
    onDateToChange,
  });
}
