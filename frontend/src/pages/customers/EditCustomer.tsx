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
import { Customer } from '@/types/customer';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, requiredString } from '@/lib/formSchemas';

export const EditCustomer = () => {
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

  const { data: customer, isLoading } = useFetchObjects<Customer>({
    queryKey: ['customers', id],
    endpoint: `customers/${id}`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate<Customer>({
    queryKey: ['customers'],
    showSuccessToast: true,
    showErrorToast: true,
    invalidateQueries: true,
  });

  useEffect(() => {
    if (customer) {
      form.reset({
        name: customer.name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        address: customer.address || '',
        status: customer.is_active !== false ? 'active' : 'inactive',
      });
    }
  }, [customer, form]);

  useRedirectOnSuccess(isSuccess, '/customers');

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

  if (!customer) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('customers.notFound')}</p>
      </div>
    );
  }

  return (
    <FormPage
      title={t('customers.editCustomer')}
      backTo="/customers"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageSection title={t('customers.customerDetails')}>
              <FormPageFields>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('customers.name')} *</FormLabel>
                      <FormControl>
                        <Input placeholder={t('customers.enterName', 'Enter customer name')} {...field} />
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
                      <FormLabel>{t('customers.phone')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('customers.enterPhone')} {...field} />
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
                      <FormLabel>{t('customers.email')}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={t('customers.enterEmail')} {...field} />
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
                      <FormLabel>{t('customers.status')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || 'active'}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('common.filterByStatus')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">{t('common.active')}</SelectItem>
                          <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
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
                      <FormLabel>{t('customers.address')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('customers.enterAddress')} rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>
          </FormPageSection>

          <FormActions
            onCancel={() => navigate('/customers')}
            loading={loading}
            submitLabel={t('common.update')}
            loadingLabel={t('common.saving')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default EditCustomer;
