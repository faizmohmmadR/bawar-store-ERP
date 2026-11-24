import { PaymentPartyFinanceSummary } from '@/components/payments/PaymentPartyFinanceSummary';
import GeneralPaymentForm from './GeneralPaymentForm';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CreditCard, Building2, Banknote, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { FormActions, type FormSubmitIntent } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import { Autocomplete } from '@/components/ui/autocomplete';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { toCurrencyFkId } from '@/lib/currencies';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import OrderAutocomplete from '@/components/payments/OrderAutocomplete';
import { formMessages, requiredString } from '@/lib/formSchemas';
import {
  DEFAULT_PAYMENT_METHOD,
} from '@/lib/paymentDefaults';
import { cn } from '@/lib/utils';
import { AttachedDocumentsField } from '@/components/forms/AttachedDocumentsField';
import {
  paymentDocumentTitleBase,
  syncAttachedDocuments,
  type AttachedDocumentDraft,
} from '@/lib/attachments';
import api from '@/api/client';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';
import { getPaymentConfig, PaymentModuleType } from './paymentConfig';
import {
  formatMoney,
  getOrderCurrency,
  getOrderCurrencyId,
  getOrderPaid,
  getOrderRemaining,
  getPartyName,
  OrderRecord,
} from './orderHelpers';

interface AddPaymentPageProps {
  type: PaymentModuleType;
}

const PAYMENT_METHODS = [
  {
    value: 'cash' as const,
    icon: Banknote,
    labelKey: 'payments.methods.cash',
    fallback: 'Cash',
    accountHintKey: 'payments.methods.cashAccount',
    accountHintFallback: 'Posts to Cash (1000)',
  },
  {
    value: 'bank' as const,
    icon: Landmark,
    labelKey: 'payments.methods.bank',
    fallback: 'Bank',
    accountHintKey: 'payments.methods.bankAccount',
    accountHintFallback: 'Posts to Bank (1050)',
  },
  {
    value: 'sarafi' as const,
    icon: Building2,
    labelKey: 'payments.methods.sarafi',
    fallback: 'Sarafi',
    accountHintKey: 'payments.methods.sarafiAccount',
    accountHintFallback: 'Posts to Sarafi (1060)',
  },
];

type PartyOption = { id: number; name: string };

