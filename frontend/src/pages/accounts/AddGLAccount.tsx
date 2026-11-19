import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen } from 'lucide-react';import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { toCurrencyFkId } from '@/lib/currencies';

const CATEGORIES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
];

const AddGLAccount = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        code: requiredString(messages.required),
        name: requiredString(messages.required),
        category: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
        currency: requiredString(messages.required),
        description: z.string().optional(),
        is_active: z.boolean(),
      }),
    [messages.required],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: '',
      name: '',
      category: 'expense',
      currency: '1',
      description: '',
      is_active: true,
    },
  });

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['gl-accounts-list', 'gl-accounts'],
    endpoint: 'gl-accounts/',
  });

  const onReset = useCallback(() => {
    form.reset();
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/gl-accounts',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleAdd({
      code: data.code.trim(),
      name: data.name.trim(),
      category: data.category,
      currency: toCurrencyFkId(data.currency),
      description: data.description?.trim() || undefined,
      is_active: data.is_active,
    });
  };

  return (
    <FormPage
      title={t('accounts.addGlAccount', 'Add GL Account')}
      icon={<BookOpen />}
      backTo="/gl-accounts"
      maxWidth="2xl"
    >
<Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormPageFields>
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('accounts.glCode', 'Code')} *</FormLabel>
                      <FormControl>
                        <Input placeholder="6000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('accounts.glCategory', 'Category')} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
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
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('accounts.currency', 'Currency')} *</FormLabel>
                      <FormControl>
                        <CurrencySelect
                          value={field.value}
                          onChange={field.onChange}
                          compact
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('accounts.glName', 'Account Name')} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t('accounts.glNamePlaceholder', 'e.g. Office Supplies')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('accounts.description', 'Description')}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3 space-y-0">
                    <FormLabel className="!mt-0">{t('common.active')}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormActions
                mode="create"
                showSaveAndCreateNew={showSaveAndCreateNew}
                onIntent={onIntent}
                onCancel={() => navigate('/gl-accounts')}
                loading={loading}
                submitLabel={t('common.save')}
              />
            </form>
          </Form>
    </FormPage>
  );
};

export default AddGLAccount;
