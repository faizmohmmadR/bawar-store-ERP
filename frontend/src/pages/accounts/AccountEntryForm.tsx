import { useMemo } from 'react';
import { Control, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Autocomplete } from '@/components/ui/autocomplete';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useLanguage } from '@/contexts/LanguageContext';
import { formMessages, optionalString, requiredString } from '@/lib/formSchemas';

type TranslateFn = (key: string, fallback?: string) => string;

const accountLineSchema = (requiredMsg: string) =>
  z.object({
    account: optionalString(),
    entry_type: optionalString(),
    debit_amount: optionalString(),
    credit_amount: optionalString(),
    currencySymbol: optionalString(),
    currencyCode: optionalString(),
  });

export const createAccountEntrySchema = (t: TranslateFn) => {
  const messages = formMessages(t);
  return z
    .object({
      account_type: z.enum(['customer', 'vendor']),
      entry_date: requiredString(messages.required),
      reference_number: optionalString(),
      notes: optionalString(),
      lines: z.array(accountLineSchema(messages.required)).min(1, t('accounts.minOneEntry', 'At least 1 entry is required')),
    })
    .superRefine((data, ctx) => {
      const validLines = data.lines.filter(
        (line) => line.account && line.entry_type && (line.debit_amount || line.credit_amount),
      );
      if (validLines.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('accounts.minOneEntry', 'At least 1 entry is required'),
          path: ['lines'],
        });
      }
    });
};

export type AccountEntryFormValues = z.infer<ReturnType<typeof createAccountEntrySchema>>;

export const defaultAccountEntryValues = (): AccountEntryFormValues => ({
  account_type: 'customer',
  entry_date: new Date().toISOString().slice(0, 16),
  reference_number: '',
  notes: '',
  lines: [{ account: '', entry_type: '', debit_amount: '', credit_amount: '', currencySymbol: '', currencyCode: '' }],
});

export const entryToFormValues = (entry: {
  entry_date?: string;
  reference_number?: string;
  notes?: string;
  account?: number;
  entry_type?: number;
  debit_amount?: number | string;
  credit_amount?: number | string;
  account_details?: {
    account_type?: 'customer' | 'vendor';
    currency_details?: { symbol?: string };
  };
  account_currency?: string;
}): AccountEntryFormValues => ({
  account_type: entry.account_details?.account_type || 'customer',
  entry_date: entry.entry_date ? entry.entry_date.slice(0, 16) : new Date().toISOString().slice(0, 16),
  reference_number: entry.reference_number || '',
  notes: entry.notes || '',
  lines: [
    {
      account: entry.account?.toString() || '',
      entry_type: entry.entry_type?.toString() || '',
      debit_amount: entry.debit_amount?.toString() || '',
      credit_amount: entry.credit_amount?.toString() || '',
      currencySymbol: entry.account_details?.currency_details?.symbol || '',
      currencyCode: entry.account_currency || '',
    },
  ],
});

export const accountEntryJournalPayload = (data: AccountEntryFormValues) => ({
  entry_date: data.entry_date,
  reference_number: data.reference_number,
  notes: data.notes,
  entries: data.lines
    .filter((line) => line.account && line.entry_type && (line.debit_amount || line.credit_amount))
    .map((line) => ({
      account: line.account,
      entry_type: line.entry_type,
      debit_amount: parseFloat(line.debit_amount || '0'),
      credit_amount: parseFloat(line.credit_amount || '0'),
    })),
});

export const singleEntryUpdatePayload = (data: AccountEntryFormValues) => {
  const line = data.lines[0];
  return {
    account: parseInt(line.account, 10),
    entry_type: parseInt(line.entry_type, 10),
    entry_date: data.entry_date,
    debit_amount: parseFloat(line.debit_amount || '0'),
    credit_amount: parseFloat(line.credit_amount || '0'),
    reference_number: data.reference_number || null,
    notes: data.notes || null,
  };
};

type Props = {
  control: Control<AccountEntryFormValues>;
};