const BillPaymentPage = ({ type }: AddPaymentPageProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const config = getPaymentConfig(type);
  const [searchParams] = useSearchParams();
  const preselectedOrderId = searchParams.get(config.orderQueryParam) || '';
  const messages = useMemo(() => formMessages(t), [t]);
  const [cachedOrder, setCachedOrder] = useState<OrderRecord | null>(null);
  const [documents, setDocuments] = useState<AttachedDocumentDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const isPurchase = type === 'purchase';
  const partyLabel = isPurchase
    ? t('payments.selectVendor', 'Select vendor')
    : t('payments.selectCustomer', 'Select customer');
  const orderLabel = isPurchase
    ? t('payments.selectPurchase', 'Select purchase')
    : t('payments.selectSale');

  const schema = useMemo(
    () =>
      z.object({
        // Walk-in sales have no customer; party is optional for sale payments.
        partyId: z.string().optional().default(''),
        orderId: requiredString(orderLabel),
        payment_method: z.enum(['cash', 'bank', 'sarafi']),
        amount: z
          .string()
          .min(1, messages.required)
          .refine((v) => parseFloat(v) > 0, messages.positive),
        payment_date: requiredString(messages.required),
        currency: requiredString(messages.required),
        reference_number: z.string().optional(),
        notes: z.string().optional(),
      }).superRefine((data, ctx) => {
        if (isPurchase && !data.partyId) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: partyLabel, path: ['partyId'] });
        }
      }),
    [isPurchase, messages.positive, messages.required, orderLabel, partyLabel],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      partyId: '',
      orderId: preselectedOrderId,
      payment_method: DEFAULT_PAYMENT_METHOD,
      payment_date: new Date().toISOString().slice(0, 10),
      amount: '',
      currency: '',
      reference_number: '',
      notes: '',
    },
  });

  const watchedPaymentAmount = useWatch({ control: form.control, name: 'amount' });
  const watchedPaymentCurrency = useWatch({ control: form.control, name: 'currency' });
  const watchedPaymentDate = useWatch({ control: form.control, name: 'payment_date' });


  const submitIntent = useRef<FormSubmitIntent>('save');

  const resetForAnother = () => {
    form.reset({
      partyId: '',
      orderId: '',
      payment_method: DEFAULT_PAYMENT_METHOD,
      payment_date: new Date().toISOString().slice(0, 10),
      amount: '',
      currency: '',
      reference_number: '',
      notes: '',
    });
    setCachedOrder(null);
    setDocuments([]);
  };

  const partyId = form.watch('partyId');
  const orderId = form.watch('orderId');
  const paymentMethod = form.watch('payment_method');

  // Only fetch when deep-linked with ?sale=/purchase= and no autocomplete selection yet.
  // Autocomplete options already include paid/remaining — avoid slow detail + payments round-trips.
  const needsPreselectFetch =
    !!preselectedOrderId && orderId === preselectedOrderId && !cachedOrder;

  const { data: fetchedOrder } = useFetchObjects<OrderRecord>({
    queryKey: [config.ordersEndpoint, 'payment-preselect', orderId],
    endpoint: `${config.ordersEndpoint}/${orderId}/`,
    enabled: needsPreselectFetch,
  });

  const selectedOrder = cachedOrder || fetchedOrder || null;

  useEffect(() => {
    if (!fetchedOrder) return;
    setCachedOrder(fetchedOrder);
    const party = isPurchase
      ? fetchedOrder.vendor_details?.id
      : fetchedOrder.customer_details?.id;
    if (party && !form.getValues('partyId')) {
      form.setValue('partyId', String(party));
    }
  }, [fetchedOrder, form, isPurchase]);

  const totalPaid = selectedOrder ? getOrderPaid(selectedOrder) : 0;
  const totalDue = selectedOrder
    ? Math.max(0, getOrderRemaining(selectedOrder))
    : 0;

  useEffect(() => {
    if (!selectedOrder) return;
    const currencyId = getOrderCurrencyId(selectedOrder);
    if (currencyId) {
      form.setValue('currency', currencyId, { shouldValidate: true, shouldDirty: true });
    }
    if (totalDue > 0) {
      form.setValue('amount', totalDue.toFixed(2), { shouldValidate: true });
    }
  }, [selectedOrder, totalDue, form]);

  const handlePartyChange = (value: string | number | null) => {
    const next = value?.toString() || '';
    form.setValue('partyId', next, { shouldValidate: true });
    form.setValue('orderId', '');
    form.setValue('amount', '');
    form.setValue('currency', '');
    setCachedOrder(null);
    setDocuments([]);
  };

  const handleOrderChange = (value: string, option?: OrderRecord | null) => {
    form.setValue('orderId', value, { shouldValidate: true });
    setDocuments([]);
    if (!value) {
      setCachedOrder(null);
      form.setValue('amount', '');
      form.setValue('currency', '');
      return;
    }
    setCachedOrder(option || null);
    const currencyId = option ? getOrderCurrencyId(option) : '';
    if (currencyId) {
      form.setValue('currency', currencyId, { shouldValidate: true, shouldDirty: true });
    }
    const remaining = option ? getOrderRemaining(option) : 0;
    if (remaining > 0) {
      form.setValue('amount', remaining.toFixed(2), { shouldValidate: true });
    }
    const party = isPurchase
      ? option?.vendor_details?.id
      : option?.customer_details?.id;
    if (party) {
      form.setValue('partyId', String(party), { shouldValidate: true });
    }
  };

  const currency = selectedOrder ? getOrderCurrency(selectedOrder) : null;
  const addTitle = isPurchase
    ? t('payments.addPurchasePayment')
    : t('payments.addSalePayment');
  const documentTitleBase = useMemo(() => {
    if (!selectedOrder) return '';
    const invoice =
      selectedOrder.invoice_number ||
      (selectedOrder.id ? `#${selectedOrder.id}` : '');
    return paymentDocumentTitleBase({
      paymentType: isPurchase ? 'purchase' : 'sale',
      invoiceNumber: invoice,
      partyName: getPartyName(selectedOrder, type),
      saleLabel: isPurchase
        ? t('payments.purchasePayment', 'Purchase Payment')
        : t('payments.salePayment', 'Sale Payment'),
    });
  }, [type, selectedOrder, t, isPurchase]);

  const onSubmit = async (data: z.infer<typeof schema>) => {
    if (selectedOrder) {
      const due = getOrderRemaining(selectedOrder);
      if (due > 0 && parseFloat(data.amount) > due) {
        form.setError('amount', { message: t('payments.exceedsBalance') });
        return;
      }
    }

    const paymentDate = data.payment_date.includes('T')
      ? data.payment_date
      : `${data.payment_date}T12:00:00`;

    setSaving(true);
    try {
      const { data: payment } = await api.post<{ id: number }>('/payments/', {
        content_type: config.contentType,
        object_id: parseInt(data.orderId, 10),
        payment_type: config.paymentType,
        payment_method: data.payment_method,
        payment_date: paymentDate,
        amount: parseFloat(data.amount),
        currency: toCurrencyFkId(data.currency),
        reference_number: data.reference_number || undefined,
        notes: data.notes || undefined,
      });
      if (documents.length) {
        await syncAttachedDocuments('payment', payment.id, documents);
      }
      notifySuccess(t('payments.addPayment', 'Payment added'), {
        title: t('common.success') || 'Success',
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      if (submitIntent.current === 'save_and_new') {
        resetForAnother();
        submitIntent.current = 'save';
      } else {
        navigate(config.listPath);
      }
    } catch (error: any) {
      const payload = error?.response?.data;
      const message =
        payload?.error ||
        (payload && typeof payload === 'object' ? Object.values(payload).flat().join('. ') : null) ||
        t('payments.addPayment', 'Could not save payment');
      notifyError(formatApiError(error, String(message)), {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPage title={addTitle} icon={<CreditCard />} backTo={config.listPath}
      headerActions={<Button variant="outline" onClick={() => navigate(config.addPath)}>{t('payments.generalAdd', 'General payment')}</Button>}>
      <PaymentPartyFinanceSummary type={type} partyId={partyId} selectedCurrency={watchedPaymentCurrency} />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageFields>
            {/* Customer/Vendor + Sale/Purchase in one row */}
            <FormField
              control={form.control}
              name="partyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isPurchase
                      ? t('rawMaterialPurchases.vendor', 'Vendor')
                      : t('sales.customer', 'Customer')}
                    {isPurchase ? ' *' : ''}
                  </FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint={config.partyEndpoint}
                      value={field.value}
                      onChange={handlePartyChange}
                      placeholder={
                        isPurchase
                          ? partyLabel
                          : t('sales.walkInOptional', 'Walk-in (optional)')
                      }
                      getOptionLabel={(p: PartyOption) => p.name}
                      getOptionValue={(p: PartyOption) => p.id.toString()}
                      disabled={!!preselectedOrderId && !!partyId}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="orderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isPurchase
                      ? t('payments.relatedPurchase', 'Related purchase')
                      : t('payments.relatedSale')}{' '}
                    *
                  </FormLabel>
                  <FormControl>
                    <OrderAutocomplete
                      type={type}
                      value={field.value}
                      onChange={handleOrderChange}
                      placeholder={
                        isPurchase && !partyId
                          ? t('payments.selectCustomerFirst', 'Select a customer first')
                          : orderLabel
                      }
                      partyId={partyId || undefined}
                      disabled={
                        (isPurchase && !partyId) || (!!preselectedOrderId && !!orderId)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedOrder && (
              <>
                <div className="grid grid-cols-1 gap-4 rounded-lg bg-muted/50 p-4 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t('sales.invoiceNumber')}
                    </p>
                    <p className="font-semibold">{selectedOrder.invoice_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t('sales.customer')}
                    </p>
                    <p className="font-semibold">{getPartyName(selectedOrder, type)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('payments.totalPaid')}</p>
                    <p className="font-semibold text-primary">
                      {formatMoney(totalPaid, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('payments.totalDue')}</p>
                    <p className={`font-bold ${totalDue > 0 ? 'text-destructive' : 'text-primary'}`}>
                      {formatMoney(totalDue, currency)}
                    </p>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="payment_method"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t('payments.paymentMethod', 'Payment method')} *</FormLabel>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {PAYMENT_METHODS.map((method) => {
                          const Icon = method.icon;
                          const active = field.value === method.value;
                          return (
                            <button
                              key={method.value}
                              type="button"
                              onClick={() => field.onChange(method.value)}
                              className={cn(
                                'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                                active
                                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                  : 'border-border hover:bg-muted/40',
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-primary" />
                                <span className="text-sm font-semibold">
                                  {t(method.labelKey, method.fallback)}
                                </span>
                              </div>
                              <span className="text-[11px] text-muted-foreground">
                                {t(method.accountHintKey, method.accountHintFallback)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{t('payments.amount')} *</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={totalDue > 0 ? totalDue : undefined}
                            placeholder="0.00"
                            {...field}
                          />
                        </FormControl>
                        {totalDue > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => form.setValue('amount', totalDue.toFixed(2))}
                          >
                            {t('payments.payRemaining')}
                          </Button>
                        )}
                      </div>
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
                        <CurrencySelect
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('payments.selectCurrency')}
                          disabled
                          autoSelectBase={false}
                        />
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
                        <Textarea
                          placeholder={t('payments.enterNotes')}
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="sm:col-span-2">
                  <AfnReportingPreview
                    amount={watchedPaymentAmount}
                    currencyId={watchedPaymentCurrency}
                    atDate={watchedPaymentDate}
                  />
                </div>

                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  {t(
                    'payments.methodAccountingHint',
                    'Accounting will post this payment to the GL account for',
                  )}{' '}
                  <span className="font-medium text-foreground">
                    {t(`payments.methods.${paymentMethod}`, paymentMethod)}
                  </span>
                  .
                </p>

                <div className="sm:col-span-2 rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4">
                  <AttachedDocumentsField
                    value={documents}
                    onChange={setDocuments}
                    titleBase={documentTitleBase}
                    disabled={saving}
                  />
                </div>
              </>
            )}
          </FormPageFields>

          <FormActions
            mode="create"
            onCancel={() => navigate(config.listPath)}
            loading={saving}
            submitLabel={t('common.add')}
            loadingLabel={t('common.adding')}
            showSaveAndCreateNew
            onIntent={(intent) => {
              submitIntent.current = intent;
            }}
          />
        </form>
      </Form>
    </FormPage>
  );
};

const AddPaymentPage = ({ type }: AddPaymentPageProps) => {
  const [params] = useSearchParams();
  const config = getPaymentConfig(type);
  return params.get(config.orderQueryParam) || params.get('mode') === 'bill'
    ? <BillPaymentPage type={type} />
    : <GeneralPaymentForm type={type} />;
};

export default AddPaymentPage;
