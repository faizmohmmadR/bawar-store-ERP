import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ReloadIcon } from '@radix-ui/react-icons';
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
import useUpdate from '@/api/useUpdate';
import useFetchObjects from '@/api/useFetchObjects';
import { ExpenseCategory } from '@/types/expense';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, requiredString } from '@/lib/formSchemas';

const EditExpenseCategory = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
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

  const { data: category, isLoading: loadingCategory } = useFetchObjects<ExpenseCategory>({
    queryKey: ['expense-category', id || ''],
    endpoint: `expense-categories/${id}/`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['expense-categories'],
  });

  useEffect(() => {
    if (category) {
      form.reset({
        name: category.name || '',
        description: category.description || '',
      });
    }
  }, [category, form]);

  useRedirectOnSuccess(isSuccess, '/expense-categories');

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!id) return;
    handleUpdate(id, {
      name: data.name.trim(),
      description: data.description?.trim() || undefined,
    });
  };

  if (loadingCategory) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <FormPage
      title={t('expenses.categories.editCategory')}
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
            onCancel={() => navigate('/expense-categories')}
            loading={loading}
            submitLabel={t('common.update')}
            loadingLabel={t('common.updating')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default EditExpenseCategory;
