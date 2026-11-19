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
import { Salesman } from '@/types/salesman';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, requiredString } from '@/lib/formSchemas';

const EditSalesman = () => {
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
        notes: z.string().optional(),
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
      notes: '',
      status: 'active',
    },
  });

  const { data: salesman, isLoading } = useFetchObjects<Salesman>({
    queryKey: ['salesmen', id],
    endpoint: `salesmen/${id}`,
    enabled: !!id,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate<Salesman>({
    queryKey: ['salesmen'],
    showSuccessToast: true,
    showErrorToast: true,
    invalidateQueries: true,
  });

  useEffect(() => {
    if (salesman) {
      form.reset({
        name: salesman.name || '',
        phone: salesman.phone || '',
        email: salesman.email || '',
        address: salesman.address || '',
        notes: salesman.notes || '',
        status: salesman.is_active !== false ? 'active' : 'inactive',
      });
    }
  }, [salesman, form]);

  useRedirectOnSuccess(isSuccess, '/salesmen');

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

  if (!salesman) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">{t('salesmen.notFound')}</p>
      </div>
    );
  }

  return (
    <FormPage title={t('salesmen.editSalesman')} backTo="/salesmen">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageSection title={t('salesmen.salesmanDetails')}>
            <FormPageFields>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('salesmen.name')} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t('salesmen.namePlaceholder')} {...field} />
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
                    <FormLabel>{t('salesmen.phone')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('salesmen.phonePlaceholder')} {...field} />
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
                    <FormLabel>{t('salesmen.email')}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder={t('salesmen.emailPlaceholder')} {...field} />
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
                    <FormLabel>{t('salesmen.status')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || 'active'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('salesmen.selectStatus')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">{t('salesmen.active')}</SelectItem>
                        <SelectItem value="inactive">{t('salesmen.inactive')}</SelectItem>
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
                    <FormLabel>{t('salesmen.address')}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t('salesmen.addressPlaceholder')} rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('salesmen.notes')}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t('salesmen.notesPlaceholder')} rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormPageFields>
          </FormPageSection>

          <FormActions
            mode="edit"
            onCancel={() => navigate('/salesmen')}
            loading={loading}
            submitLabel={t('common.save')}
            loadingLabel={t('common.saving')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default EditSalesman;
