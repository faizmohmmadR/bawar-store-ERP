import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { notifySuccess } from '@/lib/notify';
import { Form } from '@/components/ui/form';
import { PurchaseFormContent } from '@/components/forms/PurchaseFormContent';
import { useLanguage } from '@/contexts/LanguageContext';
import api from '@/api/client';
import {
  createPurchaseFormSchema,
  defaultPurchaseFormValues,
  purchaseFormToAddPayload,
} from '@/lib/purchaseFormSchemas';

const AddPurchase = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const schema = useMemo(() => createPurchaseFormSchema(t), [t]);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultPurchaseFormValues(),
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    try {
      await api.post('/purchases/', purchaseFormToAddPayload(data));
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-balances'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      notifySuccess(t('purchases.purchaseAdded', 'Purchase added successfully'), {
        title: t('common.success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate('/purchases');
    } catch (error: any) {
      const payload = error?.response?.data;
      const message =
        payload && typeof payload === 'object'
          ? Object.entries(payload)
            .map(
              ([key, value]) =>
                `${key.charAt(0).toUpperCase() + key.slice(1)}: ${Array.isArray(value) ? value.join(', ') : value}`,
            )
            .join('. ')
          : t('purchases.purchaseAddFailed', 'Failed to add purchase');
      toast.error(t('common.error'), {
        description: message,
        style: { background: '#fee2e2', border: '1px solid #fca5a5' },
        duration: 6000,
        position: 'top-right',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <PurchaseFormContent
          control={form.control}
          setValue={form.setValue}
          title={t('purchases.addPurchase', 'Add purchase')}
          loading={loading}
          onCancel={() => navigate('/purchases')}
          submitLabel={t('purchases.addPurchase', 'Add purchase')}
          loadingLabel={t('purchases.addingPurchase', 'Saving…')}
        />
      </form>
    </Form>
  );
};

export default AddPurchase;
