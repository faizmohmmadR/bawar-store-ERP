import { useMemo } from 'react';
import useFetchObjects from '@/api/useFetchObjects';
import { EmployeeBalance } from '@/components/payroll/EmployeeBalance';
import { EmployeeMoney } from '@/components/payroll/EmployeeMoney';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { calendarMonthOptions } from '@/lib/calendarDate';
import { CalendarDays } from 'lucide-react';

export const ALL_MONTHS = 'all';

export type YearlyMonthRow = {
  month: string;
  year: number;
  salary: number;
  paid: number;
  paid_salary: number;
  paid_advance: number;
  balance: number;
  total_bonus?: number;
  total_overtime?: number;
  total_deductions?: number;
};

export type EmployeeYearlySummary = {
  year: number;
  period_calendar: string;
  salary_type?: string;
  currency?: {
    id: number | string;
    code: string;
    symbol?: string;
    name?: string;
  } | null;
  months: YearlyMonthRow[];
  totals: {
    salary: number;
    paid: number;
    balance: number;
    total_bonus?: number;
    total_overtime?: number;
    total_deductions?: number;
  };
};

type Props = {
  employeeId: string;
  year: number;
  onYearChange: (year: number) => void;
  yearOptions: number[];
  monthFilter?: string;
  onMonthFilterChange?: (month: string) => void;
};

export function EmployeeYearlyPayrollTable({
  employeeId,
  year,
  onYearChange,
  yearOptions,
  monthFilter = ALL_MONTHS,
  onMonthFilterChange,
}: Props) {
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();
  const monthOptions = useMemo(
    () => calendarMonthOptions(calendar, language),
    [calendar, language],
  );
  const monthLabels = useMemo(
    () => Object.fromEntries(monthOptions.map((m) => [m.value, m.label])),
    [monthOptions],
  );

  const summaryQuery = useFetchObjects<EmployeeYearlySummary>({
    queryKey: ['employee-yearly-summary', employeeId, String(year), calendar],
    endpoint: `employees/${employeeId}/yearly_summary`,
    params: { year, period_calendar: calendar },
    enabled: !!employeeId && !!year,
    options: { staleTime: 0 },
  });

  const summary = summaryQuery.data;
  const currency = summary?.currency;
  const visibleMonths = useMemo(() => {
    const rows = summary?.months || [];
    if (monthFilter === ALL_MONTHS) return rows;
    return rows.filter((row) => row.month === monthFilter);
  }, [summary?.months, monthFilter]);

  const visibleTotals = useMemo(() => {
    if (monthFilter === ALL_MONTHS || !summary) return summary?.totals;
    return visibleMonths.reduce(
      (acc, row) => ({
        salary: acc.salary + Number(row.salary || 0),
        paid: acc.paid + Number(row.paid || 0),
        balance: acc.balance + Number(row.balance || 0),
      }),
      { salary: 0, paid: 0, balance: 0 },
    );
  }, [monthFilter, summary, visibleMonths]);

  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 py-3 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {t('employees.yearlyPayroll', 'Yearly salary by month')}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('employees.filterByMonth', 'Filter by month')}</span>
          <Select
            value={monthFilter}
            onValueChange={(value) => onMonthFilterChange?.(value)}
          >
            <SelectTrigger className="h-8 w-[9rem]" aria-label={t('employees.filterByMonth', 'Filter by month')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MONTHS}>{t('common.all', 'All')}</SelectItem>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{t('employees.filterByYear')}</span>
          <Select value={String(year)} onValueChange={(value) => onYearChange(Number(value))}>
            <SelectTrigger className="h-8 w-[6.5rem]" aria-label={t('employees.filterByYear')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-3 pt-0">
        {summaryQuery.isError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 p-2.5 text-sm">
            <p>{t('employees.payrollLoadError')}</p>
            <Button variant="outline" size="sm" onClick={() => summaryQuery.refetch()}>
              {t('employees.retry')}
            </Button>
          </div>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="border-b text-start">
                <th className="px-3 py-1.5 text-start font-medium">{t('employees.month', 'Month')}</th>
                <th className="px-3 py-1.5 text-start font-medium">{t('employees.salary')}</th>
                <th className="px-3 py-1.5 text-start font-medium">{t('employees.paid', 'Paid')}</th>
                <th className="px-3 py-1.5 text-start font-medium">{t('employees.balance', 'Balance')}</th>
              </tr>
            </thead>
            <tbody>
              {summaryQuery.isLoading &&
                Array.from({ length: 4 }, (_, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="px-3 py-1.5"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-1.5"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-1.5"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-1.5"><Skeleton className="h-4 w-16" /></td>
                  </tr>
                ))}
              {!summaryQuery.isLoading &&
                visibleMonths.map((row) => (
                  <tr key={row.month} className="border-b last:border-0">
                    <td className="px-3 py-1.5 text-start font-medium">
                      {monthLabels[row.month] || row.month}
                    </td>
                    <td className="px-3 py-1.5 text-start">
                      <EmployeeMoney amount={row.salary} currency={currency} />
                    </td>
                    <td className="px-3 py-1.5 text-start">
                      <EmployeeMoney amount={row.paid} currency={currency} />
                    </td>
                    <td className="px-3 py-1.5 text-start">
                      <EmployeeBalance amount={row.balance} currency={currency} />
                    </td>
                  </tr>
                ))}
            </tbody>
            {visibleTotals && (
              <tfoot className="bg-muted/30 font-semibold">
                <tr>
                  <td className="px-3 py-2 text-start">
                    {monthFilter === ALL_MONTHS
                      ? t('employees.yearTotal', 'Year total')
                      : t('employees.monthTotal', 'Month total')}
                  </td>
                  <td className="px-3 py-2 text-start">
                    <EmployeeMoney amount={visibleTotals.salary} currency={currency} />
                  </td>
                  <td className="px-3 py-2 text-start">
                    <EmployeeMoney amount={visibleTotals.paid} currency={currency} />
                  </td>
                  <td className="px-3 py-2 text-start">
                    <EmployeeBalance amount={visibleTotals.balance} currency={currency} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t(
            'employees.balanceHint',
            'Balance = salary − paid for that month. Positive means owed to the employee; negative means overpaid.',
          )}
        </p>
      </CardContent>
    </Card>
  );
}
