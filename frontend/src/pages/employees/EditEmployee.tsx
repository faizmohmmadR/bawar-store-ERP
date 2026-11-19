import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ReloadIcon } from '@radix-ui/react-icons';
import { Users } from 'lucide-react';

import useFetchObjects from '@/api/useFetchObjects';
import useUpdate from '@/api/useUpdate';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import { Input } from '@/components/ui/input';
import { DatePickerInput } from '@/components/ui/date-picker-input';
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
import { useLanguage } from '@/contexts/LanguageContext';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, optionalString, requiredString } from '@/lib/formSchemas';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';
import { Button } from '@/components/ui/button';
import { CreateEmployeeAccountDialog } from './CreateEmployeeAccountDialog';

const EditEmployee = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const messages = useMemo(() => formMessages(t), [t]);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);

  const schema = useMemo(
    () =>
      z
        .object({
          full_name: requiredString(messages.required),
          email: z.string().optional(),
          phone: requiredString(messages.required),
          tazkira_number: optionalString(),
          tazkira_copy: z.instanceof(File).nullable().optional(),
          is_active: z.boolean(),
          address: z.string().optional(),
          salary: z.coerce.number().min(0, messages.positive),
          salary_type: z.enum(['monthly', 'daily', 'other']),
          currency: requiredString(messages.required),
          notes: z.string().optional(),
          contract_start_date: requiredString(messages.required),
          contract_end_date: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          if (
            data.contract_start_date &&
            data.contract_end_date &&
            data.contract_end_date < data.contract_start_date
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('validation.invalid'),
              path: ['contract_end_date'],
            });
          }
        }),
    [messages.positive, messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      tazkira_number: '',
      tazkira_copy: null,
      is_active: true,
      address: '',
      salary: 0,
      salary_type: 'monthly',
      currency: '',
      notes: '',
      contract_start_date: '',
      contract_end_date: '',
    },
  });

  const { data: employee, isLoading: employeeLoading } = useFetchObjects<any>({
    queryKey: ['employee', id],
    endpoint: `employees/${id}`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate<any>({
    queryKey: ['employees'],
  });

  useEffect(() => {
    if (employee) {
      form.reset({
        full_name: employee.full_name || '',
        email: employee.email || '',
        phone: employee.phone || '',
        tazkira_number: employee.tazkira_number || '',
        tazkira_copy: null,
        is_active: employee.is_active,
        address: employee.address || '',
        salary: employee.salary || 0,
        salary_type: employee.salary_type || 'monthly',
        currency: resolveCurrencyId(employee),
        notes: employee.notes || '',
        contract_start_date: employee.contract_start_date || '',
        contract_end_date: employee.contract_end_date || '',
      });
    }
  }, [employee, form]);

  useRedirectOnSuccess(isSuccess, '/employees');

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!employee) return;

    const updateData = new FormData();
    updateData.append('full_name', data.full_name.trim());
    updateData.append('phone', data.phone.trim());
    updateData.append('tazkira_number', data.tazkira_number?.trim() || '');
    updateData.append('salary', String(data.salary || 0));
    updateData.append('salary_type', data.salary_type);
    updateData.append('currency', String(toCurrencyFkId(data.currency)));
    updateData.append('is_active', String(data.is_active));
    if (data.email?.trim()) updateData.append('email', data.email.trim());
    if (data.address?.trim()) updateData.append('address', data.address.trim());
    if (data.notes?.trim()) updateData.append('notes', data.notes.trim());
    updateData.append('contract_start_date', data.contract_start_date);
    if (data.contract_end_date) updateData.append('contract_end_date', data.contract_end_date);
    if (data.tazkira_copy) updateData.append('tazkira_copy', data.tazkira_copy);
    handleUpdate(employee.id, updateData);
  };

  if (employeeLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <>
    <FormPage
      title={t('employees.editEmployee')}
      icon={<Users />}
      backTo="/employees"
      maxWidth="4xl"
    >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">{t('employees.personalInformation')}</h3>
                <FormPageFields>
                  <FormField
                    control={form.control}
                    name="full_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('employees.name')} *</FormLabel>
                        <FormControl>
                          <Input placeholder={t('employees.name')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('employees.email')}</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder={t('employees.email')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormPageFields>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('employees.phone')} *</FormLabel>
                        <FormControl>
                          <Input placeholder={t('employees.phone')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tazkira_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('employees.tazkiraNumber')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('employees.tazkiraNumberPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tazkira_copy"
                    render={({ field: { onChange, value: _value, ...field } }) => (
                      <FormItem>
                        <FormLabel>{t('employees.tazkiraCopy')}</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/*,.pdf"
                            {...field}
                            value={undefined}
                            onChange={(e) => onChange(e.target.files?.[0] || null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">{t('employees.employmentInformation')}</h3>
                <FormPageFields>
                  <FormField
                    control={form.control}
                    name="salary_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('employees.salaryType', 'Salary type')} *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="monthly">
                              {t('employees.salaryTypeMonthly', 'Monthly')}
                            </SelectItem>
                            <SelectItem value="daily">
                              {t('employees.salaryTypeDaily', 'Daily')}
                            </SelectItem>
                            <SelectItem value="other">
                              {t('employees.salaryTypeOther', 'Other')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {form.watch('salary_type') === 'daily'
                            ? t('employees.dailyRate', 'Daily rate')
                            : form.watch('salary_type') === 'other'
                              ? t('employees.agreedAmount', 'Agreed amount')
                              : t('employees.salary')}{' '}
                          *
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={t('employees.salaryPlaceholder')}
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormPageFields>

                <FormPageFields>
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('employees.currency')} *</FormLabel>
                        <FormControl>
                          <CurrencySelect
                            value={field.value}
                            onChange={(value) => field.onChange(value?.toString() || '')}
                            placeholder={t('employees.currencyPlaceholder')}
                            allowedCodes={['AFN', 'USD']}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="is_active"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('employees.status')}</FormLabel>
                        <Select
                          value={field.value ? 'true' : 'false'}
                          onValueChange={(value) => field.onChange(value === 'true')}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="true">{t('employees.active')}</SelectItem>
                            <SelectItem value="false">{t('employees.inactive')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormPageFields>

                <FormPageFields>
                  <FormField
                    control={form.control}
                    name="contract_start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('employees.contractStartDate')} *</FormLabel>
                        <DatePickerInput value={field.value || ''} onChange={field.onChange} />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contract_end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('employees.contractEndDate')}</FormLabel>
                        <DatePickerInput value={field.value || ''} onChange={field.onChange} />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormPageFields>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">{t('employees.additionalInformation')}</h3>
                <FormPageFields>
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('employees.address')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('employees.addressPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormPageFields>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('employees.notes')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('employees.notesPlaceholder')} rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <h3 className="text-lg font-semibold">{t('employees.loginAccount')}</h3>
                {employee?.user_details ? (
                  <p className="text-sm text-muted-foreground">
                    {t('employees.alreadyHasAccount')}: <span className="font-medium text-foreground">{employee.user_details.email || employee.user_details.username}</span>
                    {employee.user_details.email ? ` · ${employee.user_details.email}` : ''}
                  </p>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setAccountDialogOpen(true)}>
                    {t('employees.createAccount')}
                  </Button>
                )}
              </div>

              <FormActions
                onCancel={() => navigate('/employees')}
                loading={loading}
                submitLabel={t('common.update')}
                loadingLabel={t('common.updating')}
              />
            </form>
          </Form>
      </FormPage>
      {id && (
        <CreateEmployeeAccountDialog
          open={accountDialogOpen}
          onOpenChange={setAccountDialogOpen}
          employeeId={id}
          employeeName={employee?.full_name}
          employeeEmail={employee?.email}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['employee', id] });
            queryClient.invalidateQueries({ queryKey: ['employees'] });
          }}
        />
      )}
    </>
  );
};

export default EditEmployee;
