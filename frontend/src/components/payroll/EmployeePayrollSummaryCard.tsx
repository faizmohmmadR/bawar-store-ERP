import { formatPayrollPeriod } from '@/lib/calendarDate';
import { useCalendarPreference, type CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CurrencyDetails } from '@/lib/currencies';

export type EmployeeFinancialSummary = {
  salary: number;
  monthly_salary?: number;
  salary_type?: 'monthly' | 'daily' | 'other' | string;
  paid_salary: number;
  paid_advance: number;
  total_paid: number;
  salary_remaining?: number;
  total_remaining: number;
  balance?: number;
  net_salary?: number;
  elapsed_months?: number;
  elapsed_days?: number | null;
  daily_rate?: number | null;
  accrued_salary?: number | null;
  lifetime_paid?: number;
  lifetime_remaining?: number | null;
  accrual_available?: boolean;
  total_overtime?: number;
  total_absence_deductions?: number;
  total_food_deductions?: number;
  total_bonus?: number;
  total_deductions?: number;
  absence_days?: number;
  overtime_count?: number;
  absence_count?: number;
  currency?: CurrencyDetails | null;
  month?: string | null;
  year?: number | null;
  period_calendar?: CalendarSystem;
};

type Props = {
  summary: EmployeeFinancialSummary;
  cumulative?: boolean;
};

export function EmployeePayrollSummaryCard({ summary, cumulative = false }: Props) {
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();
  const currency = summary.currency;
  const salaryType = summary.salary_type || 'monthly';

  const salaryLabel =
    salaryType === 'daily'
      ? t('employees.dailyRate', 'Daily rate')
      : salaryType === 'other'
        ? t('employees.agreedAmount', 'Agreed amount')
        : t('employees.monthlySalary', 'Monthly salary');

  const items = [
    ...(cumulative && summary.accrual_available ? [{
      key: 'accrued', label: t('employees.accruedSalary'), amount: summary.accrued_salary || 0,
      className: 'bg-primary/10', valueClassName: 'text-primary',
    }] : []),
    {
      key: 'salary',
      label: salaryLabel,
      amount: (summary.monthly_salary ?? summary.salary) || 0,
      className: 'bg-primary/10',
      valueClassName: 'text-primary',
    },
    {
      key: 'overtime',
      label: t('employees.entryTypeOvertime', 'Overtime'),
      amount: summary.total_overtime || 0,
      className: 'bg-primary/10',
      valueClassName: 'text-primary',
    },
    {
      key: 'absence',
      label: t('employees.deductionTypeAbsence', 'Absence'),
      amount: summary.total_absence_deductions || 0,
      className: 'bg-muted/60',
      valueClassName: 'text-foreground',
    },
    {
      key: 'food',
      label: t('employees.deductionTypeFood', 'Food'),
      amount: summary.total_food_deductions || 0,
      className: 'bg-muted/60',
      valueClassName: 'text-foreground',
    },
    {
      key: 'net',
      label: t('employees.netSalary', 'Net salary'),
      amount: (summary.net_salary ?? summary.salary) || 0,
      className: 'bg-primary/10',
      valueClassName: 'text-primary',
    },
    {
      key: 'total_paid',
      label: t('employees.totalPaid', 'Total paid'),
      amount: (cumulative ? summary.lifetime_paid : summary.total_paid) || 0,
      className: 'bg-muted/60',
      valueClassName: 'text-foreground',
    },
    ...((cumulative ? summary.accrual_available : true)
      ? [
          {
            key: 'balance',
            label: t('employees.balance', 'Balance'),
            amount: (cumulative
              ? summary.lifetime_remaining
              : (summary.balance ?? summary.total_remaining)) || 0,
            className: 'bg-accent/10',
            valueClassName: 'text-accent',
          },
        ]
      : []),
  ];

  const hint =
    salaryType === 'daily'
      ? t(
          'employees.financialSummaryHintDaily',
          'Daily employees: enter days worked; amount = daily rate × days.',
        )
      : salaryType === 'other'
        ? t(
            'employees.financialSummaryHintOther',
            'Other pay type: enter the agreed amount for this payroll.',
          )
        : t(
            'employees.financialSummaryHint',
            'Net salary = monthly salary + overtime − absence − food. Balance = net − paid (including advances).',
          );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <User className="h-5 w-5" />
          {t('employees.financialSummary', 'Financial Summary')}
          {summary.month || summary.year ? (
            <span className="text-sm font-normal text-muted-foreground">
              ({summary.month && summary.year ? formatPayrollPeriod(summary.month, summary.year, summary.period_calendar || 'gregorian', calendar, language) : '—'})
            </span>
          ) : null}
          <span className="text-xs font-normal text-muted-foreground capitalize">
            · {salaryType}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {items.map((item) => (
            <div key={item.key} className={`text-center p-3 rounded-lg ${item.className}`}>
              <div className="text-sm text-muted-foreground">{item.label}</div>
              <CurrencyAmount
                amount={item.amount}
                currency={currency}
                className={`text-lg font-semibold ${item.valueClassName}`}
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{cumulative ? t('employees.accrualHint') : hint}</p>
        {cumulative && !summary.accrual_available && <p className="mt-2 text-xs text-muted-foreground">{t('employees.accrualUnavailable')}</p>}
      </CardContent>
    </Card>
  );
}
