import { useMemo } from 'react';
import { Control, useFieldArray, useFormState, useWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Autocomplete } from '@/components/ui/autocomplete';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { AfnReportingPreview } from '@/components/forms/AfnReportingPreview';
import { useLanguage } from '@/contexts/LanguageContext';
import { formMessages, optionalString, requiredString } from '@/lib/formSchemas';

type TranslateFn = (key: string, fallback?: string) => string;

const journalLineSchema = (requiredMsg: string) =>
  z.object({
    gl_account: requiredString(requiredMsg),
    debit: optionalString(),
    credit: optionalString(),
    description: optionalString(),
  });

export const createJournalEntrySchema = (t: TranslateFn) => {
  const messages = formMessages(t);
  return z
    .object({
      entry_date: requiredString(messages.required),
      reference_number: optionalString(),
      description: optionalString(),
      lines: z
        .array(journalLineSchema(messages.required))
        .min(2, t('accounts.journalMinLines')),
    })
    .superRefine((data, ctx) => {
      const debit = data.lines.reduce((sum, line) => sum + (parseFloat(line.debit || '') || 0), 0);
      const credit = data.lines.reduce((sum, line) => sum + (parseFloat(line.credit || '') || 0), 0);
      if (Math.abs(debit - credit) > 0.001) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('accounts.mustBalance'),
          path: ['lines'],
        });
      }
    });
};

export type JournalEntryFormValues = z.infer<ReturnType<typeof createJournalEntrySchema>>;

export const defaultJournalEntryValues = (): JournalEntryFormValues => ({
  entry_date: new Date().toISOString().slice(0, 16),
  reference_number: '',
  description: '',
  lines: [
    { gl_account: '', debit: '', credit: '', description: '' },
    { gl_account: '', debit: '', credit: '', description: '' },
  ],
});

export const entryToFormValues = (entry: {
  entry_date?: string;
  reference_number?: string;
  description?: string;
  lines?: {
    gl_account: number;
    debit: string;
    credit: string;
    description?: string;
    currency?: number | null;
  }[];
}): JournalEntryFormValues => ({
  entry_date: entry.entry_date ? new Date(entry.entry_date).toISOString().slice(0, 16) : '',
  reference_number: entry.reference_number || '',
  description: entry.description || '',
  lines: (entry.lines || []).map((line) => ({
    gl_account: line.gl_account?.toString() || '',
    debit: line.debit?.toString() || '',
    credit: line.credit?.toString() || '',
    description: line.description || '',
  })),
});

/** Infer native journal currency from first line that has one (edit mode). */
export function inferJournalCurrencyId(entry?: {
  lines?: { currency?: number | null }[];
}): string {
  const line = entry?.lines?.find((l) => l.currency != null);
  return line?.currency != null ? String(line.currency) : '1';
}

export const journalEntryToPayload = (
  data: JournalEntryFormValues,
  currencyId: string | number,
) => {
  const currency = Number(currencyId) || 1;
  return {
    entry_date: new Date(data.entry_date).toISOString(),
    reference_number: data.reference_number || '',
    description: data.description || '',
    lines: data.lines.map((line) => ({
      gl_account: Number(line.gl_account),
      currency,
      debit: parseFloat(line.debit || '') || 0,
      credit: parseFloat(line.credit || '') || 0,
      description: line.description || '',
    })),
  };
};

type Props = {
  control: Control<JournalEntryFormValues>;
  /** Native transaction currency for all lines (Phase 5/6). */
  currencyId: string;
  onCurrencyChange: (value: string) => void;
};

