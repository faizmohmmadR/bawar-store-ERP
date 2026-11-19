import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
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
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { LoanPaymentMethodPicker } from '@/components/loans/LoanPaymentMethodPicker';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import { formMessages, requiredString } from '@/lib/formSchemas';
import api from '@/api/client';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import { FALLBACK_BASE_SYMBOL } from '@/lib/currencies';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import type {
  SalesmanCommissionPayment,
  SalesmanCommissionSummary,
} from '@/types/salesmanCommissionPayment';

const EditSalesmanCommissionPayment = () => {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();
  const messages = useMemo(() => formMessages(t), [t]);
  const [saving, setSaving] = useState(false);
  const afnSymbol = resolveCurrencySymbol(1) || FALLBACK_BASE_SYMBOL;

  const schema = useMemo(
    () =>
      z.object({
        payment_method: z.enum(['cash', 'bank', 'sarafi']),
        amount: z
          .string()
          .min(1, messages.required)
          .refine((v) => parseFloat(v) > 0, messages.positive),
        payment_date: requiredString(messages.required),
        reference_number: z.string().optional(),
        notes: z.string().optional(),
      }),
    [messages.positive, messages.required],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      payment_method: 'cash',
      payment_date: '',
      amount: '',
      reference_number: '',
      notes: '',
    },
  });

  const { data: payment, isLoading } = useFetchObjects<SalesmanCommissionPayment>({
    queryKey: ['salesman-commission-payments', id],
    endpoint: `salesman-commission-payments/${id}`,
    enabled: !!id,
  });

  const salesmanId = payment?.salesman ? String(payment.salesman) : '';

  const { data: summary } = useFetchObjects<SalesmanCommissionSummary>({
    queryKey: ['salesmen', salesmanId, 'commission-summary'],
    endpoint: `salesmen/${salesmanId}/commission-summary`,
    enabled: !!salesmanId,
  });

  // Backend excludes this payment from "paid"; remaining + current amount = editable max
  const maxPayable =
    Number(summary?.commission_balance ?? 0) + Number(payment?.amount ?? 0);

  useEffect(() => {
    if (!payment) return;
    const date = payment.payment_date
      ? String(payment.payment_date).slice(0, 10)
      : '';
    form.reset({
      payment_method: payment.payment_method || 'cash',
      payment_date: date,
      amount: String(payment.amount ?? ''),
      reference_number: payment.reference_number || '',
      notes: payment.notes || '',
    });
  }, [payment, form]);

  const onSubmit = async (data: z.infer<typeof schema>) => {
    if (!id) return;
    const amount = parseFloat(data.amount);
    if (maxPayable > 0 && amount > maxPayable + 0.01) {
      form.setError('amount', { message: t('payments.exceedsBalance') });
      return;
    }
    const paymentDate = data.payment_date.includes('T')
      ? data.payment_date
      : `${data.payment_date}T12:00:00`;

    setSaving(true);
    try {
      await api.patch(`/salesman-commission-payments/${id}/`, {
        payment_method: data.payment_method,
        payment_date: paymentDate,
        amount,
        reference_number: data.reference_number || '',
        notes: data.notes || '',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['salesmen'] }),
        queryClient.invalidateQueries({ queryKey: ['salesman-commission-payments'] }),
      ]);
      notifySuccess(t('salesmen.commissionPaymentSaved'), {
        title: t('common.success') || 'Success',
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate(`/salesman-commission-payments/${id}`);
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

  if (isLoading && !payment) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {t('salesmen.commissionPaymentNotFound')}
      </div>
    );
  }

  return (
    <FormPage
      title={t('salesmen.editCommissionPayment')}
      icon={<Wallet />}
      backTo={`/salesman-commission-payments/${id}`}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageFields>
            <div className="sm:col-span-2 rounded-lg border bg-muted/40 p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{t('salesmen.name')}</p>
              <p className="font-semibold">
                {payment.salesman_details?.name || `#${payment.salesman}`}
              </p>
              {summary && (
                <p className="text-sm text-muted-foreground">
                  {t('salesmen.commissionBalance')}:{' '}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatOrderNumeric(maxPayable)} {afnSymbol}
                  </span>
                </p>
              )}
            </div>

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
            mode="edit"
            onCancel={() => navigate(`/salesman-commission-payments/${id}`)}
            loading={saving}
            submitLabel={t('common.save')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default EditSalesmanCommissionPayment;
