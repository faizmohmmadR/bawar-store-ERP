import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { notifySuccess } from '@/lib/notify';
import { Form } from '@/components/ui/form';
import { RawMaterialPurchaseFormContent } from '@/components/forms/RawMaterialPurchaseFormContent';
import { useLanguage } from '@/contexts/LanguageContext';
import api from '@/api/client';
import {
  createRawMaterialPurchaseFormSchema,
  defaultRawMaterialPurchaseFormValues,
  rawMaterialPurchaseFormToAddPayload,
} from '@/lib/rawMaterialPurchaseFormSchemas';

const AddRawMaterialPurchase = ({ stockEntry = false }: { stockEntry?: boolean }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const schema = useMemo(() => createRawMaterialPurchaseFormSchema(t), [t]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultRawMaterialPurchaseFormValues(),
  });

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    try {
      const { data: purchase } = await api.post<{ id: number; invoice_number?: string }>(
        '/raw-material-purchases/',
        rawMaterialPurchaseFormToAddPayload(stockEntry ? { ...data, status: 'received' } : data),
      );
      queryClient.invalidateQueries({ queryKey: ['raw-material-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-stocks'] });
      notifySuccess(t('rawMaterialPurchases.purchaseAdded', 'Purchase added successfully'), {
        title: t('common.success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate(stockEntry ? '/raw-material-stocks' : '/raw-material-purchases');
    } catch (error: any) {
      const payload = error?.response?.data;
      const message = payload && typeof payload === 'object'
        ? Object.entries(payload)
          .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${Array.isArray(value) ? value.join(', ') : value}`)
          .join('. ')
        : t('rawMaterialPurchases.purchaseAddFailed');
      toast.error(t('common.error'), {
        description: message,
        style: {
          background: '#fee2e2',
          border: '1px solid #fca5a5',
        },
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
        <RawMaterialPurchaseFormContent
          control={form.control}
          setValue={form.setValue}
          title={t(stockEntry ? 'rawMaterials.addStock' : 'rawMaterialPurchases.addPurchase')}
          receivedOnly={stockEntry}
          loading={loading}
          onCancel={() => navigate(stockEntry ? '/raw-material-stocks' : '/raw-material-purchases')}
          submitLabel={t(stockEntry ? 'rawMaterials.addStock' : 'rawMaterialPurchases.addPurchase')}
          loadingLabel={t('rawMaterialPurchases.addingPurchase')}
        />
      </form>
    </Form>
  );
};

export default AddRawMaterialPurchase;
