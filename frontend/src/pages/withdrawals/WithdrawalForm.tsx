import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Banknote } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Autocomplete } from '@/components/ui/autocomplete';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { AfnReportingPreview } from '@/components/forms/AfnReportingPreview';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import useUpdate from '@/api/useUpdate';
import useFetchObjects from '@/api/useFetchObjects';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { toCurrencyFkId } from '@/lib/currencies';
import { pickDefaultCashBookAccount } from '@/lib/paymentDefaults';
import { cn } from '@/lib/utils';

function formatBalance(value: unknown, code?: string) {
  const n = Number(value ?? 0);
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return code ? `${formatted} ${code}` : formatted;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

/** Match payments: date-only picker → noon local for DateTimeField backends. */
function toApiDateTime(date: string) {
  if (!date) return date;
  return date.includes('T') ? date : `${date}T12:00:00`;
}

type WithdrawalFormValues = {
  gl_account: string;
  amount: string;
  currency: string;
  withdrawal_date: string;
  reference_number: string;
  description: string;
};

function WithdrawalForm({ edit = false }: { edit?: boolean }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();
  const messages = useMemo(() => formMessages(t), [t]);
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        gl_account: requiredString(messages.required),
        amount: z
          .string()
          .min(1, messages.required)
          .refine((v) => parseFloat(v) > 0, messages.positive),
        currency: requiredString(messages.required),
        withdrawal_date: requiredString(messages.required),
        reference_number: z.string().optional(),
        description: z.string().optional(),
      }),
    [messages.positive, messages.required],
  );

  const form = useForm<WithdrawalFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      gl_account: '',
      amount: '',
      currency: '1',
      withdrawal_date: todayIsoDate(),
      reference_number: '',
      description: '',
    },
  });

  const currency = useWatch({ control: form.control, name: 'currency' });
  const amount = useWatch({ control: form.control, name: 'amount' });
  const withdrawalDate = useWatch({ control: form.control, name: 'withdrawal_date' });

  const { data: item } = useFetchObjects<any>({
    queryKey: ['withdrawals', id || 'new'],
    endpoint: `withdrawals/${id}/`,
    enabled: edit && !!id,
  });

  useEffect(() => {
    if (!item) return;
    form.reset({
      gl_account: item.gl_account?.toString() || item.gl_account_details?.id?.toString() || '',
      amount: item.amount != null ? String(item.amount) : '',
      currency: item.currency?.toString() || '1',
      withdrawal_date: item.withdrawal_date
        ? String(item.withdrawal_date).slice(0, 10)
        : todayIsoDate(),
      reference_number: item.reference_number || '',
      description: item.description || '',
    });
    if (item.gl_account_details) setSelectedAccount(item.gl_account_details);
  }, [item, form]);

  const accountQueryParams = useMemo(() => {
    const params: Record<string, string | number> = { cash_books: 1 };
    const currencyId = toCurrencyFkId(currency);
    if (currencyId != null) params.currency = currencyId;
    return params;
  }, [currency]);

  const { data: cashBooksData } = useFetchObjects<{ results?: any[] } | any[]>({
    queryKey: ['withdrawal-cash-books', String(currency)],
    endpoint: 'gl-accounts/',
    params: { ...accountQueryParams, page_size: 100 },
    enabled: !edit,
  });

  const cashBookAccounts = useMemo(() => {
    if (Array.isArray(cashBooksData)) return cashBooksData;
    return cashBooksData?.results || [];
  }, [cashBooksData]);

  useEffect(() => {
    if (edit) return;
    const defaultAccount = pickDefaultCashBookAccount(cashBookAccounts);
    if (!defaultAccount?.id) return;
    const currentId = form.getValues('gl_account');
    const currentStillValid = cashBookAccounts.some(
      (account) => String(account.id) === String(currentId),
    );
    // Keep an explicit user choice within this currency; otherwise default to cash (1000).
    if (currentId && currentStillValid) return;
    form.setValue('gl_account', String(defaultAccount.id));
    setSelectedAccount(defaultAccount);
  }, [cashBookAccounts, edit, form]);

  const { handleAdd, isSuccess: addOk, loading: adding } = useAdd({
    queryKey: ['withdrawals'],
    endpoint: 'withdrawals/',
  });
  const { handleUpdate, isSuccess: updateOk, loading: updating } = useUpdate({
    queryKey: ['withdrawals'],
    endpoint: 'withdrawals',
  });

  useRedirectOnSuccess(edit && updateOk, '/withdrawals');

  const onReset = useCallback(() => {
    form.reset({
      gl_account: '',
      amount: '',
      currency: '1',
      withdrawal_date: todayIsoDate(),
      reference_number: '',
      description: '',
    });
    setSelectedAccount(null);
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess: !edit && addOk,
    listPath: '/withdrawals',
    onReset,
  });

  const onSubmit = (data: WithdrawalFormValues) => {
    const payload = {
      gl_account: parseInt(data.gl_account, 10),
      amount: parseFloat(data.amount),
      currency: toCurrencyFkId(data.currency),
      withdrawal_date: toApiDateTime(data.withdrawal_date),
      reference_number: data.reference_number || '',
      description: data.description || '',
    };
    if (edit && id) handleUpdate(id, payload);
    else handleAdd(payload);
  };

  const curCode = selectedAccount?.currency_details?.code || '';
  const balance = Number(selectedAccount?.all_time_totals?.balance ?? selectedAccount?.balance ?? 0);
  const amountNum = Number(amount || 0);
  const remaining = balance - amountNum;
  const overdrawn = !!selectedAccount && amountNum > balance;

  return (
    <FormPage
      title={edit ? t('withdrawals.edit') : t('withdrawals.add')}
      icon={<Banknote />}
      backTo="/withdrawals"
      maxWidth="2xl"
      description={t('withdrawals.manage')}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageFields>
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('withdrawals.currency')} *</FormLabel>
                  <FormControl>
                    <CurrencySelect
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        form.setValue('gl_account', '');
                        setSelectedAccount(null);
                      }}
                      placeholder={t('crud.selectCurrency')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'withdrawals.currencyHint',
                      'Choose currency first, then the matching Cash / Bank / Sarafi account',
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gl_account"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('withdrawals.fromAccount')} *</FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="gl-accounts/"
                      queryParams={accountQueryParams}
                      value={field.value}
                      onChange={(value, option) => {
                        field.onChange(value?.toString() || '');
                        setSelectedAccount(option || null);
                      }}
                      getOptionLabel={(item) => {
                        const code = item?.code || '';
                        const name = item?.name || '';
                        const cur = item?.currency_details?.code || '';
                        const bal = item?.all_time_totals?.balance;
                        const balPart =
                          bal != null ? ` · ${formatBalance(bal, cur || undefined)}` : cur ? ` · ${cur}` : '';
                        return `${code} ${name}${balPart}`.trim();
                      }}
                      getOptionValue={(item) => item.id.toString()}
                      placeholder={t('withdrawals.selectAccount', 'Select exact GL account')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormPageFields>

          {selectedAccount ? (
            <div
              className={cn(
                'rounded-lg border p-4',
                overdrawn ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/30',
              )}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('withdrawals.glCode', 'GL code')}</p>
                  <p className="text-sm font-semibold">
                    {selectedAccount.code} — {selectedAccount.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('withdrawals.availableBalance', 'Available balance')}
                  </p>
                  <p className={cn('text-sm font-semibold tabular-nums', balance < 0 && 'text-destructive')}>
                    {formatBalance(balance, curCode)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t('withdrawals.afterWithdrawal', 'After this withdrawal')}
                  </p>
                  <p className={cn('text-sm font-semibold tabular-nums', remaining < 0 && 'text-destructive')}>
                    {formatBalance(remaining, curCode)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <FormPageFields>
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('withdrawals.amount')} *</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="withdrawal_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('withdrawals.withdrawalDate')} *</FormLabel>
                  <FormControl>
                    <DatePickerInput
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder={t('withdrawals.withdrawalDate')}
                    />
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
                  <FormLabel>{t('withdrawals.referenceNumber')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormPageFields>

          <AfnReportingPreview
            amount={amount}
            currencyId={currency}
            atDate={withdrawalDate}
            storedRate={edit ? item?.exchange_rate : undefined}
            storedBase={edit ? item?.amount_base : undefined}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('withdrawals.description')}</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormActions
            mode={edit ? 'edit' : 'create'}
            showSaveAndCreateNew={!edit && showSaveAndCreateNew}
            onIntent={onIntent}
            onCancel={() => navigate('/withdrawals')}
            loading={adding || updating}
            submitLabel={edit ? t('common.save') : t('common.add')}
            loadingLabel={t('common.saving')}
          />
        </form>
      </Form>
    </FormPage>
  );
}

export default WithdrawalForm;
