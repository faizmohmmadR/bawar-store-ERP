import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, ExternalLink, Plus, UserRound } from 'lucide-react';
import useFetchObjects from '@/api/useFetchObjects';
import { EmployeeBalance } from '@/components/payroll/EmployeeBalance';
import { EmployeeMoney } from '@/components/payroll/EmployeeMoney';
import { EmployeePayrollHistory } from '@/components/payroll/EmployeePayrollHistory';
import type { EmployeeFinancialSummary } from '@/components/payroll/EmployeePayrollSummaryCard';
import { EmployeePayEntriesPanel } from '@/components/payroll/EmployeePayEntriesPanel';
import {
  ALL_MONTHS,
  EmployeeYearlyPayrollTable,
} from '@/components/payroll/EmployeeYearlyPayrollTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import { formatPayrollPeriod, payrollPeriodFromDate } from '@/lib/calendarDate';
import type { Employee } from '@/types/employee';
import { CreateEmployeeAccountDialog } from './CreateEmployeeAccountDialog';

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium text-start">{children || '—'}</dd>
    </div>
  );
}

export default function EmployeeDetails() {
  const { t, language } = useLanguage();
  const { formatDate } = useFormatAppDate();
  const { calendar } = useCalendarPreference();
  const { canEdit, canAdd, hasAnyPermission } = usePermissions();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);

  const currentPeriod = useMemo(
    () => payrollPeriodFromDate(new Date(), calendar) || {
      month: 'january',
      year: new Date().getFullYear(),
      period_calendar: calendar,
    },
    [calendar],
  );
  const [selectedYear, setSelectedYear] = useState(currentPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(ALL_MONTHS);

  useEffect(() => {
    setSelectedYear(currentPeriod.year);
    setSelectedMonth(ALL_MONTHS);
  }, [calendar, currentPeriod.year]);

  const yearOptions = useMemo(() => {
    const current = currentPeriod.year;
    const years = new Set<number>([selectedYear, current]);
    for (let offset = 0; offset <= 6; offset += 1) {
      years.add(current - offset);
      years.add(current + offset);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [currentPeriod.year, selectedYear]);

  const activePeriod = useMemo(() => ({
    month: selectedMonth === ALL_MONTHS ? currentPeriod.month : selectedMonth,
    year: selectedYear,
    period_calendar: calendar,
  }), [calendar, currentPeriod.month, selectedMonth, selectedYear]);

  const employeeQuery = useFetchObjects<Employee>({
    queryKey: ['employee', id], endpoint: `employees/${id}`, enabled: !!id,
    options: { staleTime: 0 },
  });
  const summaryQuery = useFetchObjects<EmployeeFinancialSummary>({
    queryKey: [
      'employee-financial-summary',
      id,
      activePeriod.month,
      String(activePeriod.year),
      activePeriod.period_calendar,
    ],
    endpoint: `employees/${id}/financial_summary`,
    params: {
      month: activePeriod.month,
      year: activePeriod.year,
      period_calendar: activePeriod.period_calendar,
    },
    enabled: !!id,
    options: { staleTime: 0 },
  });

  if (employeeQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5" role="status" aria-busy="true">
        <span className="sr-only">{t('employees.loadingEmployees')}</span>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16" />)}
        </div>
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const employee = employeeQuery.data;
  if (!employee || employeeQuery.isError) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-5">
        <Button variant="ghost" asChild>
          <Link to="/employees"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t('employees.title')}</Link>
        </Button>
        <Card>
          <CardContent className="space-y-3 p-4" role="alert">
            <p>{employeeQuery.error?.response?.status === 404 ? t('employees.employeeNotFound') : t('employees.errorLoadingEmployees')}</p>
            <Button variant="outline" onClick={() => employeeQuery.refetch()}>{t('employees.retry')}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = summaryQuery.data;
  const currency = summary?.currency || (employee.currency_details ? {
    ...employee.currency_details, id: Number(employee.currency_details.id),
  } : undefined);
  const salaryType = employee.salary_type || 'monthly';
  const salaryLabel = salaryType === 'daily' ? t('employees.dailyRate')
    : salaryType === 'other' ? t('employees.agreedAmount') : t('employees.monthlySalary');
  const initials = employee.full_name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] || '').join('').toUpperCase();
  const currentBalance = summary?.balance ?? summary?.total_remaining ?? null;
  const periodLabel = formatPayrollPeriod(
    activePeriod.month,
    activePeriod.year,
    activePeriod.period_calendar,
    calendar,
    language,
  );
  const metrics = [
    { key: 'salary', label: salaryLabel, amount: summary?.monthly_salary ?? summary?.salary ?? employee.salary, kind: 'money' as const },
    {
      key: 'overtime',
      label: t('employees.entryTypeOvertime', 'Overtime'),
      amount: summary?.total_overtime ?? 0,
      kind: 'money' as const,
    },
    {
      key: 'absence',
      label: t('employees.deductionTypeAbsence', 'Absence'),
      amount: summary?.total_absence_deductions ?? 0,
      kind: 'money' as const,
    },
    {
      key: 'food',
      label: t('employees.deductionTypeFood', 'Food'),
      amount: summary?.total_food_deductions ?? 0,
      kind: 'money' as const,
    },
    { key: 'net', label: t('employees.netSalary', 'Net salary'), amount: summary?.net_salary ?? currentBalance, kind: 'money' as const },
    { key: 'paid', label: t('employees.paid', 'Paid'), amount: summary?.total_paid ?? 0, kind: 'money' as const },
    { key: 'balance', label: t('employees.balance', 'Balance'), amount: currentBalance, kind: 'balance' as const },
    { key: 'period', label: t('employees.currentPeriod', 'Current period'), amount: null, kind: 'text' as const, text: periodLabel },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-5">
      <nav aria-label={t('employees.employeeDetails')} className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/employees" className="inline-flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t('employees.title')}
        </Link>
        <span aria-hidden="true">/</span>
        <span>{t('employees.employeeDetails')}</span>
      </nav>

      <div className="flex flex-col justify-between gap-3 border-b pb-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary" aria-hidden="true">
            {initials || <UserRound className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-xl font-semibold tracking-tight">{employee.full_name}</h1>
              <Badge variant={employee.is_active ? 'default' : 'secondary'}>
                {employee.is_active ? t('employees.active') : t('employees.inactive')}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(`employees.salaryType${salaryType === 'daily' ? 'Daily' : salaryType === 'other' ? 'Other' : 'Monthly'}`)}
              {employee.date_joined && <> · {t('employees.dateJoined')}: {formatDate(employee.date_joined)}</>}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canEdit('employees') && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/employees/${id}/edit`}><Edit className="h-4 w-4" />{t('employees.editEmployee')}</Link>
            </Button>
          )}
          {canAdd('payroll') && (
            <Button size="sm" asChild>
              <Link to={`/payroll/add?employee=${encodeURIComponent(id!)}`}><Plus className="h-4 w-4" />{t('payroll.addPayroll')}</Link>
            </Button>
          )}
        </div>
      </div>

      <section aria-label={t('employees.financialSummary')} className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.key} className={metric.kind === 'balance' ? 'border-primary/30 bg-primary/5 shadow-none' : 'shadow-none'}>
            <CardContent className="space-y-1 p-3">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              {summaryQuery.isLoading ? (
                <Skeleton className="h-6 w-24 max-w-full" />
              ) : metric.kind === 'text' ? (
                <p className="text-sm font-semibold capitalize leading-snug">{metric.text}</p>
              ) : metric.amount == null ? (
                <p className="text-lg font-semibold text-muted-foreground">—</p>
              ) : metric.kind === 'balance' ? (
                <EmployeeBalance amount={metric.amount} currency={currency} className="text-base font-semibold" />
              ) : (
                <EmployeeMoney amount={metric.amount} currency={currency} className="text-base font-semibold" />
              )}
            </CardContent>
          </Card>
        ))}
      </section>
      <p className="text-xs text-muted-foreground">
        {t(
          'employees.netSalaryFormula',
          'Net salary = monthly salary + overtime − absence − food. Balance = net salary − paid.',
        )}
      </p>

      {summaryQuery.isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 p-3 text-sm">
          <p>{t('employees.payrollLoadError')}</p>
          <Button variant="outline" size="sm" onClick={() => summaryQuery.refetch()}>{t('employees.retry')}</Button>
        </div>
      )}

      <EmployeePayEntriesPanel
        employeeId={id!}
        currency={currency}
        employeeCurrencyId={employee.currency || currency?.id}
        month={activePeriod.month}
        year={activePeriod.year}
        periodCalendar={activePeriod.period_calendar}
        canEdit={canEdit('payroll') || canAdd('payroll') || canEdit('employees')}
      />

      <EmployeeYearlyPayrollTable
        employeeId={id!}
        year={selectedYear}
        onYearChange={setSelectedYear}
        yearOptions={yearOptions}
        monthFilter={selectedMonth}
        onMonthFilterChange={setSelectedMonth}
      />

      <Card className="shadow-none">
        <CardContent className="p-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoItem label={t('employees.phone')}>
              {employee.phone ? <a href={`tel:${employee.phone}`} className="hover:text-primary" dir="ltr">{employee.phone}</a> : '—'}
            </InfoItem>
            <InfoItem label={t('employees.email')}>
              {employee.email ? <a href={`mailto:${employee.email}`} className="break-all hover:text-primary">{employee.email}</a> : '—'}
            </InfoItem>
            <InfoItem label={t('employees.address')}>{employee.address}</InfoItem>
            <InfoItem label={t('employees.tazkiraNumber')}>{employee.tazkira_number}</InfoItem>
            <InfoItem label={t('employees.contractStartDate')}>{formatDate(employee.contract_start_date)}</InfoItem>
            <InfoItem label={t('employees.contractEndDate')}>
              {employee.contract_end_date ? formatDate(employee.contract_end_date) : t('employees.openEnded')}
            </InfoItem>
            <InfoItem label={t('employees.contractDays')}>
              {summaryQuery.isLoading ? <Skeleton className="h-4 w-12" /> : summary?.elapsed_days ?? '—'}
            </InfoItem>
            <InfoItem label={t('employees.dailyRate')}>
              {summaryQuery.isLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : summary?.daily_rate == null ? (
                '—'
              ) : (
                <EmployeeMoney amount={summary.daily_rate} currency={currency} decimals={salaryType === 'monthly' ? 4 : 2} />
              )}
            </InfoItem>
            <InfoItem label={t('payroll.bonus')}>
              {summaryQuery.isLoading ? <Skeleton className="h-4 w-14" /> : <EmployeeMoney amount={summary?.total_bonus ?? 0} currency={currency} />}
            </InfoItem>
            <InfoItem label={t('employees.entryTypeOvertime', 'Overtime')}>
              {summaryQuery.isLoading ? (
                <Skeleton className="h-4 w-14" />
              ) : (
                <EmployeeMoney amount={summary?.total_overtime ?? 0} currency={currency} />
              )}
            </InfoItem>
            <InfoItem label={t('employees.deductionTypeAbsence', 'Absence')}>
              {summaryQuery.isLoading ? (
                <Skeleton className="h-4 w-14" />
              ) : (
                <EmployeeMoney amount={summary?.total_absence_deductions ?? 0} currency={currency} />
              )}
            </InfoItem>
            <InfoItem label={t('employees.deductionTypeFood', 'Food')}>
              {summaryQuery.isLoading ? (
                <Skeleton className="h-4 w-14" />
              ) : (
                <EmployeeMoney amount={summary?.total_food_deductions ?? 0} currency={currency} />
              )}
            </InfoItem>
            <InfoItem label={t('employees.advances')}>
              {summaryQuery.isLoading ? <Skeleton className="h-4 w-14" /> : <EmployeeMoney amount={summary?.paid_advance ?? 0} currency={currency} />}
            </InfoItem>
            <InfoItem label={t('employees.loginAccount')}>
              {employee.user_details ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="break-all">{employee.user_details.email || employee.user_details.username}</span>
                  <Badge variant="secondary" className="font-normal">
                    {employee.user_details.is_active === false ? t('employees.inactive') : t('employees.active')}
                  </Badge>
                </span>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-normal text-muted-foreground">{t('employees.noLinkedAccount')}</span>
                  {hasAnyPermission(['add_users', 'edit_employees']) && (
                    <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setAccountDialogOpen(true)}>
                      {t('employees.createAccount')}
                    </Button>
                  )}
                </span>
              )}
            </InfoItem>
            {employee.tazkira_copy && (
              <InfoItem label={t('employees.tazkiraCopy')}>
                <a href={employee.tazkira_copy} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  {t('employees.viewDocument')}<ExternalLink className="h-3.5 w-3.5" />
                </a>
              </InfoItem>
            )}
            {employee.notes && (
              <InfoItem label={t('employees.notes')}>
                <span className="whitespace-pre-wrap font-normal text-muted-foreground">{employee.notes}</span>
              </InfoItem>
            )}
          </dl>
        </CardContent>
      </Card>

      <EmployeePayrollHistory key={id} employeeId={id!} />

      <CreateEmployeeAccountDialog
        open={accountDialogOpen}
        onOpenChange={setAccountDialogOpen}
        employeeId={id!}
        employeeName={employee.full_name}
        employeeEmail={employee.email}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['employee', id] });
          queryClient.invalidateQueries({ queryKey: ['employees'] });
        }}
      />
    </div>
  );
}
