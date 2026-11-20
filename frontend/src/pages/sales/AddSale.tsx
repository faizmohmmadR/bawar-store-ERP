import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { formatApiError, formatFormErrors, notifyError, notifySuccess } from '@/lib/notify';
import { Form } from '@/components/ui/form';
import { SaleFormContent } from '@/components/forms/SaleFormContent';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/api/client';
import {
  createSalePackagingFormSchema,
  defaultSalePackagingFormValues,
  salePackagingFormToPayload,
  type SalePackagingFormValues,
} from '@/lib/salePackagingFormSchemas';
import type { FieldErrors } from 'react-hook-form';

const AddSale = () => {
  const { t } = useLanguage();
  const { isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const schema = useMemo(() => createSalePackagingFormSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultSalePackagingFormValues(),
  });

  if (authLoading) return null;

  const onInvalid = (errors: FieldErrors<SalePackagingFormValues>) => {
    notifyError(
      formatFormErrors(errors, t('sales.formInvalid', 'Please complete the required sale fields')),
      {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      },
    );
  };

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    try {
      await api.post('/sales/', salePackagingFormToPayload(data));
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      notifySuccess(t('sales.saleAdded', 'Sale added successfully'), {
        title: t('common.success', 'Success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate('/sales');
    } catch (error: unknown) {
      notifyError(formatApiError(error, t('common.error', 'Could not save sale')), {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <SaleFormContent
          control={form.control}
          setValue={form.setValue}
          title={t('sales.addSale', 'Add sale')}
          loading={loading}
          onCancel={() => navigate('/sales')}
          submitLabel={t('sales.addSale', 'Add sale')}
          loadingLabel={t('sales.addingSale', 'Saving…')}
        />
      </form>
    </Form>
  );
};

export default AddSale;
