import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Receipt } from 'lucide-react';import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Autocomplete } from '@/components/ui/autocomplete';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { AfnReportingPreview } from '@/components/forms/AfnReportingPreview';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import useUpdate from '@/api/useUpdate';
import useFetchObjects from '@/api/useFetchObjects';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, requiredString } from '@/lib/formSchemas';

const EditExpense = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        category: requiredString(messages.required),
        amount: z
          .string()
          .min(1, messages.required)
          .refine((v) => parseFloat(v) > 0, messages.positive),
        expense_date: requiredString(messages.required),
        currency: requiredString(messages.required),
        description: z.string().optional(),
        user: z.string().optional(),
        receipt: z.instanceof(File).nullable().optional(),
      }),
    [messages.required, messages.positive],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: '',
      amount: '',
      expense_date: new Date().toISOString().slice(0, 16),
      currency: '',
      description: '',
      user: '',
      receipt: null,
    },
  });

  const { data: expense } = useFetchObjects({
    queryKey: ['expense', id],
    endpoint: `expenses/${id}/`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['expenses'],
  });

  useEffect(() => {
    if (expense) {
      form.reset({
        category: expense.category?.toString() || '',
        amount: expense.amount?.toString() || '',
        expense_date: expense.expense_date
          ? expense.expense_date.slice(0, 16)
          : new Date().toISOString().slice(0, 16),
        currency: resolveCurrencyId(expense),
        description: expense.description || '',
        user: expense.user?.toString() || '',
        receipt: null,
      });
    }
  }, [expense, form]);

  useRedirectOnSuccess(isSuccess, '/expenses');

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!id) return;

    const submitData = new FormData();
    submitData.append('category', data.category);
    submitData.append('amount', data.amount);
    submitData.append('expense_date', data.expense_date);
    submitData.append('currency', String(toCurrencyFkId(data.currency)));
    if (data.description?.trim()) {
      submitData.append('description', data.description.trim());
    }
    if (data.user) {
      submitData.append('user', data.user);
    }
    if (data.receipt) {
      submitData.append('receipt', data.receipt);
    }

    handleUpdate(id, submitData);
  };

  return (
    <FormPage
      title={t('expenses.editExpense')}
      icon={<Receipt />}
      backTo="/expenses"
    >
<Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormPageFields>
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('expenses.category')} *</FormLabel>
                      <FormControl>
                        <Autocomplete
                          endpoint="expense-categories"
                          getOptionLabel={(c) => c.name}
                          getOptionValue={(c) => c.id.toString()}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('expenses.selectCategory')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('expenses.amount')} *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={t('expenses.enterAmount')}
                          {...field}
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
                      <FormLabel>{t('expenses.currency')} *</FormLabel>
                      <FormControl>
                        <CurrencySelect
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('expenses.selectCurrency')}
                          allowedCodes={['AFN', 'USD']}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expense_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('expenses.expenseDate')} *</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>

              <AfnReportingPreview
                amount={watchedAmount}
                currencyId={watchedCurrency}
                atDate={watchedDate}
              />

              <FormPageFields>
                <FormField
                  control={form.control}
                  name="user"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('expenses.user')}</FormLabel>
                      <FormControl>
                        <Autocomplete
                          endpoint="users"
                          getOptionLabel={(u) =>
                            `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || u.username
                          }
                          getOptionValue={(u) => u.id.toString()}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('expenses.selectUser')}
                          disabled={!user?.is_staff}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="receipt"
                  render={({ field: { onChange, value: _value, ...field } }) => (
                    <FormItem>
                      <FormLabel>{t('expenses.receipt')}</FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          accept="image/*,.pdf"
                          {...field}
                          value={undefined}
                          onChange={(e) => onChange(e.target.files?.[0] || null)}
                        />
                      </FormControl>
                      {expense?.receipt && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Current:{' '}
                          <a
                            href={expense.receipt}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            View Receipt
                          </a>
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('expenses.description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('expenses.enterDescription')}
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormActions
                onCancel={() => navigate('/expenses')}
                loading={loading}
                submitLabel={t('common.update')}
                loadingLabel={t('common.updating')}
              />
            </form>
          </Form>
    </FormPage>
  );
};

export default EditExpense;
