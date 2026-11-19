import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageSection } from '@/components/forms/FormPage';
import { Tag } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';

const schema = z.object({
  name: z.string().min(1, 'Required'),
});

const emptyValues = { name: '' };

const AddEntryType = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  const { handleAdd, loading, isSuccess } = useAdd({ queryKey: 'entry-types', endpoint: 'entry-types' });

  const onReset = useCallback(() => {
    form.reset(emptyValues);
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/entry-types',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleAdd(data);
  };

  return (
    <FormPage
      title={t('accounts.addEntryType')}
      description={t('accounts.createEntryType')}
      icon={<Tag />}
      backTo="/entry-types"
      maxWidth="3xl"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormPageSection title={t('accounts.entryTypeInformation')}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('accounts.entryTypeName')} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t('accounts.entryTypeNamePlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormPageSection>

          <FormActions
            mode="create"
            onCancel={() => navigate('/entry-types')}
            loading={loading}
            submitLabel={t('accounts.createEntryType')}
            loadingLabel={t('accounts.creating')}
            showSaveAndCreateNew={showSaveAndCreateNew}
            onIntent={onIntent}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddEntryType;
