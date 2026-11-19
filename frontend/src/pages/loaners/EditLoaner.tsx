import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Users } from 'lucide-react';import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { useLanguage } from '@/contexts/LanguageContext';
import useUpdate from '@/api/useUpdate';
import useFetchObjects from '@/api/useFetchObjects';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, requiredString } from '@/lib/formSchemas';

const EditLoaner = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        name: requiredString(t('loans.validation.loanerName')),
        phone: z.string().optional(),
        email: z.string().optional(),
        address: z.string().optional(),
        is_active: z.boolean(),
      }),
    [messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      address: '',
      is_active: true,
    },
  });

  const { data: loaner } = useFetchObjects({
    queryKey: ['loaner', id],
    endpoint: `loaners/${id}/`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['loaners'],
  });

  useEffect(() => {
    if (loaner) {
      form.reset({
        name: loaner.name || '',
        phone: loaner.phone || '',
        email: loaner.email || '',
        address: loaner.address || '',
        is_active: loaner.is_active ?? true,
      });
    }
  }, [loaner, form]);

  useRedirectOnSuccess(isSuccess, '/loans/loaners');

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!id) return;
    handleUpdate(id, data);
  };

  return (
    <FormPage
      title={t('loans.editLoaner')}
      icon={<Users />}
      backTo="/loaners"
    >
<Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormPageFields>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('loans.loanerName')} *</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter loaner name" {...field} />
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
                        <Input placeholder="Enter phone number" {...field} />
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
                      <Input type="email" placeholder="Enter email address" {...field} />
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
                      <Textarea placeholder="Enter address" rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">{t('common.active')}</FormLabel>
                  </FormItem>
                )}
              />

              <FormActions
                onCancel={() => navigate('/loans/loaners')}
                loading={loading}
                submitLabel={t('common.update')}
                loadingLabel={t('common.updating')}
              />
            </form>
          </Form>
    </FormPage>
  );
};

export default EditLoaner;
