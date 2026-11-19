import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TrendingUp } from 'lucide-react';import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import useFetchObjects from '@/api/useFetchObjects';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages, requiredString } from '@/lib/formSchemas';
import {
  getBaseCurrency,
} from '@/lib/currencyChoices';
import { toCurrencyFkId } from '@/lib/currencies';

const getCurrentDateTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const AddExchangeRate = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const messages = useMemo(() => formMessages(t), [t]);

  const baseCurrency = getBaseCurrency();
  const baseCurrencyId = baseCurrency?.id ? String(baseCurrency.id) : '';

  const schema = useMemo(
    () =>
      z.object({
        from_currency: requiredString(messages.required),
        rate: z.coerce
          .number()
          .positive(t('settings.exchangeRates.rateError', 'Rate must be positive')),
        date: requiredString(messages.required),
        is_active: z.boolean(),
      }),
    [messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      from_currency: '',
      rate: 0,
      date: getCurrentDateTime(),
      is_active: true,
    },
  });

  const { handleAdd, isSuccess, loading } = useAdd({
    queryKey: ['exchange-rates'],
    endpoint: 'exchange-rates/',
  });

  const onReset = useCallback(() => {
    form.reset();
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/settings/exchange-rates',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!baseCurrencyId) return;

    handleAdd({
      from_currency: toCurrencyFkId(data.from_currency),
      to_currency: toCurrencyFkId(baseCurrencyId),
      rate: data.rate,
      date: new Date(data.date).toISOString(),
      is_active: data.is_active,
    });
  };

  return (
    <FormPage
      title={t('settings.exchangeRates.add')}
      icon={<TrendingUp />}
      backTo="/settings/exchange-rates"
      maxWidth="2xl"
      description={
        baseCurrency
          ? `${t('settings.exchangeRates.rateToBase')}: 1 {currency} = ? ${baseCurrency.code}`
          : undefined
      }
    >
      <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="from_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.exchangeRates.fromCurrency')} *</FormLabel>
                    <FormControl>
                      <CurrencySelect
                        value={field.value}
                        onChange={(value) => field.onChange(value?.toString() || '')}
                        excludeBase
                        placeholder={t('settings.exchangeRates.selectCurrency')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormPageFields>
                <FormField
                  control={form.control}
                  name="rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('settings.exchangeRates.rate')}
                        {baseCurrency ? ` → ${baseCurrency.code}` : ''}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.000001"
                          placeholder="87.20"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.exchangeRates.date')}</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel>{t('common.active')}</FormLabel>
                  </FormItem>
                )}
              />

              <FormActions
                mode="create"
                showSaveAndCreateNew={showSaveAndCreateNew}
                onIntent={onIntent}
                onCancel={() => navigate('/settings/exchange-rates')}
                loading={loading || !baseCurrencyId}
                submitLabel={t('common.add')}
                loadingLabel={t('common.adding')}
              />
            </form>
          </Form>
    </FormPage>
  );
};
