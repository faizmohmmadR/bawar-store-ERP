import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useUpdate from '@/api/useUpdate';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { getStaticCurrencyById } from '@/components/forms/CurrencySelect';

const CATEGORIES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'equity', label: 'Equity' },
  { value: 'revenue', label: 'Revenue' },
  { value: 'expense', label: 'Expense' },
];

const EditGLAccount = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        code: requiredString(messages.required),
        name: requiredString(messages.required),
        category: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
        description: z.string().optional(),
        is_active: z.boolean(),
        is_system: z.boolean(),
      }),
    [messages.required],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: '',
      name: '',
      category: 'expense',
      description: '',
      is_active: true,
      is_system: false,
    },
  });

  const isSystem = form.watch('is_system');

  const { data: account, isLoading } = useFetchObjects({
    queryKey: ['gl-account', id],
    endpoint: `gl-accounts/${id}/`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['gl-accounts-list', 'gl-accounts'],
    endpoint: 'gl-accounts',
  });

  useEffect(() => {
    if (account) {
      form.reset({
        code: account.code || '',
        name: account.name || '',
        category: account.category || 'expense',
        description: account.description || '',
        is_active: account.is_active ?? true,
        is_system: account.is_system ?? false,
      });
    }
  }, [account, form]);

  useRedirectOnSuccess(isSuccess, '/gl-accounts');

  const onSubmit = (data: z.infer<typeof schema>) => {
    const payload: Record<string, unknown> = {
      description: data.description?.trim() || null,
      is_active: data.is_active,
    };
    if (!data.is_system) {
      payload.code = data.code.trim();
      payload.name = data.name.trim();
      payload.category = data.category;
    }
    handleUpdate(id!, payload);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <FormPage
      title={
        <>
          {t('accounts.editGlAccount', 'Edit GL Account')}
          {isSystem && (
            <Badge variant="secondary" className="ms-2">{t('accounts.systemAccount', 'System')}</Badge>
          )}
        </>
      }
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
                      <FormLabel>{t('accounts.glCode', 'Code')}</FormLabel>
                      <FormControl>
                        <Input disabled={isSystem} {...field} />
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
                      <FormLabel>{t('accounts.glCategory', 'Category')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isSystem}>
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
          </FormPageFields>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('accounts.glName', 'Account Name')}</FormLabel>
                    <FormControl>
                      <Input disabled={isSystem} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-sm font-medium">{t('accounts.currency', 'Currency')}</p>
                <Badge variant="outline">
                  {account?.currency_code ||
                    getStaticCurrencyById(account?.currency ?? 1)?.code ||
                    'AFN'}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'accounts.glCurrencyLocked',
                    'Currency is set when the account is created and cannot be changed.',
                  )}
                </p>
              </div>

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
                onCancel={() => navigate('/gl-accounts')}
                loading={loading}
                submitLabel={t('common.save')}
              />
        </form>
      </Form>
    </FormPage>
  );
};

export default EditGLAccount;
