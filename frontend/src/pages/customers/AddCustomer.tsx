import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields, FormPageSection } from '@/components/forms/FormPage';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { LoanScenarioHint } from '@/components/loans/LoanScenarioHint';
import { getLoanTypeOptions } from '@/lib/loanUtils';
import { toCurrencyFkId } from '@/lib/currencies';
import useAdd from '@/api/useAdd';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages, requiredString } from '@/lib/formSchemas';

const AddCustomer = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z
        .object({
          name: requiredString(messages.required),
          phone: z.string().optional(),
          email: z.string().optional(),
          address: z.string().optional(),
          status: z.enum(['active', 'inactive']).default('active'),
          has_previous_balance: z.enum(['no', 'yes']).default('no'),
          opening_balance_amount: z.string().optional(),
          opening_balance_loan_type: z.enum(['loan_in', 'loan_out']).default('loan_out'),
          opening_balance_currency: z.string().optional(),
          opening_balance_notes: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          if (data.has_previous_balance !== 'yes') return;

          const amount = parseFloat(data.opening_balance_amount || '');
          if (!data.opening_balance_amount || Number.isNaN(amount) || amount <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('customers.openingBalanceAmountRequired'),
              path: ['opening_balance_amount'],
            });
          }
          if (!data.opening_balance_currency) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('customers.openingBalanceCurrencyRequired'),
              path: ['opening_balance_currency'],
            });
          }
        }),
    [messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      address: '',
      status: 'active',
      has_previous_balance: 'no',
      opening_balance_amount: '',
      opening_balance_loan_type: 'loan_out',
      opening_balance_currency: '',
      opening_balance_notes: '',
    },
  });

  const hasPreviousBalance = form.watch('has_previous_balance') === 'yes';
  const openingLoanType = form.watch('opening_balance_loan_type');

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['customers', 'loans'],
    endpoint: 'customers/',
    showSuccessToast: true,
    showErrorToast: true,
    invalidateQueries: true,
  });

  const onReset = useCallback(() => {
    form.reset();
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/customers',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    const { status, has_previous_balance, opening_balance_amount, opening_balance_loan_type, opening_balance_currency, opening_balance_notes, ...rest } = data;

    const payload: Record<string, unknown> = {
      ...rest,
      name: data.name.trim(),
      is_active: (status ?? 'active') === 'active',
      has_previous_balance: has_previous_balance === 'yes',
    };

    if (has_previous_balance === 'yes') {
      payload.opening_balance_amount = opening_balance_amount;
      payload.opening_balance_loan_type = opening_balance_loan_type;
      payload.opening_balance_currency = toCurrencyFkId(opening_balance_currency!);
      if (opening_balance_notes?.trim()) {
        payload.opening_balance_notes = opening_balance_notes.trim();
      }
    }

    handleAdd(payload);
  };

  return (
    <FormPage
      title={t('customers.addCustomer')}
      backTo="/customers"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageSection title={t('customers.customerDetails')}>
              <FormPageFields>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('customers.name')} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t('customers.enterName', 'Enter customer name')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('customers.phone')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('customers.enterPhone')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('customers.email')}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={t('customers.enterEmail')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('customers.status')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || 'active'}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('common.filterByStatus')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">{t('common.active')}</SelectItem>
                          <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>{t('customers.address')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('customers.enterAddress')} rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>
          </FormPageSection>

          <FormPageSection title={t('customers.previousBalanceSection')}>
            <FormField
              control={form.control}
              name="has_previous_balance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('customers.hasPreviousBalance')}</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid gap-3 sm:grid-cols-2"
                    >
                      <div className="flex items-start gap-3 rounded-lg border p-4">
                        <RadioGroupItem value="no" id="previous-balance-no" className="mt-1" />
                        <Label htmlFor="previous-balance-no" className="cursor-pointer space-y-1 font-normal">
                          <span className="block font-medium">{t('customers.hasPreviousBalanceNo')}</span>
                          <span className="block text-sm text-muted-foreground">{t('customers.hasPreviousBalanceNoDesc')}</span>
                        </Label>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg border p-4">
                        <RadioGroupItem value="yes" id="previous-balance-yes" className="mt-1" />
                        <Label htmlFor="previous-balance-yes" className="cursor-pointer space-y-1 font-normal">
                          <span className="block font-medium">{t('customers.hasPreviousBalanceYes')}</span>
                          <span className="block text-sm text-muted-foreground">{t('customers.hasPreviousBalanceYesDesc')}</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {hasPreviousBalance && (
              <div className="mt-4 space-y-4 rounded-lg border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">{t('customers.previousBalanceHint')}</p>

                <FormPageFields>
                  <FormField
                    control={form.control}
                    name="opening_balance_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('customers.openingBalanceAmount')} *</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="opening_balance_loan_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('customers.openingBalanceType')} *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {getLoanTypeOptions('customer', t).map((opt) => (
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

                  <FormField
                    control={form.control}
                    name="opening_balance_currency"
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
                    name="opening_balance_notes"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>{t('loans.notes')}</FormLabel>
                        <FormControl>
                          <Textarea placeholder={t('loans.enterNotes')} rows={2} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormPageFields>

                <LoanScenarioHint variant="banner" loanerType="customer" loanType={openingLoanType} />
              </div>
            )}
          </FormPageSection>

          <FormActions
                mode="create"
                showSaveAndCreateNew={showSaveAndCreateNew}
                onIntent={onIntent}
            onCancel={() => navigate('/customers')}
            loading={loading}
            submitLabel={t('common.add')}
            loadingLabel={t('common.adding')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export { AddCustomer };
export default AddCustomer;
