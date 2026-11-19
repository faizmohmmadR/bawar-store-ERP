import { PaymentPartyFinanceSummary } from '@/components/payments/PaymentPartyFinanceSummary';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreditCard } from 'lucide-react';
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
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { AfnReportingPreview } from '@/components/forms/AfnReportingPreview';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage } from '@/components/forms/FormPage';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';
import { Payment } from '@/types/payment';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { getPaymentConfig, PaymentModuleType } from './paymentConfig';
import {
  formatMoney,
  getOrderCurrency,
  getOrderTotal,
  getPartyName,
  OrderRecord,
} from './orderHelpers';
import { AttachedDocumentsField } from '@/components/forms/AttachedDocumentsField';
import {
  draftsFromDocuments,
  paymentDocumentTitleBase,
  syncAttachedDocuments,
  type AttachedDocumentDraft,
} from '@/lib/attachments';

interface EditPaymentPageProps {
  type: PaymentModuleType;
}

const EditPaymentPage = ({ type }: EditPaymentPageProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();
  const config = getPaymentConfig(type);
  const [documents, setDocuments] = useState<AttachedDocumentDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        amount: z
          .string()
          .min(1, messages.required)
          .refine((v) => parseFloat(v) > 0, messages.positive),
        payment_method: z.enum(['cash', 'bank', 'sarafi']),
        payment_date: requiredString(messages.required),
        currency: requiredString(messages.required),
        reference_number: z.string().optional(),
        notes: z.string().optional(),
      }),
    [messages.positive, messages.required],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      payment_date: '',
      payment_method: 'cash',
      amount: '',
      currency: '',
      reference_number: '',
      notes: '',
    },
  });

  const watchedPaymentAmount = useWatch({ control: form.control, name: 'amount' });
  const watchedPaymentCurrency = useWatch({ control: form.control, name: 'currency' });
  const watchedPaymentDate = useWatch({ control: form.control, name: 'payment_date' });


  const { data: payment, isLoading } = useFetchObjects<Payment>({
    queryKey: ['payment', id],
    endpoint: `payments/${id}/`,
    enabled: !!id,
  });

  const orderId = payment?.related_object_details?.id?.toString();

  const { data: orderData } = useFetchObjects<OrderRecord>({
    queryKey: [config.ordersEndpoint, orderId],
    endpoint: `${config.ordersEndpoint}/${orderId}/`,
    enabled: !!orderId,
  });

  const { data: paymentsData } = useFetchObjects({
    queryKey: [config.forOrderEndpoint(orderId || '')],
    endpoint: orderId ? config.forOrderEndpoint(orderId) : 'payments/',
    enabled: !!orderId,
  });

  const totalPaid = useMemo(() => {
    const payments = Array.isArray(paymentsData)
      ? paymentsData
      : paymentsData?.results || [];
    return payments.reduce((sum: number, p: { amount: number }) => sum + Number(p.amount), 0);
  }, [paymentsData]);

  const orderCurrency = orderData ? getOrderCurrency(orderData) : payment?.currency_details || null;
  const orderTotal = orderData ? getOrderTotal(orderData) : 0;
  const totalDue = orderData ? Math.max(0, orderTotal - totalPaid) : 0;

  useEffect(() => {
    if (payment) {
      form.reset({
        payment_date: payment.payment_date
          ? new Date(payment.payment_date).toISOString().slice(0, 10)
          : '',
        payment_method: payment.payment_method || 'cash',
        amount: String(payment.amount ?? ''),
        currency: resolveCurrencyId(payment),
        reference_number: payment.reference_number || '',
        notes: payment.notes || '',
      });
      setDocuments(draftsFromDocuments(payment.documents));
    }
  }, [payment, form]);

  const onSubmit = async (data: z.infer<typeof schema>) => {
    if (!id) return;
    const paymentDate = data.payment_date.includes('T')
      ? data.payment_date
      : `${data.payment_date}T12:00:00`;
    setSaving(true);
    try {
      await api.patch(`/payments/${id}/`, {
        payment_date: paymentDate,
        payment_method: data.payment_method,
        amount: parseFloat(data.amount),
        currency: toCurrencyFkId(data.currency),
        reference_number: data.reference_number || undefined,
        notes: data.notes || undefined,
      });
      await syncAttachedDocuments('payment', id, documents);
      notifySuccess(t('payments.editPayment', 'Payment updated'), {
        title: t('common.success') || 'Success',
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate(config.listPath);
    } catch (error: any) {
      const payload = error?.response?.data;
      const message =
        payload?.error ||
        (payload && typeof payload === 'object' ? Object.values(payload).flat().join('. ') : null) ||
        t('payments.editPayment', 'Could not update payment');
      notifyError(formatApiError(error, String(message)), {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
    } finally {
      setSaving(false);
    }
  };

  const partyName = payment?.related_object_details?.customer_name;

  const documentTitleBase = useMemo(
    () =>
      paymentDocumentTitleBase({
        paymentType: 'sale',
        invoiceNumber:
          orderData?.invoice_number ||
          payment?.related_object_details?.invoice_number ||
          (payment?.related_object_details?.id
            ? `#${payment.related_object_details.id}`
            : null),
        partyName: partyName || (orderData ? getPartyName(orderData, type) : null),
        saleLabel: t('payments.salePayment', 'Sale Payment'),
      }),
    [type, orderData, payment, partyName, t],
  );

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">{t('common.loading')}</div>;
  }

  if (payment?.general_payment) return <Navigate to={`${config.listPath}/general/${payment.general_payment}/edit`} replace />;

  return (
    <FormPage
      title={t('payments.editPayment')}
      icon={<CreditCard />}
      backTo={config.listPath}
    >
      <PaymentPartyFinanceSummary type={type} partyId={type === 'purchase' ? orderData?.vendor_details?.id : orderData?.customer_details?.id} selectedCurrency={watchedPaymentCurrency} />
          {payment?.related_object_details?.invoice_number && (
            <div className="mb-6 p-4 bg-muted/50 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('payments.relatedInvoice')}</p>
                <p className="font-semibold">{payment.related_object_details.invoice_number}</p>
              </div>
              {partyName && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    {t('sales.customer')}
                  </p>
                  <p className="font-semibold">{partyName}</p>
                </div>
              )}
              {orderData && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('payments.totalAmount')}</p>
                    <p className="font-semibold">{formatMoney(orderTotal, orderCurrency)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('payments.totalPaid')}</p>
                    <p className="font-semibold text-primary">{formatMoney(totalPaid, orderCurrency)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('payments.totalDue')}</p>
                    <p className={`font-bold ${totalDue > 0 ? 'text-destructive' : 'text-primary'}`}>
                      {formatMoney(totalDue, orderCurrency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('payments.currency')}</p>
                    <p className="font-semibold">
                      {orderCurrency?.code} ({orderCurrency?.symbol})
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('payments.amount')} *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
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
                      <FormLabel>{t('payments.currency')} *</FormLabel>
                      <FormControl>
                        <CurrencySelect value={field.value} onChange={field.onChange} />
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
                      <FormLabel>{t('payments.paymentMethod', 'Payment method')} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cash">{t('payments.methods.cash', 'Cash')}</SelectItem>
                          <SelectItem value="bank">{t('payments.methods.bank', 'Bank')}</SelectItem>
                          <SelectItem value="sarafi">{t('payments.methods.sarafi', 'Sarafi')}</SelectItem>
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
                      <FormLabel>{t('payments.paymentDate')} *</FormLabel>
                      <DatePickerInput
                        value={field.value?.slice(0, 10) || ''}
                        onChange={field.onChange}
                        placeholder={t('payments.paymentDate')}
                      />
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
                        <Input placeholder={t('payments.enterReferenceNumber')} {...field} />
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
                      <FormLabel>{t('payments.notes')}</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <AfnReportingPreview
            amount={watchedPaymentAmount}
            currencyId={watchedPaymentCurrency}
            atDate={watchedPaymentDate}
          />

              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4">
                <AttachedDocumentsField
                  value={documents}
                  onChange={setDocuments}
                  titleBase={documentTitleBase}
                  disabled={saving}
                />
              </div>

          <FormActions
                onCancel={() => navigate(config.listPath)}
                loading={saving}
                submitLabel={t('common.save')}
                loadingLabel={t('common.saving')}
              />
            </form>
          </Form>
    </FormPage>
  );
};

export default EditPaymentPage;
