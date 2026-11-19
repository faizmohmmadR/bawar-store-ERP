import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Tag } from 'lucide-react';
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
import { FormActions } from '@/components/forms/FormActions';
import { FormPage } from '@/components/forms/FormPage';
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages, requiredString } from '@/lib/formSchemas';

const AddExpenseCategory = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        name: requiredString(messages.required),
        description: z.string().optional(),
      }),
    [messages.required],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['expense-categories'],
    endpoint: 'expense-categories/',
  });

  const onReset = useCallback(() => {
    form.reset();
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/expense-categories',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleAdd({
      name: data.name.trim(),
      description: data.description?.trim() || undefined,
    });
  };

  return (
    <FormPage
      title={t('expenses.categories.addCategory')}
      icon={<Tag />}
      backTo="/expense-categories"
      maxWidth="2xl"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('expenses.categories.name')} *</FormLabel>
                <FormControl>
                  <Input placeholder={t('expenses.categories.enterName')} {...field} />
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
                <FormLabel>{t('expenses.description')}</FormLabel>
                <FormControl>
                  <Textarea placeholder={t('expenses.enterDescription')} rows={4} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormActions
                mode="create"
                showSaveAndCreateNew={showSaveAndCreateNew}
                onIntent={onIntent}
            onCancel={() => navigate('/expense-categories')}
            loading={loading}
            submitLabel={t('common.add')}
            loadingLabel={t('common.adding')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddExpenseCategory;
