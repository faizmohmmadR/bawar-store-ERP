import { useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { toCurrencyFkId } from '@/lib/currencies';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages, requiredString } from '@/lib/formSchemas';

const AddExpense = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
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

  const watchedAmount = useWatch({ control: form.control, name: 'amount' });
  const watchedCurrency = useWatch({ control: form.control, name: 'currency' });
  const watchedDate = useWatch({ control: form.control, name: 'expense_date' });

  const { handleAdd, loading, isSuccess } = useAdd<FormData>({
    queryKey: ['expenses'],
    endpoint: 'expenses/',
  });

  useEffect(() => {
    if (user?.id) {
      form.setValue('user', user.id.toString());
    }
  }, [user, form]);

  const onReset = useCallback(() => {
    form.reset();
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/expenses',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
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

    handleAdd(submitData);
  };

  return (
    <FormPage
      title={t('expenses.addExpense')}
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
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('expenses.selectCategory')}
                          getOptionLabel={(c) => c.name}
                          getOptionValue={(c) => c.id.toString()}
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
                <FormItem>
                  <FormLabel>{t('expenses.user')}</FormLabel>
                  <Input
                    value={`${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || ''}
                    disabled
                  />
                </FormItem>

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
                mode="create"
                showSaveAndCreateNew={showSaveAndCreateNew}
                onIntent={onIntent}
                onCancel={() => navigate('/expenses')}
                loading={loading}
                submitLabel={t('common.add')}
                loadingLabel={t('common.adding')}
              />
            </form>
          </Form>
    </FormPage>
  );
};

export default AddExpense;
