import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { PayrollPeriodInput } from '@/components/payroll/PayrollPeriodInput';
import { payrollPeriodFromDate } from '@/lib/calendarDate';
import type { Payroll } from '@/types/payroll';
import { usePayrollRefresh } from '@/hooks/usePayrollRefresh';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ReloadIcon } from '@radix-ui/react-icons';
import { DollarSign } from 'lucide-react';

import useFetchObjects from '@/api/useFetchObjects';
import useUpdate from '@/api/useUpdate';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import {
  EmployeeFinancialSummary,
  EmployeePayrollSummaryCard,
} from '@/components/payroll/EmployeePayrollSummaryCard';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { requiredString } from '@/lib/formSchemas';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';
import api from '@/api/client';

const EditPayroll = () => {
  const { t } = useLanguage();
  const { calendar } = useCalendarPreference();
  const initialPeriod = payrollPeriodFromDate(new Date(), calendar)!;
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [financialSummary, setFinancialSummary] = useState<EmployeeFinancialSummary | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        employee: requiredString(t('payroll.validation.employee')),
        payroll_type: z.enum(['salary', 'advance']),
        salary_type: z.enum(['monthly', 'daily', 'other']),
        month: requiredString(t('payroll.validation.month')),
        year: z.coerce.number().int().min(1).max(9999),
        period_calendar: z.enum(['gregorian', 'jalali', 'hijri']),
        amount: z.coerce.number().min(0),
        bonus: z.coerce.number().min(0),
        overtime: z.coerce.number().min(0),
        salary_deduction: z.coerce.number().min(0),
        working_days: z.coerce.number().int().min(0).optional(),
        deduction_days: z.coerce.number().int().min(0),
        currency: requiredString(t('payroll.validation.currency')),
        payment_method: z.enum(['cash', 'bank', 'sarafi']),
        payment_date: z.string(),
        reference_number: z.string().max(100).optional(),
        notes: z.string().optional(),
      }),
    [t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      employee: '',
      payroll_type: 'salary',
      salary_type: 'monthly',
      month: initialPeriod.month,
      year: initialPeriod.year,
      period_calendar: initialPeriod.period_calendar,
      amount: 0,
      bonus: 0,
      overtime: 0,
      salary_deduction: 0,
      working_days: 30,
      deduction_days: 0,
      currency: '',
      payment_method: 'cash',
      payment_date: new Date().toISOString().slice(0, 16),
      reference_number: '',
      notes: '',
    },
  });

  const employee = form.watch('employee');
  const month = form.watch('month');
  const periodCalendar = form.watch('period_calendar');
  const year = form.watch('year');
  const salaryType = form.watch('salary_type');
  const workingDays = form.watch('working_days');
  const payrollType = form.watch('payroll_type');
  const paymentAmount = form.watch('amount');

  const { data: payroll, isLoading: payrollLoading } = useFetchObjects<Payroll>({
    queryKey: ['payroll', id],
    endpoint: `payrolls/${id}`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['payrolls'],
  });

  useEffect(() => {
    if (payroll) {
      const salaryTypeValue = (payroll.salary_type || payroll.employee_details?.salary_type || 'monthly') as
        | 'monthly'
        | 'daily'
        | 'other';
      form.reset({
        employee: payroll.employee?.toString() || '',
        payroll_type: payroll.payroll_type || 'salary',
        salary_type: salaryTypeValue,
        month: payroll.month || 'january',
        year: payroll.year,
        period_calendar: payroll.period_calendar || 'gregorian',
        // Settlement: amount is the cash payment, not a base for OT/deductions.
        amount: Number(payroll.amount ?? payroll.net_salary ?? 0),
        bonus: 0,
        overtime: 0,
        salary_deduction: 0,
        working_days: Number(payroll.working_days ?? 30),
        deduction_days: 0,
        currency: resolveCurrencyId({
          currency: payroll.currency,
          currency_details: payroll.currency_details,
        }),
        payment_method: payroll.payment_method || 'cash',
        payment_date: payroll.payment_date
          ? payroll.payment_date.slice(0, 16)
          : new Date().toISOString().slice(0, 16),
        reference_number: payroll.reference_number || '',
        notes: payroll.notes || '',
      });
    }
  }, [payroll, form]);

  usePayrollRefresh(isSuccess);

  useRedirectOnSuccess(isSuccess, '/payroll');

  useEffect(() => {
    if (!employee || !month || !year) return;
    const controller = new AbortController();

    const fetchEmployeeFinancialSummary = async () => {
      try {
        const params = new URLSearchParams({
          month: String(month),
          year: String(year),
          period_calendar: periodCalendar,
        });
        const response = await api.get<EmployeeFinancialSummary>(
          `employees/${employee}/financial_summary/`,
          { params, signal: controller.signal },
        );
        if (controller.signal.aborted) return;

        if (response.status === 200) {
          setFinancialSummary(response.data);
        } else {
          setFinancialSummary(null);
        }
      } catch {
        if (!controller.signal.aborted) setFinancialSummary(null);
      }
    };

    fetchEmployeeFinancialSummary();
    return () => controller.abort();
  }, [employee, month, year, periodCalendar, user?.token]);

  useEffect(() => {
    if (payrollType !== 'salary' || salaryType !== 'daily') return;
    const rate = Number(payroll?.basic_salary ?? financialSummary?.salary ?? 0);
    const days = Number(workingDays || 0);
    form.setValue('amount', Number((rate * days).toFixed(2)));
  }, [workingDays, salaryType, payrollType, financialSummary, payroll, form]);

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!payroll) return;
    const payAmount = Number(data.amount || 0);
    if (payAmount < 0) {
      form.setError('amount', { message: t('payroll.excessDeduction') });
      return;
    }

    const basic = Number(payroll.basic_salary ?? financialSummary?.salary ?? data.amount);
    // Cash settlement only — never re-post OT/deductions that already sit on the ledger.
    const payload: Record<string, unknown> = {
      employee: data.employee,
      payroll_type: data.payroll_type,
      salary_type: data.salary_type,
      month: data.month,
      year: data.year,
      period_calendar: data.period_calendar,
      amount: payAmount,
      net_salary: payAmount,
      gross_amount: data.payroll_type === 'salary' ? payAmount : null,
      bonus: 0,
      overtime: 0,
      salary_deduction: 0,
      deduction_days: 0,
      basic_salary: basic,
      currency: toCurrencyFkId(data.currency),
      payment_method: data.payment_method,
      payment_date: data.payment_date,
      reference_number: data.reference_number?.trim() || null,
      notes: data.notes,
      manual_net: true,
      working_days: data.salary_type === 'daily' && data.payroll_type === 'salary'
        ? (data.working_days || 0)
        : 30,
    };
    handleUpdate(payroll.id, payload);
  };

  if (payrollLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <FormPage title={t('payroll.editPayroll')} icon={<DollarSign />} backTo="/payroll" maxWidth="4xl">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="employee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('payroll.employee')} *</FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="employees"
                      getOptionLabel={(emp) => emp.full_name || 'N/A'}
                      getOptionValue={(emp) => emp.id.toString()}
                      value={field.value}
                      onChange={(value) => field.onChange(value?.toString() || '')}
                      placeholder={t('payroll.selectEmployee')}
                      disabled

                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField control={form.control} name="month" render={() => (
              <FormItem>
                <FormLabel>{t('payroll.period')} *</FormLabel>
                <PayrollPeriodInput month={month} year={Number(year)} period_calendar={periodCalendar} onChange={(period) => {
                  form.setValue('month', period.month, { shouldDirty: true, shouldValidate: true });
                  form.setValue('year', period.year, { shouldDirty: true, shouldValidate: true });
                  form.setValue('period_calendar', period.period_calendar, { shouldDirty: true });
                }} />
                <FormMessage />
              </FormItem>
            )} />

            <FormField
              control={form.control}
              name="payroll_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('payroll.type')} *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}

                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="salary">{t('payroll.salaryPayment')}</SelectItem>
                      <SelectItem value="advance">{t('payroll.advancePayment')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {financialSummary ? <EmployeePayrollSummaryCard summary={financialSummary} /> : null}

          {financialSummary && payrollType === 'salary' && salaryType === 'monthly' ? (
            <p className="text-xs text-muted-foreground">
              {t(
                'payroll.settlementHint',
                'Overtime and absences are recorded on the employee page. This payment settles the open balance (net − already paid).',
              )}
            </p>
          ) : null}

          <FormPageFields>
            <FormField
              control={form.control}
              name="salary_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('employees.salaryType', 'Salary type')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="monthly">{t('employees.salaryTypeMonthly', 'Monthly')}</SelectItem>
                      <SelectItem value="daily">{t('employees.salaryTypeDaily', 'Daily')}</SelectItem>
                      <SelectItem value="other">{t('employees.salaryTypeOther', 'Other')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {salaryType === 'daily' && payrollType === 'salary' ? (
              <FormField
                control={form.control}
                name="working_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('payroll.daysWorked', 'Days worked')} *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        {...field}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? 0 : parseInt(e.target.value, 10))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {payrollType === 'advance'
                      ? t('payroll.advanceAmount', 'Advance amount')
                      : t('payroll.paymentAmount', 'Payment amount')} *
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      readOnly={salaryType === 'daily' && payrollType === 'salary'}
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? 0 : parseFloat(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('payroll.currency')} *</FormLabel>
                  <FormControl>
                    <CurrencySelect
                      value={field.value}
                      onChange={(value) => field.onChange(value?.toString() || '')}
                      placeholder={t('payroll.selectCurrency')}
                      allowedCodes={['AFN', 'USD']}
                      disabled
                      includeIds={
                        payroll?.currency
                          ? [payroll.currency]
                          : undefined
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payment_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('payroll.paymentMethod', 'Payment method')} *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('payroll.paymentMethod', 'Payment method')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cash">{t('common.cash', 'Cash')}</SelectItem>
                      <SelectItem value="bank">{t('common.bank', 'Bank')}</SelectItem>
                      <SelectItem value="sarafi">{t('common.sarafi', 'Sarafi')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payment_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('payroll.paymentDate')}</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="rounded-lg bg-primary/10 p-3" aria-live="polite">
              <p className="text-sm text-muted-foreground">
                {payrollType === 'advance'
                  ? t('payroll.advanceAmount', 'Advance amount')
                  : t('payroll.paymentAmount', 'Payment amount')}
              </p>
              <p className="text-xl font-semibold">{Number(paymentAmount || 0).toFixed(2)}</p>
              {financialSummary && payrollType === 'salary' ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('employees.balance', 'Balance')}: {Number(financialSummary.balance ?? financialSummary.total_remaining ?? 0).toFixed(2)}
                </p>
              ) : null}
            </div>
          </FormPageFields>

          <FormField
            control={form.control}
            name="reference_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('payroll.referenceNumber', 'Reference number')}</FormLabel>
                <FormControl>
                  <Input maxLength={100} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('employees.notes')}</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormActions
            onCancel={() => navigate('/payroll')}
            loading={loading}
            submitLabel={t('common.update')}
            loadingLabel={t('common.updating')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default EditPayroll;