export const JournalEntryForm = ({ control, currencyId, onCurrencyChange }: Props) => {
  const { t } = useLanguage();
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const lines = useWatch({ control, name: 'lines' }) ?? [];
  const entryDate = useWatch({ control, name: 'entry_date' });
  const { errors } = useFormState({ control });
  const glQueryParams = useMemo(
    () => ({ posting_currency: Number(currencyId) || 1 }),
    [currencyId],
  );

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + (parseFloat(line?.debit || '') || 0), 0);
    const credit = lines.reduce((sum, line) => sum + (parseFloat(line?.credit || '') || 0), 0);
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.001 };
  }, [lines]);

  const linesError =
    (errors.lines as { message?: string; root?: { message?: string } } | undefined)?.message ||
    (errors.lines as { root?: { message?: string } } | undefined)?.root?.message;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={control}
          name="entry_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('accounts.entryDate')} *</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
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
              <FormLabel>{t('accounts.referenceNumber')}</FormLabel>
              <FormControl>
                <Input placeholder={t('accounts.referenceNumberPlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('accounts.description')}</FormLabel>
            <FormControl>
              <Textarea rows={2} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <FormLabel>{t('accounts.journalLines')} *</FormLabel>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                'accounts.journalSameCurrencyHint',
                'One native currency per journal. Cash/Bank/Sarafi are currency-specific; other GLs are shared (AFN chart) with currency on each line.',
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-[9.5rem]">
              <CurrencySelect
                value={currencyId}
                onChange={onCurrencyChange}
                compact
                autoSelectBase
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ gl_account: '', debit: '', credit: '', description: '' })}
            >
              <Plus className="h-4 w-4" />
              {t('accounts.addLine')}
            </Button>
          </div>
        </div>

        {linesError && <p className="text-sm text-destructive mb-2">{linesError}</p>}

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border rounded-lg p-3"
            >
              <div className="md:col-span-4">
                <FormField
                  control={control}
                  name={`lines.${index}.gl_account`}
                  render={({ field: lineField }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t('accounts.glAccount')} *</FormLabel>
                      <FormControl>
                        <Autocomplete
                          endpoint="gl-accounts"
                          queryParams={glQueryParams}
                          value={lineField.value}
                          onChange={lineField.onChange}
                          placeholder={t('accounts.selectGlAccount')}
                          getOptionLabel={(a) =>
                            `${a.code} - ${a.name}${a.currency_code ? ` (${a.currency_code})` : ''}`
                          }
                          getOptionValue={(a) => a.id.toString()}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="md:col-span-2">
                <FormField
                  control={control}
                  name={`lines.${index}.debit`}
                  render={({ field: lineField }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t('accounts.debit')}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...lineField} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="md:col-span-2">
                <FormField
                  control={control}
                  name={`lines.${index}.credit`}
                  render={({ field: lineField }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t('accounts.credit')}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...lineField} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="md:col-span-3">
                <FormField
                  control={control}
                  name={`lines.${index}.description`}
                  render={({ field: lineField }) => (
                    <FormItem>
                      <FormLabel className="text-xs">{t('accounts.lineDescription')}</FormLabel>
                      <FormControl>
                        <Input {...lineField} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="md:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={fields.length <= 2}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              {!lines[index]?.gl_account && index === 0 && (
                <p className="md:col-span-12 text-xs text-muted-foreground">
                  {t('accounts.journalLineHint')}
                </p>
              )}
            </div>
          ))}
        </div>

        <div
          className={`mt-4 p-3 rounded-lg text-sm ${
            totals.balanced ? 'bg-primary/10 text-primary' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {t('accounts.totalDebit')}: {totals.debit.toFixed(2)} | {t('accounts.totalCredit')}:{' '}
          {totals.credit.toFixed(2)}
          {' — '}
          {totals.balanced ? t('accounts.balanced') : t('accounts.notBalanced')}
          {!totals.balanced && ` (${t('accounts.mustBalance')})`}
        </div>

        {totals.debit > 0 && (
          <AfnReportingPreview
            className="mt-3"
            amount={totals.debit}
            currencyId={currencyId}
            atDate={entryDate}
          />
        )}
      </div>
    </div>
  );
};

export default JournalEntryForm;
