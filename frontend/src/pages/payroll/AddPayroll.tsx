import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import { normalizePayrollPeriod, PayrollPeriodInput } from '@/components/payroll/PayrollPeriodInput';
import { payrollPeriodFromDate } from '@/lib/calendarDate';
import { usePayrollRefresh } from '@/hooks/usePayrollRefresh';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DollarSign } from 'lucide-react';

import useAdd from '@/api/useAdd';
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
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { requiredString } from '@/lib/formSchemas';
import { toCurrencyFkId } from '@/lib/currencies';
import api from '@/api/client';

type EmployeeOption = {
  id: number;
  full_name?: string;
  salary?: number;
  salary_type?: 'monthly' | 'daily' | 'other';
  currency?: number;
};

const AddPayroll = () => {
  const { t } = useLanguage();
  const { calendar } = useCalendarPreference();
  const initialPeriod = payrollPeriodFromDate(new Date(), calendar)!;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const employeeFromLink = searchParams.get('employee') || '';
  const { user } = useAuth();
  const [financialSummary, setFinancialSummary] = useState<EmployeeFinancialSummary | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);

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
      employee: /^\d+$/.test(employeeFromLink) ? employeeFromLink : '',
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
  const payrollType = form.watch('payroll_type');
  const salaryType = form.watch('salary_type');
  const workingDays = form.watch('working_days');
  const paymentAmount = form.watch('amount');

  const { handleAdd, loading, isSuccess } = useAdd<Record<string, unknown>>({
    queryKey: 'payrolls',
    customSuccessMessage: t('payroll.addSuccess'),
  });

  usePayrollRefresh(isSuccess);

  const onReset = useCallback(() => {
    form.reset();
    setFinancialSummary(null);
    setSelectedEmployee(null);
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/payroll',
    onReset,
  });

  // If Settings calendar changes while this page is open, realign the period.
  useEffect(() => {
    if (periodCalendar === calendar) return;
    const normalized = normalizePayrollPeriod(month, Number(year), periodCalendar, calendar)
      || payrollPeriodFromDate(new Date(), calendar);
    if (!normalized) return;
    form.setValue('month', normalized.month, { shouldDirty: false });
    form.setValue('year', normalized.year, { shouldDirty: false });
    form.setValue('period_calendar', normalized.period_calendar, { shouldDirty: false });
  }, [calendar, form, month, periodCalendar, year]);

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
          const data = response.data;
          setFinancialSummary(data);
          const st = (data.salary_type || selectedEmployee?.salary_type || 'monthly') as
            | 'monthly'
            | 'daily'
            | 'other';
          form.setValue('salary_type', st);
          if (data.currency?.id) {
            form.setValue('currency', data.currency.id.toString());
          }
          // Settlement model: OT/absences live on the employee ledger.
          // Payment amount = open balance (or days × rate for daily salary).
          form.setValue('bonus', 0);
          form.setValue('overtime', 0);
          form.setValue('salary_deduction', 0);
          form.setValue('deduction_days', 0);
          if (payrollType === 'advance') {
            form.setValue('amount', 0);
          } else if (st === 'monthly') {
            const remaining = Number(
              data.balance ?? data.total_remaining ?? data.net_salary ?? data.salary ?? 0,
            );
            form.setValue('amount', Math.max(0, Number(remaining.toFixed(2))));
            form.setValue('working_days', 30);
          } else if (st === 'daily') {
            const rate = Number(data.salary || selectedEmployee?.salary || 0);
            const days = Number(form.getValues('working_days') || 1);
            form.setValue('amount', Number((rate * days).toFixed(2)));
          } else {
            form.setValue('amount', Math.max(0, Number(data.balance ?? data.net_salary ?? data.salary ?? 0)));
          }
        } else {
          setFinancialSummary(null);
        }
      } catch {
        if (!controller.signal.aborted) setFinancialSummary(null);
      }
    };

    fetchEmployeeFinancialSummary();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, month, year, periodCalendar, user?.token, payrollType]);

  useEffect(() => {
    if (payrollType !== 'salary' || salaryType !== 'daily') return;
    const rate = Number(financialSummary?.salary || selectedEmployee?.salary || 0);
    const days = Number(workingDays || 0);
    form.setValue('amount', Number((rate * days).toFixed(2)));
  }, [workingDays, salaryType, payrollType, financialSummary, selectedEmployee, form]);

  const onSubmit = (data: z.infer<typeof schema>) => {
    const payAmount = Number(data.amount || 0);
    if (payAmount < 0) {
      form.setError('amount', { message: t('payroll.excessDeduction') });
      return;
    }
    const basic = Number(financialSummary?.salary ?? selectedEmployee?.salary ?? data.amount);
    const period = normalizePayrollPeriod(
      data.month,
      data.year,
      data.period_calendar,
      calendar,
    ) || {
      month: data.month,
      year: data.year,
      period_calendar: calendar,
    };
    // Cash settlement only — never re-post OT/deductions that already sit on the ledger.
    const payload: Record<string, unknown> = {
      employee: data.employee,
      payroll_type: data.payroll_type,
      salary_type: data.salary_type,
      month: period.month,
      year: period.year,
      period_calendar: period.period_calendar,
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
    handleAdd(payload);
  };

  return (
    <FormPage title={t('payroll.addPayroll')} icon={<DollarSign />} backTo="/payroll" maxWidth="4xl">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="employee"
              render={({ field }) => (
                <FormItem className="min-w-0 sm:col-span-2">
                  <FormLabel>{t('payroll.employee')} *</FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="employees"
                      getOptionLabel={(emp) => emp.full_name || 'N/A'}
                      getOptionValue={(emp) => emp.id.toString()}
                      value={field.value}
                      onChange={(value, option) => {
                        field.onChange(value?.toString() || '');
                        setSelectedEmployee((option as EmployeeOption) || null);
                        if (option?.salary_type) {
                          form.setValue('salary_type', option.salary_type);
                        }
                        form.setValue('amount', 0);
                        setFinancialSummary(null);
                      }}
                      placeholder={t('payroll.selectEmployee')}
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
                  <Select value={field.value} onValueChange={field.onChange}>
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
                      disabled={!!financialSummary?.currency?.id}
                      includeIds={
                        financialSummary?.currency?.id
                          ? [financialSummary.currency.id]
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
                  <FormLabel>{t('payroll.paymentDate')} *</FormLabel>
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
                <FormLabel>{t('payroll.notes')}</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormActions
            loading={loading}
            onCancel={() => navigate('/payroll')}
            onIntent={onIntent}
            showSaveAndCreateNew={showSaveAndCreateNew}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddPayroll;
