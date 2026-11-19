import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DollarSign } from 'lucide-react';import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Autocomplete } from '@/components/ui/autocomplete';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage } from '@/components/forms/FormPage';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import type { Loan } from '@/types/loan';
import useUpdate from '@/api/useUpdate';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';
import { getDefaultLoanTypeForLoaner, getLoanTypeOptions } from '@/lib/loanUtils';
import { LoanScenarioHint } from '@/components/loans/LoanScenarioHint';
import { LoanPaymentMethodPicker } from '@/components/loans/LoanPaymentMethodPicker';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, requiredString } from '@/lib/formSchemas';

const EditLoan = () => {
  const { id } = useParams();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z
        .object({
          loaner_type: z.enum(['customer', 'vendor']),
          customer: z.string().optional(),
          vendor: z.string().optional(),
          amount: requiredString(t('loans.validation.amount')).refine(
            (val) => parseFloat(val) > 0,
            { message: t('loans.validation.amount') },
          ),
          loan_type: z.string().min(1),
          payment_method: z.enum(['cash', 'bank', 'sarafi']),
          currency: requiredString(t('loans.validation.currency')),
          loan_date: requiredString(messages.required),
          bill_number: z.string().optional(),
          notes: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          if (data.loaner_type === 'customer' && !data.customer) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('loans.validation.customer'),
              path: ['customer'],
            });
          }
          if (data.loaner_type === 'vendor' && !data.vendor) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('loans.validation.vendor'),
              path: ['vendor'],
            });
          }
        }),
    [messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      loaner_type: 'customer',
      customer: '',
      vendor: '',
      amount: '',
      loan_type: 'loan_in',
      payment_method: 'cash',
      currency: '',
      loan_date: '',
      bill_number: '',
      notes: '',
    },
  });

  const loanerType = form.watch('loaner_type');
  const loanType = form.watch('loan_type');

  const { data: loanData, isLoading } = useFetchObjects<Loan>({
    queryKey: ['loan', id],
    endpoint: `loans/${id}/`,
    enabled: !!id,
  });

  const hasPayments = (loanData?.payments?.length || 0) > 0;

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['loans'],
    endpoint: 'loans',
  });

  useEffect(() => {
    if (loanData) {
      form.reset({
        loaner_type: loanData.loaner_type || 'customer',
        customer: loanData.customer ? String(loanData.customer) : '',
        vendor: loanData.vendor ? String(loanData.vendor) : '',
        amount: loanData.amount?.toString() || '',
        loan_type: loanData.loan_type || 'loan_in',
        payment_method: loanData.payment_method || 'cash',
        currency: resolveCurrencyId(loanData),
        loan_date: loanData.loan_date?.slice(0, 16) || '',
        bill_number: loanData.bill_number || '',
        notes: loanData.notes || '',
      });
    }
  }, [loanData, form]);

  useRedirectOnSuccess(isSuccess, '/loans');

  const onSubmit = (data: z.infer<typeof schema>) => {
    const submitData: Record<string, unknown> = {
      loaner_type: data.loaner_type,
      amount: parseFloat(data.amount),
      loan_type: data.loan_type,
      payment_method: data.payment_method || 'cash',
      currency: toCurrencyFkId(data.currency),
      loan_date: data.loan_date,
    };

    if (data.loaner_type === 'customer') {
      submitData.customer = data.customer;
    } else {
      submitData.vendor = data.vendor;
    }

    if (data.bill_number) submitData.bill_number = data.bill_number;
    if (data.notes) submitData.notes = data.notes;

    handleUpdate(id!, submitData);
  };

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-screen">{t('common.loading')}</div>;
  }

  return (
    <FormPage
      title={t('loans.editLoan')}
      icon={<DollarSign />}
      backTo="/loans"
    >
<Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
                <FormField
                  control={form.control}
                  name="loaner_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loans.loanerType')} *</FormLabel>
                      <Select
                        disabled={hasPayments}
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue('customer', '');
                          form.setValue('vendor', '');
                          form.setValue('loan_type', getDefaultLoanTypeForLoaner(value));
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="customer">{t('loans.loanerTypes.customer')}</SelectItem>
                          <SelectItem value="vendor">{t('loans.loanerTypes.vendor')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {loanerType === 'customer' ? (
                  <FormField
                    control={form.control}
                    name="customer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('loans.customer')} *</FormLabel>
                        <FormControl>
                          <Autocomplete
                            disabled={hasPayments}
                            endpoint="customers"
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={t('loans.selectCustomer')}
                            getOptionLabel={(c) => c.name}
                            getOptionValue={(c) => c.id.toString()}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="vendor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('loans.vendor')} *</FormLabel>
                        <FormControl>
                          <Autocomplete
                            disabled={hasPayments}
                            endpoint="vendors"
                            value={field.value}
                            onChange={field.onChange}
                            placeholder={t('loans.selectVendor')}
                            getOptionLabel={(v) => v.name}
                            getOptionValue={(v) => v.id.toString()}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loans.amount')} *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min={String(loanData?.amount_paid || 0)}
                          placeholder={t('loans.enterAmount')}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="loan_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loans.loanType')} *</FormLabel>
                      <Select disabled={hasPayments} value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {getLoanTypeOptions(loanerType, t).map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <LoanScenarioHint variant="banner" loanerType={loanerType} loanType={loanType} />

              {!loanData?.is_opening_balance && !loanData?.source_payment && (
                <FormField
                  control={form.control}
                  name="payment_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loans.paymentAccount', 'Paid from / Received in')} *</FormLabel>
                      <FormControl>
                        <LoanPaymentMethodPicker
                          value={field.value}
                          onChange={field.onChange}
                          movement={loanType === 'loan_in' ? 'increase' : 'decrease'}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loans.currency')} *</FormLabel>
                      <FormControl>
                        <CurrencySelect
                          disabled={hasPayments}
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('loans.selectCurrency')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="loan_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loans.loanDate')} *</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="bill_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('loans.billNumber')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('loans.enterBillNumber')} {...field} />
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
                    <FormLabel>{t('loans.notes')}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t('loans.enterNotes')} rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormActions
                onCancel={() => navigate('/loans')}
                loading={loading}
                submitLabel={t('common.save')}
                loadingLabel={t('common.saving')}
              />
            </form>
          </Form>
    </FormPage>
  );
};

export default EditLoan;
