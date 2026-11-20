import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { ReloadIcon } from '@radix-ui/react-icons';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';
import { Form } from '@/components/ui/form';
import { PurchaseFormContent } from '@/components/forms/PurchaseFormContent';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import type { Purchase } from '@/types/purchase';
import {
  createPurchaseFormSchema,
  defaultPurchaseFormValues,
  purchaseFormToUpdatePayload,
  purchaseToFormValues,
} from '@/lib/purchaseFormSchemas';

const EditPurchase = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);

  const schema = useMemo(() => createPurchaseFormSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultPurchaseFormValues(),
  });

  const { data: purchase, isLoading } = useFetchObjects<Purchase>({
    queryKey: ['purchase', id],
    endpoint: `purchases/${id}`,
    enabled: !!id,
  });

  useEffect(() => {
    if (purchase) form.reset(purchaseToFormValues(purchase));
  }, [purchase, form]);

  const onSubmit = async (data: z.infer<typeof schema>) => {
    if (!purchase) return;
    setLoading(true);
    try {
      await api.patch(`/purchases/${purchase.id}/`, purchaseFormToUpdatePayload(data));
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      notifySuccess(t('purchases.purchaseUpdated', 'Purchase updated successfully'), {
        title: t('common.success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate(`/purchases/${purchase.id}`);
    } catch (error: any) {
      notifyError(
        formatApiError(error, t('purchases.purchaseUpdateFailed', 'Failed to update purchase')),
        {
          title: t('common.validationError', 'Validation Error'),
          dismissLabel: t('common.dismiss') || 'Dismiss',
        },
      );
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto flex justify-center py-6">
        <ReloadIcon className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <PurchaseFormContent
          control={form.control}
          setValue={form.setValue}
          title={t('purchases.editPurchase', 'Edit purchase')}
          loading={loading}
          onCancel={() => navigate(id ? `/purchases/${id}` : '/purchases')}
          submitLabel={t('purchases.updatePurchase', 'Update purchase')}
          loadingLabel={t('purchases.updatingPurchase', 'Updating…')}
        />
      </form>
    </Form>
  );
};

export default EditPurchase;
