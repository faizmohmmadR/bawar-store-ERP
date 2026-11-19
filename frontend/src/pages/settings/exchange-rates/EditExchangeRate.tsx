import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import useUpdate from '@/api/useUpdate';
import useFetchObjects from '@/api/useFetchObjects';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, requiredString } from '@/lib/formSchemas';
import {
  getBaseCurrency,
} from '@/lib/currencyChoices';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';

export const EditExchangeRate = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();
  const messages = useMemo(() => formMessages(t), [t]);

  const { data: exchangeRate } = useFetchObjects({
    queryKey: ['exchange-rate', id],
    endpoint: `exchange-rates/${id}/`,
    enabled: !!id,
  });

  const baseCurrency = getBaseCurrency();

  const schema = useMemo(
    () =>
      z
        .object({
          from_currency: requiredString(messages.required),
          to_currency: requiredString(messages.required),
          rate: z.coerce
            .number()
            .positive(t('settings.exchangeRates.rateError', 'Rate must be positive')),
          date: requiredString(messages.required),
          is_active: z.boolean(),
        })
        .superRefine((data, ctx) => {
          if (data.from_currency && data.to_currency && data.from_currency === data.to_currency) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('settings.exchangeRates.sameCurrencyError'),
              path: ['to_currency'],
            });
          }
        }),
    [messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      from_currency: '',
      to_currency: '',
      rate: 0,
      date: new Date().toISOString().slice(0, 16),
      is_active: true,
    },
  });

  const { handleUpdate, isSuccess, loading } = useUpdate({
    queryKey: ['exchange-rates'],
  });

  useEffect(() => {
    if (exchangeRate) {
      form.reset({
        from_currency: resolveCurrencyId({
          currency: exchangeRate.from_currency,
          currency_details: exchangeRate.from_currency_details,
        }),
        to_currency:
          resolveCurrencyId({
            currency: exchangeRate.to_currency,
            currency_details: exchangeRate.to_currency_details,
          }) || (baseCurrency?.id ? String(baseCurrency.id) : ''),
        rate: exchangeRate.rate || 0,
        date: exchangeRate.date
          ? new Date(exchangeRate.date).toISOString().slice(0, 16)
          : new Date().toISOString().slice(0, 16),
        is_active: exchangeRate.is_active ?? true,
      });
    }
  }, [exchangeRate, baseCurrency, form]);

  useRedirectOnSuccess(isSuccess, '/settings/exchange-rates');

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!id) return;

    handleUpdate(id, {
      ...data,
      from_currency: toCurrencyFkId(data.from_currency),
      to_currency: toCurrencyFkId(data.to_currency),
      date: new Date(data.date).toISOString(),
    });
  };

  return (
    <FormPage
      title={t('settings.exchangeRates.edit')}
      icon={<TrendingUp />}
      backTo="/settings/exchange-rates"
      maxWidth="2xl"
    >
<Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormPageFields>
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

                <FormField
                  control={form.control}
                  name="to_currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.exchangeRates.toCurrency')} *</FormLabel>
                      <FormControl>
                        <CurrencySelect
                          value={field.value}
                          onChange={(value) => field.onChange(value?.toString() || '')}
                          includeIds={baseCurrency ? [baseCurrency.id] : undefined}
                          disabled
                          placeholder={t('settings.exchangeRates.selectCurrency')}
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
                  name="rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.exchangeRates.rate')}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="1.00"
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
                onCancel={() => navigate('/settings/exchange-rates')}
                loading={loading}
                submitLabel={t('common.update')}
                loadingLabel={t('common.updating')}
              />
            </form>
          </Form>
    </FormPage>
  );
};
