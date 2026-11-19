import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportFilters } from '@/components/reports/ReportFilters';
import {
  ReportCurrencyLabel,
  ReportMoney,
  ReportNumber,
  ReportTh,
} from '@/components/reports/ReportAmount';
import useFetchObjects from '@/api/useFetchObjects';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildFinancialReportParams } from '@/lib/reportPeriod';
import { formatNumber, formatReportMoney } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

type AttendanceRow = { status: string; count: number };
type MethodRow = { payment_method: string; count: number; amount_afn: number };
type EmployeeRow = {
  employee_id: number;
  full_name: string;
  salary_paid_afn: number;
  advances_paid_afn: number;
  total_paid_afn: number;
  overtime_afn: number;
  deductions_afn: number;
  absence_days: number;
  payment_count: number;
};

type HrReportResponse = {
  currency: string;
  kpis: {
    active_headcount: number;
    inactive_headcount: number;
    salary_paid_afn: number;
    salary_cash_afn: number;
    salary_goods_afn: number;
    advances_paid_afn: number;
    payroll_total_afn: number;
    overtime_afn: number;
    overtime_hours: number;
    deductions_afn: number;
    absence_days: number;
    attendance_present: number;
    attendance_absent: number;
    attendance_leave: number;
    attendance_late: number;
    attendance_records: number;
  };
  attendance_by_status?: AttendanceRow[];
  payments_by_method?: MethodRow[];
  employees?: EmployeeRow[];
};

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];

