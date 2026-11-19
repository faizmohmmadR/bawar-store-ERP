import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageSection } from '@/components/forms/FormPage';
import { Tag } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useUpdate from '@/api/useUpdate';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';

const schema = z.object({
  name: z.string().min(1, 'Required'),
});

const EditEntryType = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();

  const { data: entryTypeData, isLoading } = useFetchObjects<any>({
    queryKey: ['entry-types', id || ''],
    endpoint: `entry-types/${id}/`,
    enabled: !!id,
  });

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['entry-types'],
    endpoint: 'entry-types',
  });

  useEffect(() => {
    if (entryTypeData) {
      form.reset({ name: entryTypeData.name || '' });
    }
  }, [entryTypeData, form]);

  useRedirectOnSuccess(isSuccess, '/entry-types');

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!id) return;
    handleUpdate(id, data);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <FormPage
      title={t('accounts.editEntryType')}
      description={t('accounts.updateEntryType')}
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
            onCancel={() => navigate('/entry-types')}
            loading={loading}
            submitLabel={t('accounts.updateEntryType')}
            loadingLabel={t('accounts.updating')}
            cancelLabel={t('accounts.cancel')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default EditEntryType;
