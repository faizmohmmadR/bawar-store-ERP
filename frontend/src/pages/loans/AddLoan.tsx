import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DollarSign } from 'lucide-react';import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Autocomplete } from '@/components/ui/autocomplete';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { toCurrencyFkId } from '@/lib/currencies';
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
import { Checkbox } from '@/components/ui/checkbox';
import useAdd from '@/api/useAdd';
import { getDefaultLoanTypeForLoaner, getLoanTypeOptions } from '@/lib/loanUtils';
import { LoanScenarioHint } from '@/components/loans/LoanScenarioHint';
import { LoanPaymentMethodPicker } from '@/components/loans/LoanPaymentMethodPicker';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages, requiredString } from '@/lib/formSchemas';

const AddLoan = () => {
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
          is_opening_balance: z.boolean(),
          loan_type: z.string().min(1),
          payment_method: z.enum(['cash', 'bank', 'sarafi']),
          currency: requiredString(t('loans.validation.currency')),
          loan_date: requiredString(messages.required),
          bill_number: z.string().optional(),
          notes: z.string().optional(),
          bill_file: z.instanceof(File).nullable().optional(),
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
      is_opening_balance: false,
      loan_type: 'loan_out',
      payment_method: 'cash',
      currency: '',
      loan_date: new Date().toISOString().slice(0, 16),
      bill_number: '',
      notes: '',
      bill_file: null,
    },
  });

  const loanerType = form.watch('loaner_type');
  const isOpeningBalance = form.watch('is_opening_balance');
  const loanType = form.watch('loan_type');

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['loans'],
    endpoint: 'loans/',
    showSuccessToast: true,
    showErrorToast: true,
  });

  const onReset = useCallback(() => {
    form.reset();
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/loans',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    const submitData = new FormData();
    submitData.append('loaner_type', data.loaner_type);

    if (data.loaner_type === 'customer') {
      submitData.append('customer', data.customer!);
    } else {
      submitData.append('vendor', data.vendor!);
    }

    submitData.append('amount', data.amount);
    submitData.append('loan_type', data.loan_type);
    submitData.append('payment_method', data.payment_method || 'cash');
    submitData.append('currency', String(toCurrencyFkId(data.currency)));
    submitData.append('loan_date', data.loan_date);
    submitData.append('is_opening_balance', data.is_opening_balance ? 'true' : 'false');

    if (data.bill_number) submitData.append('bill_number', data.bill_number);
    if (data.notes) submitData.append('notes', data.notes);
    if (data.bill_file) submitData.append('bill_file', data.bill_file);

    handleAdd(submitData);
  };

  return (
    <FormPage
      title={t('loans.addLoan')}
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
                      <FormLabel>
                        {isOpeningBalance ? t('loans.remainingBalance') : t('loans.amount')} *
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={t('loans.enterAmount')}
                          {...field}
                        />
                      </FormControl>
                      {isOpeningBalance && (
                        <p className="text-xs text-muted-foreground">{t('loans.remainingBalanceHint')}</p>
                      )}
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
                      <Select value={field.value} onValueChange={field.onChange}>
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

              <div className="rounded-lg border bg-muted/30 p-4">
                <FormField
                  control={form.control}
                  name="is_opening_balance"
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                      </FormControl>
                      <div className="space-y-1">
                        <Label className="font-medium cursor-pointer">{t('loans.openingBalance')}</Label>
                        <p className="text-sm text-muted-foreground">{t('loans.openingBalanceDesc')}</p>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {!isOpeningBalance && (
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
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
                  name="bill_file"
                  render={({ field: { value, onChange, ...field } }) => (
                    <FormItem>
                      <FormLabel>{t('loans.billFile')}</FormLabel>
                      <FormControl>
                        <Input
                          type="file"
                          className="cursor-pointer"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          onChange={(e) => onChange(e.target.files?.[0] || null)}
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">{t('loans.billFileHint')}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                mode="create"
                showSaveAndCreateNew={showSaveAndCreateNew}
                onIntent={onIntent}
                onCancel={() => navigate('/loans')}
                loading={loading}
                submitLabel={t('loans.addLoan')}
                loadingLabel={t('common.adding')}
              />
            </form>
          </Form>
    </FormPage>
  );
};

export default AddLoan;
