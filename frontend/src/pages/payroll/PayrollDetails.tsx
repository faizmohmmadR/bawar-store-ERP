import { formatPayrollPeriod } from '@/lib/calendarDate';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import type { Payroll } from '@/types/payroll';
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFormatAppDate } from '@/hooks/useFormatAppDate';
import useFetchObjects from '@/api/useFetchObjects';
import { DollarSign, User, Calendar, FileText, ArrowLeft } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import JournalEntriesSection from '@/components/accounting/JournalEntriesSection';
import { CurrencyAmount } from '@/components/display/CurrencyAmount';

const PayrollDetails = () => {
  const { t, language } = useLanguage();
  const { calendar } = useCalendarPreference();
  const { formatDateTime } = useFormatAppDate();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: payroll, isLoading } = useFetchObjects<Payroll>({
    queryKey: ['payroll', id],
    endpoint: `payrolls/${id}`,
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="container mx-auto py-6">
        <p>Payroll not found</p>
      </div>
    );
  }

  const monthLabel = formatPayrollPeriod(payroll.month, payroll.year, payroll.period_calendar || 'gregorian', calendar, language);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/payroll')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <DollarSign className="h-6 w-6" />
          <h1 className="text-3xl font-bold">{t('payroll.payrollDetails')}</h1>
        </div>
      </div>

      <div className="bg-gradient-to-r from-green-50 to-primary/10 dark:from-green-950/20 dark:to-primary/20 rounded-lg p-6 border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/15 dark:bg-primary/20 rounded-lg">
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                <CurrencyAmount amount={payroll.amount || payroll.net_salary || 0} currency={payroll.currency_details} />
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{monthLabel}</p>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            {t('payroll.employeeInformation')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('payroll.employee')}</p>
                <p className="font-semibold">{payroll.employee_details?.fullname || 'N/A'}</p>
              </div>
            </div>
            {payroll.employee_details?.phone && (
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('employees.phone')}</p>
                  <p className="font-medium">{payroll.employee_details.phone}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            {t('payroll.paymentInformation')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('payroll.type')}</p>
                <p className="font-bold text-lg text-primary">
                  {payroll.payroll_type === 'advance'
                    ? t('payroll.advancePayment')
                    : t('payroll.salaryPayment')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('payroll.amount')}</p>
                <p className="font-medium text-primary">
                  <CurrencyAmount amount={payroll.amount || payroll.net_salary || 0} currency={payroll.currency_details} />
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('payroll.referenceNumber', 'Reference number')}</p>
                <p className="font-medium">{payroll.reference_number || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 col-span-2 p-4 bg-primary/10 rounded-lg border-l-4 border-primary">
              <DollarSign className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-gray-600">{t('employees.notes')}</p>
                <p className="font-bold text-2xl text-primary">
                  {payroll.notes || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-accent" />
            {t('payroll.paymentInformation')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('payroll.period')}</p>
                <p className="font-medium">{monthLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-gray-500" />
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('payroll.paymentDate')}</p>
                <p className="font-medium">
                  {payroll.payment_date ? formatDateTime(payroll.payment_date) : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('employees.adjustments')}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {([
            ['payroll.bonus', payroll.bonus],
            ['payroll.overtime', payroll.overtime],
            ['payroll.deductions', payroll.deductions],
            ['payroll.netSalary', payroll.net_salary],
          ] as const).map(([label, amount]) => <div key={label}>
            <p className="text-sm text-muted-foreground">{t(label)}</p>
            <CurrencyAmount amount={amount} currency={payroll.currency_details} className="font-semibold" />
          </div>)}
        </CardContent>
      </Card>
      <JournalEntriesSection model="payroll" objectId={id!} />
    </div>
  );
};

export default PayrollDetails;
