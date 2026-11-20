import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { ReloadIcon } from '@radix-ui/react-icons';
import { formatApiError, formatFormErrors, notifyError, notifySuccess } from '@/lib/notify';
import { Form } from '@/components/ui/form';
import { SaleFormContent } from '@/components/forms/SaleFormContent';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import type { Sale } from '@/types/sale';
import {
  createSalePackagingFormSchema,
  defaultSalePackagingFormValues,
  salePackagingFormToPayload,
  saleToPackagingFormValues,
  type SalePackagingFormValues,
} from '@/lib/salePackagingFormSchemas';

const EditSale = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);

  const schema = useMemo(() => createSalePackagingFormSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultSalePackagingFormValues(),
  });

  const { data: sale, isLoading: saleLoading } = useFetchObjects<Sale>({
    queryKey: ['sale', id],
    endpoint: `sales/${id}`,
    enabled: !!id,
  });

  useEffect(() => {
    if (sale) form.reset(saleToPackagingFormValues(sale));
  }, [sale, form]);

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
    if (!sale) return;
    setLoading(true);
    try {
      await api.patch(`/sales/${sale.id}/`, salePackagingFormToPayload(data));
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      notifySuccess(t('sales.saleUpdated', 'Sale updated successfully'), {
        title: t('common.success', 'Success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate(`/sales/${sale.id}`);
    } catch (error: unknown) {
      notifyError(formatApiError(error, t('common.error', 'Could not update sale')), {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
    } finally {
      setLoading(false);
    }
  };

  if (saleLoading) {
    return (
      <div className="flex justify-center py-10">
        <ReloadIcon className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <SaleFormContent
          control={form.control}
          setValue={form.setValue}
          title={t('sales.editSale', 'Edit sale')}
          loading={loading}
          onCancel={() => navigate(id ? `/sales/${id}` : '/sales')}
          submitLabel={t('sales.updateSale', 'Update sale')}
          loadingLabel={t('sales.updatingSale', 'Updating…')}
        />
      </form>
    </Form>
  );
};

export default EditSale;
