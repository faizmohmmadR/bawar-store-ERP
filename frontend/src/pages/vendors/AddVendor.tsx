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
} from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields, FormPageSection } from '@/components/forms/FormPage';
import useAdd from '@/api/useAdd';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages, requiredString } from '@/lib/formSchemas';

const AddVendor = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        name: requiredString(messages.required),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        status: z.enum(['active', 'inactive']).default('active'),
      }),
    [messages.required],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      address: '',
      status: 'active',
    },
  });

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: 'vendors',
    showSuccessToast: true,
    showErrorToast: true,
    invalidateQueries: true,
  });

  const onReset = useCallback(() => {
    form.reset();
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/vendors',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    const { status, ...rest } = data;
    handleAdd({
      ...rest,
      name: data.name.trim(),
      is_active: (status ?? 'active') === 'active',
    });
  };

  return (
    <FormPage
      title={t('vendors.addVendor')}
      backTo="/vendors"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageSection title={t('vendors.vendorDetails')}>
              <FormPageFields>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('vendors.name')} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t('vendors.namePlaceholder')} {...field} />
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
                      <FormLabel>{t('vendors.phone')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('vendors.phonePlaceholder')} {...field} />
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
                      <FormLabel>{t('vendors.email')}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={t('vendors.emailPlaceholder')} {...field} />
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
                      <FormLabel>{t('vendors.status')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || 'active'}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('vendors.selectStatus')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">{t('vendors.active')}</SelectItem>
                          <SelectItem value="inactive">{t('vendors.inactive')}</SelectItem>
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
                      <FormLabel>{t('vendors.address')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('vendors.addressPlaceholder')} rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>
          </FormPageSection>

          <FormActions
                mode="create"
                showSaveAndCreateNew={showSaveAndCreateNew}
                onIntent={onIntent}
            onCancel={() => navigate('/vendors')}
            loading={loading}
            submitLabel={t('common.create')}
            loadingLabel={t('common.saving')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddVendor;
