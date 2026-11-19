import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { ReloadIcon } from '@radix-ui/react-icons';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';
import { Form } from '@/components/ui/form';
import { RawMaterialPurchaseFormContent } from '@/components/forms/RawMaterialPurchaseFormContent';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import { RawMaterialPurchase } from '@/types/raw-material';
import {
  createRawMaterialPurchaseFormSchema,
  defaultRawMaterialPurchaseFormValues,
  rawMaterialPurchaseFormToUpdatePayload,
  rawMaterialPurchaseToFormValues,
} from '@/lib/rawMaterialPurchaseFormSchemas';

const EditRawMaterialPurchase = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);

  const schema = useMemo(() => createRawMaterialPurchaseFormSchema(t), [t]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultRawMaterialPurchaseFormValues(),
  });

  const { data: purchase, isLoading: purchaseLoading } = useFetchObjects<RawMaterialPurchase>({
    queryKey: ['raw-material-purchase', id],
    endpoint: `raw-material-purchases/${id}`,
    enabled: !!id,
  });

  useEffect(() => {
    if (purchase) {
      form.reset(rawMaterialPurchaseToFormValues(purchase));
    }
  }, [purchase, form]);

  const onSubmit = async (data: z.infer<typeof schema>) => {
    if (!purchase) return;
    setLoading(true);
    try {
      await api.patch(`/raw-material-purchases/${purchase.id}/`, rawMaterialPurchaseFormToUpdatePayload(data));
      queryClient.invalidateQueries({ queryKey: ['raw-material-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-purchase', id] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-stocks'] });
      notifySuccess(t('rawMaterialPurchases.purchaseUpdated', 'Purchase updated successfully'), {
        title: t('common.success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate('/raw-material-purchases');
    } catch (error: any) {
      const payload = error?.response?.data;
      const message = payload && typeof payload === 'object'
        ? Object.entries(payload)
          .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${Array.isArray(value) ? value.join(', ') : value}`)
          .join('. ')
        : t('rawMaterialPurchases.purchaseUpdateFailed');
      notifyError(formatApiError(error, String(message)), {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
    } finally {
      setLoading(false);
    }
  };

  if (purchaseLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <RawMaterialPurchaseFormContent
          control={form.control}
          setValue={form.setValue}
          title={t('rawMaterialPurchases.editPurchase')}
          loading={loading}
          onCancel={() => navigate('/raw-material-purchases')}
          submitLabel={t('rawMaterialPurchases.updatePurchaseAction')}
          loadingLabel={t('rawMaterialPurchases.updatingPurchase')}
        />
      </form>
    </Form>
  );
};

export default EditRawMaterialPurchase;
