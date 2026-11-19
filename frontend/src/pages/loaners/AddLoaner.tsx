import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Users } from 'lucide-react';import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Autocomplete } from '@/components/ui/autocomplete';
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
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages } from '@/lib/formSchemas';

const AddLoaner = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().optional(),
          loaner_type: z.enum(['customer', 'vendor']),
          customer: z.string().optional(),
          vendor: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional(),
          address: z.string().optional(),
          is_active: z.boolean(),
        })
        .superRefine((data, ctx) => {
          if (data.loaner_type === 'customer' && !data.customer) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('loans.validation.customer'),
              path: ['customer'],
            });
          }
          if (data.loaner_type === 'vendor' && !data.vendor) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('loans.validation.vendor'),
              path: ['vendor'],
            });
          }
        }),
    [messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      loaner_type: 'customer',
      customer: '',
      vendor: '',
      phone: '',
      email: '',
      address: '',
      is_active: true,
    },
  });

  const loanerType = form.watch('loaner_type');

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['loaners'],
    endpoint: 'loaners/',
  });

  const onReset = useCallback(() => {
    form.reset();
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/loans/loaners',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleAdd({
      name: data.name,
      loaner_type: data.loaner_type,
      customer: data.loaner_type === 'customer' ? data.customer || null : null,
      vendor: data.loaner_type === 'vendor' ? data.vendor || null : null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      is_active: data.is_active,
    });
  };

  return (
    <FormPage
      title={t('loans.addLoaner')}
      icon={<Users />}
      backTo="/loaners"
    >
<Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="loaner_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('loans.loanerType')} *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('customer', '');
                        form.setValue('vendor', '');
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="customer">{t('loans.loanerTypes.customer')}</SelectItem>
                        <SelectItem value="vendor">{t('loans.loanerTypes.vendor')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {loanerType === 'customer' ? (
                <FormField
                  control={form.control}
                  name="customer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loans.selectCustomer')} *</FormLabel>
                      <FormControl>
                        <Autocomplete
                          endpoint="customers"
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('loans.selectCustomer')}
                          getOptionLabel={(c) => c.name}
                          getOptionValue={(c) => c.id.toString()}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="vendor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loans.selectVendor')} *</FormLabel>
                      <FormControl>
                        <Autocomplete
                          endpoint="vendors"
                          value={field.value}
                          onChange={field.onChange}
                          placeholder={t('loans.selectVendor')}
                          getOptionLabel={(v) => v.name}
                          getOptionValue={(v) => v.id.toString()}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormPageFields>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loans.loanerName')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('loans.loanerNameOptional')} {...field} />
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
                      <FormLabel>{t('loans.loanerPhone')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('loans.loanerEmail')}</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('loans.loanerAddress')}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormActions
                mode="create"
                showSaveAndCreateNew={showSaveAndCreateNew}
                onIntent={onIntent}
                onCancel={() => navigate('/loans/loaners')}
                loading={loading}
                submitLabel={t('loans.addLoaner')}
                loadingLabel={t('common.adding')}
              />
            </form>
          </Form>
    </FormPage>
  );
};

export default AddLoaner;
