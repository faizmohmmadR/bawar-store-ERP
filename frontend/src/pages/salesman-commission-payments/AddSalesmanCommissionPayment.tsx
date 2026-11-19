import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Wallet } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import { Autocomplete } from '@/components/ui/autocomplete';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { LoanPaymentMethodPicker } from '@/components/loans/LoanPaymentMethodPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { DEFAULT_PAYMENT_METHOD } from '@/lib/paymentDefaults';
import api from '@/api/client';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import { FALLBACK_BASE_SYMBOL } from '@/lib/currencies';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import type { SalesmanCommissionSummary } from '@/types/salesmanCommissionPayment';

const AddSalesmanCommissionPayment = () => {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselected = searchParams.get('salesman_id') || '';
  const messages = useMemo(() => formMessages(t), [t]);
  const [saving, setSaving] = useState(false);
  const afnSymbol = resolveCurrencySymbol(1) || FALLBACK_BASE_SYMBOL;

  const schema = useMemo(
    () =>
      z.object({
        salesman: requiredString(t('salesmen.name')),
        payment_method: z.enum(['cash', 'bank', 'sarafi']),
        amount: z
          .string()
          .min(1, messages.required)
          .refine((v) => parseFloat(v) > 0, messages.positive),
        payment_date: requiredString(messages.required),
        reference_number: z.string().optional(),
        notes: z.string().optional(),
      }),
    [messages.positive, messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      salesman: preselected,
      payment_method: DEFAULT_PAYMENT_METHOD,
      payment_date: new Date().toISOString().slice(0, 10),
      amount: '',
      reference_number: '',
      notes: '',
    },
  });

  const salesmanId = useWatch({ control: form.control, name: 'salesman' });

  const { data: summary } = useFetchObjects<SalesmanCommissionSummary>({
    queryKey: ['salesmen', salesmanId, 'commission-summary'],
    endpoint: `salesmen/${salesmanId}/commission-summary`,
    enabled: !!salesmanId,
  });

  const balance = Number(summary?.commission_balance ?? 0);

  useEffect(() => {
    if (balance > 0) {
      form.setValue('amount', balance.toFixed(2));
    }
  }, [balance, form]);

  const onSubmit = async (data: z.infer<typeof schema>) => {
    const amount = parseFloat(data.amount);
    if (balance > 0 && amount > balance + 0.01) {
      form.setError('amount', { message: t('payments.exceedsBalance') });
      return;
    }
    const paymentDate = data.payment_date.includes('T')
      ? data.payment_date
      : `${data.payment_date}T12:00:00`;

    setSaving(true);
    try {
      const { data: payment } = await api.post<{ id: number }>(
        '/salesman-commission-payments/',
        {
          salesman: parseInt(data.salesman, 10),
          payment_method: data.payment_method,
          payment_date: paymentDate,
          amount,
          reference_number: data.reference_number || undefined,
          notes: data.notes || undefined,
        },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['salesmen'] }),
        queryClient.invalidateQueries({ queryKey: ['salesman-commission-payments'] }),
      ]);
      notifySuccess(t('salesmen.commissionPaymentSaved'), {
        title: t('common.success') || 'Success',
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate(`/salesman-commission-payments/${payment.id}`);
    } catch (error: unknown) {
      const payload = (error as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const message =
        (Array.isArray(payload?.amount) ? payload?.amount?.[0] : null) ||
        payload?.error ||
        (payload && typeof payload === 'object'
          ? Object.values(payload).flat().join('. ')
          : null) ||
        t('common.error');
      notifyError(formatApiError(error, String(message)), {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPage
      title={t('salesmen.payCommission')}
      icon={<Wallet />}
      backTo="/salesman-commission-payments"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageFields>
            <FormField
              control={form.control}
              name="salesman"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('salesmen.name')} *</FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="salesmen"
                      value={field.value}
                      onChange={(v) => field.onChange(v ? String(v) : '')}
                      placeholder={t('salesmen.selectSalesman')}
                      getOptionLabel={(o: { name?: string }) => o.name || ''}
                      getOptionValue={(o: { id?: number | string }) => String(o.id ?? '')}
                      queryParams={{ outstanding: 1 }}
                      disabled={!!preselected}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {salesmanId && summary && (
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('salesmen.commissionEarned')}
                  </p>
                  <p className="font-semibold tabular-nums">
                    {formatOrderNumeric(Number(summary.commission_earned || 0))} {afnSymbol}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('salesmen.commissionPaid')}
                  </p>
                  <p className="font-semibold tabular-nums">
                    {formatOrderNumeric(Number(summary.commission_paid || 0))} {afnSymbol}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('salesmen.commissionBalance')}
                  </p>
                  <p className="font-bold tabular-nums text-primary">
                    {formatOrderNumeric(balance)} {afnSymbol}
                  </p>
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="payment_method"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>{t('payments.paymentMethod')} *</FormLabel>
                  <LoanPaymentMethodPicker
                    value={field.value}
                    onChange={field.onChange}
                    movement="decrease"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('salesmen.commissionAfn')} *</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" placeholder="0.00" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payment_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('payments.paymentDate')} *</FormLabel>
                  <FormControl>
                    <DatePickerInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reference_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('payments.referenceNumber')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="SCP-001" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>{t('common.notes')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormPageFields>

          <FormActions
            mode="create"
            onCancel={() => navigate('/salesman-commission-payments')}
            loading={saving}
            submitLabel={t('salesmen.payCommission')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddSalesmanCommissionPayment;
