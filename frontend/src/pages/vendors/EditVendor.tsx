import { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import useUpdate from '@/api/useUpdate';
import useFetchObjects from '@/api/useFetchObjects';
import { Vendor } from '@/types/vendor';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, requiredString } from '@/lib/formSchemas';

const EditVendor = () => {
  const { id } = useParams();
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

  const { data: vendor, isLoading } = useFetchObjects<Vendor>({
    queryKey: ['vendors', id],
    endpoint: `vendors/${id}`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['vendors'],
    showSuccessToast: true,
    showErrorToast: true,
    invalidateQueries: true,
  });

  useEffect(() => {
    if (vendor) {
      form.reset({
        name: vendor.name || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        address: vendor.address || '',
        status: vendor.is_active !== false ? 'active' : 'inactive',
      });
    }
  }, [vendor, form]);

  useRedirectOnSuccess(isSuccess, '/vendors');

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!id) return;
    const { status, ...rest } = data;
    handleUpdate(id, {
      ...rest,
      name: data.name.trim(),
      is_active: (status ?? 'active') === 'active',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('vendors.notFound')}</p>
      </div>
    );
  }

  return (
    <FormPage
      title={t('vendors.editVendor')}
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
            onCancel={() => navigate('/vendors')}
            loading={loading}
            submitLabel={t('common.update')}
            loadingLabel={t('common.saving')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default EditVendor;