export const AccountEntryForm = ({ control }: Props) => {
  const { t } = useLanguage();
  const { setValue } = useFormContext<AccountEntryFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const lines = useWatch({ control, name: 'lines' }) ?? [];
  const accountType = useWatch({ control, name: 'account_type' }) ?? 'customer';

  const currencyTotals = useMemo(() => {
    return lines.reduce(
      (totals, line) => {
        if (!line?.currencyCode) return totals;
        const code = line.currencyCode;
        if (!totals[code]) {
          totals[code] = {
            code,
            symbol: line.currencySymbol || '',
            debit: 0,
            credit: 0,
          };
        }
        totals[code].debit += parseFloat(line.debit_amount || '0');
        totals[code].credit += parseFloat(line.credit_amount || '0');
        return totals;
      },
      {} as Record<string, { code: string; symbol: string; debit: number; credit: number }>,
    );
  }, [lines]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <FormField
          control={control}
          name="account_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounts.accountType', 'Account Type')}</FormLabel>
              <FormControl>
                <div className="flex gap-4 pt-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="customer"
                      checked={field.value === 'customer'}
                      onChange={() => field.onChange('customer')}
                      className="text-primary"
                    />
                    <span className="text-sm">{t('accounts.customer', 'Customer')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="vendor"
                      checked={field.value === 'vendor'}
                      onChange={() => field.onChange('vendor')}
                      className="text-primary"
                    />
                    <span className="text-sm">{t('accounts.vendor', 'Vendor')}</span>
                  </label>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="entry_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounts.entryDate', 'Entry Date')}</FormLabel>
              <FormControl>
                <Input type="datetime-local" className="h-9" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="reference_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounts.reference', 'Reference')}</FormLabel>
              <FormControl>
                <Input placeholder="REF-001" className="h-9" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="notes"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>{t('common.notes', 'Notes')}</FormLabel>
              <FormControl>
                <Input placeholder={t('accounts.enterNotes', 'Enter notes...')} className="h-9" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-12 gap-4 text-sm font-semibold text-gray-700 pb-3 border-b border-gray-200">
            <div className="col-span-4">{t('accounts.account', 'Account')}</div>
            <div className="col-span-3">{t('accounts.entryType', 'Entry Type')}</div>
            <div className="col-span-2">{t('accounts.debit', 'Debit')}</div>
            <div className="col-span-2">{t('accounts.credit', 'Credit')}</div>
            <div className="col-span-1" />
          </div>

          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-12 gap-4 items-start py-3 hover:bg-gray-50 rounded-md px-2">
              <div className="col-span-4">
                <FormField
                  control={control}
                  name={`lines.${index}.account`}
                  render={({ field: lineField }) => (
                    <FormItem>
                      <FormControl>
                        <Autocomplete
                          value={lineField.value}
                          onChange={(value, option) => {
                            const accountId = value?.toString() || '';
                            lineField.onChange(accountId);
                            setValue(`lines.${index}.currencySymbol`, option?.currency_details?.symbol || '');
                            setValue(`lines.${index}.currencyCode`, option?.currency_code || '');
                            if (accountId && index === fields.length - 1) {
                              append({
                                account: '',
                                entry_type: '',
                                debit_amount: '',
                                credit_amount: '',
                                currencySymbol: '',
                                currencyCode: '',
                              });
                            }
                          }}
                          placeholder={t('accounts.selectAccount', 'Select account...')}
                          endpoint="accounts"
                          queryParams={{ account_type: accountType }}
                          getOptionLabel={(a) => {
                            const holderName = a.customer_name || a.vendor_name || '';
                            const currency = a.currency_code || '';
                            return `${a.account_number} - ${holderName} (${currency})`;
                          }}
                          getOptionValue={(a) => a.id.toString()}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="col-span-3">
                <FormField
                  control={control}
                  name={`lines.${index}.entry_type`}
                  render={({ field: lineField }) => (
                    <FormItem>
                      <FormControl>
                        <Autocomplete
                          value={lineField.value}
                          onChange={(value) => lineField.onChange(value?.toString() || '')}
                          placeholder={t('accounts.selectEntryType', 'Select entry type...')}
                          endpoint="entry-types"
                          getOptionLabel={(e) => e.name}
                          getOptionValue={(e) => e.id.toString()}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="col-span-2">
                <FormField
                  control={control}
                  name={`lines.${index}.debit_amount`}
                  render={({ field: lineField }) => (
                    <FormItem>
                      <FormControl>
                        <div className="relative">
                          {lines[index]?.currencySymbol && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                              {lines[index].currencySymbol}
                            </span>
                          )}
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            className={`h-9 ${lines[index]?.currencySymbol ? 'pl-8' : ''}`}
                            {...lineField}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="col-span-2">
                <FormField
                  control={control}
                  name={`lines.${index}.credit_amount`}
                  render={({ field: lineField }) => (
                    <FormItem>
                      <FormControl>
                        <div className="relative">
                          {lines[index]?.currencySymbol && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                              {lines[index].currencySymbol}
                            </span>
                          )}
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            className={`h-9 ${lines[index]?.currencySymbol ? 'pl-8' : ''}`}
                            {...lineField}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="col-span-1 flex items-center">
                {fields.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {Object.keys(currencyTotals).length > 0 && (
          <div className="mx-6 mb-6 pt-4 border-t border-gray-200 bg-gray-50 rounded-lg p-4">
            <div className="text-sm font-semibold text-gray-700 mb-3">
              {t('accounts.totalsByCurrency', 'Totals by Currency')}:
            </div>
            <div className="space-y-2">
              {Object.values(currencyTotals).map((total) => (
                <div key={total.code} className="flex justify-between items-center py-2 px-3 bg-white rounded border">
                  <div className="font-medium text-gray-700">
                    {total.code} ({total.symbol})
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div className="text-primary font-semibold">
                      Dr: {total.symbol}
                      {total.debit.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-red-600 font-semibold">
                      Cr: {total.symbol}
                      {total.credit.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-primary font-semibold border-l pl-4">
                      {t('accounts.balance', 'Balance')}: {total.symbol}
                      {(total.debit - total.credit).toLocaleString('en-US', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountEntryForm;