function KpiCard({
  title,
  value,
  hint,
  currency,
  icon,
  tone = 'default',
  formatValue,
}: {
  title: string;
  value: number;
  hint?: string;
  currency?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'good' | 'bad' | 'neutral';
  formatValue?: (value: number, currency?: string) => string;
}) {
  const toneClass =
    tone === 'good'
      ? 'border-l-emerald-500'
      : tone === 'bad'
        ? 'border-l-red-500'
        : tone === 'neutral'
          ? 'border-l-sky-500'
          : 'border-l-primary';

  const display = formatValue
    ? formatValue(value, currency)
    : formatReportMoney(value, currency);

  return (
    <Card className={cn('h-full border-l-4 shadow-sm', toneClass)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            <p dir="ltr" className="text-xl sm:text-2xl font-semibold tabular-nums whitespace-nowrap text-start">
              <span>{display}</span>
              {currency ? <span className="ms-1">{currency}</span> : null}
            </p>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          <div className="rounded-md bg-muted/60 p-2 text-muted-foreground shrink-0">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const HrReportPage = () => {
  const { calendar } = useCalendarPreference();
  const { t } = useLanguage();
  const [period, setPeriod] = useState('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const params = useMemo(
    () => buildFinancialReportParams(period, startDate, endDate, 'monthly', calendar),
    [calendar, period, startDate, endDate],
  );

  const { data, isLoading, isError } = useFetchObjects<HrReportResponse>({
    queryKey: ['hr_report', calendar, period, startDate, endDate],
    endpoint: 'employees/report',
    params,
    options: { staleTime: 0 },
  });

  const currency = data?.currency || 'AFN';
  const kpis = data?.kpis;
  const attendanceRows = data?.attendance_by_status || [];
  const methodRows = data?.payments_by_method || [];
  const employees = data?.employees || [];

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      present: t('attendance.status.present', 'Present'),
      absent: t('attendance.status.absent', 'Absent'),
      leave: t('attendance.status.leave', 'Leave'),
      holiday: t('attendance.status.holiday', 'Holiday'),
      late: t('attendance.status.late', 'Late'),
    };
    return map[status] || status;
  };

  const methodLabel = (method: string) => {
    const map: Record<string, string> = {
      cash: t('payments.methods.cash', 'Cash'),
      bank: t('payments.methods.bank', 'Bank'),
      sarafi: t('payments.methods.sarafi', 'Sarafi'),
      goods: t('payroll.goodsSettlement', 'Goods'),
    };
    return map[method] || method;
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <ReportFilters
        title={t('employees.reportTitle', 'HR Report')}
        subtitle={t(
          'employees.reportHint',
          'Headcount, payroll paid, attendance, overtime and deductions',
        )}
        icon={<Users className="h-7 w-7 text-primary shrink-0" />}
        headerAction={
          <Button variant="outline" asChild>
            <Link to="/employees">
              <ArrowLeft className="h-4 w-4" />
              {t('employees.title', 'Employees')}
            </Link>
          </Button>
        }
        periods={PERIODS}
        period={period}
        onPeriodChange={setPeriod}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
      />

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('reports.analyzingData')}</p>
        </div>
      )}

      {isError && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('employees.reportLoadError', 'Could not load the HR report.')}
          </CardContent>
        </Card>
      )}

      {!isLoading && kpis && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              title={t('employees.reportActiveHeadcount', 'Active staff')}
              value={kpis.active_headcount}
              hint={`${formatNumber(kpis.inactive_headcount)} ${t('employees.reportInactive', 'inactive')}`}
              icon={<UserCheck className="h-5 w-5" />}
              tone="good"
              formatValue={(v) => formatNumber(v)}
            />
            <KpiCard
              title={t('employees.reportSalaryPaid', 'Salary paid')}
              value={kpis.salary_paid_afn}
              currency={currency}
              hint={`${t('employees.reportCash', 'Cash')} ${formatReportMoney(kpis.salary_cash_afn, currency)} · ${t('employees.reportGoods', 'Goods')} ${formatReportMoney(kpis.salary_goods_afn, currency)}`}
              icon={<Wallet className="h-5 w-5" />}
            />
            <KpiCard
              title={t('employees.reportAdvancesPaid', 'Advances paid')}
              value={kpis.advances_paid_afn}
              currency={currency}
              hint={`${t('employees.reportPayrollTotal', 'Payroll total')} ${formatReportMoney(kpis.payroll_total_afn, currency)}`}
              icon={<Wallet className="h-5 w-5" />}
              tone="neutral"
            />
            <KpiCard
              title={t('employees.reportAttendance', 'Attendance')}
              value={kpis.attendance_present}
              hint={`${statusLabel('absent')} ${formatNumber(kpis.attendance_absent)} · ${statusLabel('leave')} ${formatNumber(kpis.attendance_leave)} · ${statusLabel('late')} ${formatNumber(kpis.attendance_late)}`}
              icon={<CalendarDays className="h-5 w-5" />}
              tone="neutral"
              formatValue={(v) => formatNumber(v)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <KpiCard
              title={t('employees.reportOvertime', 'Overtime')}
              value={kpis.overtime_afn}
              currency={currency}
              hint={`${formatNumber(kpis.overtime_hours)} ${t('employees.reportHours', 'hours')}`}
              icon={<Wallet className="h-5 w-5" />}
              tone="neutral"
            />
            <KpiCard
              title={t('employees.reportDeductions', 'Deductions')}
              value={kpis.deductions_afn}
              currency={currency}
              hint={`${formatNumber(kpis.absence_days)} ${t('employees.reportAbsenceDays', 'absence days')}`}
              icon={<Wallet className="h-5 w-5" />}
              tone={kpis.deductions_afn > 0 ? 'bad' : 'default'}
            />
          </div>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('employees.reportAttendanceByStatus', 'Attendance by status')}
              </CardTitle>
              <CardDescription>
                {t(
                  'employees.reportAttendanceByStatusHint',
                  'Day records in the selected period',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('common.status', 'Status')}</ReportTh>
                    <ReportTh>{t('employees.reportDays', 'Days')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows.map((row) => (
                    <tr key={row.status} className="border-b last:border-0">
                      <td className="py-2 font-medium">{statusLabel(row.status)}</td>
                      <td className="py-2"><ReportNumber value={row.count} /></td>
                    </tr>
                  ))}
                  {!attendanceRows.length && (
                    <tr>
                      <td colSpan={2} className="py-8 text-center text-muted-foreground">
                        {t('employees.reportNoAttendance', 'No attendance records in this period')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('employees.reportPaymentsByMethod', 'Payments by method')}
              </CardTitle>
              <CardDescription>
                {t(
                  'employees.reportPaymentsByMethodHint',
                  'Salary and advances paid in the period (AFN)',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('payroll.paymentMethod', 'Method')}</ReportTh>
                    <ReportTh>{t('employees.reportPayments', 'Payments')}</ReportTh>
                    <ReportTh>{t('employees.reportAmount', 'Amount')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {methodRows.map((row) => (
                    <tr key={row.payment_method} className="border-b last:border-0">
                      <td className="py-2 font-medium">{methodLabel(row.payment_method)}</td>
                      <td className="py-2"><ReportNumber value={row.count} /></td>
                      <td className="py-2 tabular-nums font-medium">
                        <ReportMoney value={row.amount_afn} code="AFN" />
                      </td>
                    </tr>
                  ))}
                  {!methodRows.length && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-muted-foreground">
                        {t('employees.reportNoPayments', 'No payroll payments in this period')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t('employees.reportEmployees', 'Employees in period')}
              </CardTitle>
              <CardDescription>
                {t(
                  'employees.reportEmployeesHint',
                  'Staff with salary, advances, overtime, or deductions in the period',
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <ReportTh>{t('employees.name', 'Name')}</ReportTh>
                    <ReportTh>{t('employees.reportSalaryPaid', 'Salary')}</ReportTh>
                    <ReportTh>{t('employees.reportAdvancesPaid', 'Advances')}</ReportTh>
                    <ReportTh>{t('employees.reportOvertime', 'Overtime')}</ReportTh>
                    <ReportTh>{t('employees.reportDeductions', 'Deductions')}</ReportTh>
                    <ReportTh>{t('employees.reportTotalPaid', 'Total paid')}</ReportTh>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((row) => (
                    <tr key={row.employee_id} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <Link
                          to={`/employees/${row.employee_id}`}
                          className="text-primary hover:underline"
                        >
                          {row.full_name}
                        </Link>
                      </td>
                      <td className="py-2">
                        <ReportMoney value={row.salary_paid_afn} code="AFN" />
                      </td>
                      <td className="py-2">
                        <ReportMoney value={row.advances_paid_afn} code="AFN" />
                      </td>
                      <td className="py-2">
                        <ReportMoney value={row.overtime_afn} code="AFN" />
                      </td>
                      <td className="py-2">
                        <ReportMoney value={row.deductions_afn} code="AFN" />
                      </td>
                      <td className="py-2 font-medium">
                        <ReportMoney value={row.total_paid_afn} code="AFN" />
                      </td>
                    </tr>
                  ))}
                  {!employees.length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t('employees.reportNoEmployeeActivity', 'No employee activity in this period')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default HrReportPage;
