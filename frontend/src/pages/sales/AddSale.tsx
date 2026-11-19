import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { formatApiError, formatFormErrors, notifyError, notifySuccess } from '@/lib/notify';
import { Form } from '@/components/ui/form';
import { SaleOrderFormContent } from '@/components/forms/SaleOrderFormContent';
import type { FormSubmitIntent } from '@/components/forms/FormActions';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import api from '@/api/client';
import {
  createSaleFormSchema,
  defaultSaleFormValues,
  saleFormToAddPayload,
  type SaleFormValues,
} from '@/lib/saleFormSchemas';
import { fetchAfnPerUsdRate, isUsdCurrency } from '@/lib/saleFx';
import type { FieldErrors } from 'react-hook-form';

const AddSale = () => {
  const { t } = useLanguage();
  const { calendar } = useCalendarPreference();
  const { isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submitIntent = useRef<FormSubmitIntent>('save');
  const [loading, setLoading] = useState(false);

  const schema = useMemo(() => createSaleFormSchema(t), [t]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultSaleFormValues(),
  });

  if (authLoading) {
    return null;
  }

  const cleanSaleData = (data: SaleFormValues): SaleFormValues => ({
    ...data,
    items: data.items.filter(
      (item) => Boolean(item.stock || item.storage_tank || item.raw_material_stock),
    ),
  });

  const onInvalid = (errors: FieldErrors<SaleFormValues>) => {
    notifyError(
      formatFormErrors(errors, t('sales.fixInvalid', 'Please complete the required sale fields')),
      {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      },
    );
  };

  const onSubmit = async (data: z.infer<typeof schema>) => {
    const cleaned = cleanSaleData(data);
    if (!cleaned.items.length) {
      notifyError(t('sales.itemsRequired', 'Add at least one sale item'), {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      return;
    }

    setLoading(true);
    try {
      let afnPerUsd = 1;
      if (isUsdCurrency(cleaned.currency)) {
        afnPerUsd = await fetchAfnPerUsdRate(cleaned.currency, cleaned.sale_date);
      }
      await api.post('/sales/', saleFormToAddPayload(cleaned, { afnPerUsd, periodCalendar: calendar }));
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['salesmen'] });
      if (cleaned.party_type === 'employee') {
        queryClient.invalidateQueries({ queryKey: ['employee-payroll-history'] });
        queryClient.invalidateQueries({ queryKey: ['employee-financial-summary'] });
        queryClient.invalidateQueries({ queryKey: ['employee-yearly-summary'] });
        queryClient.invalidateQueries({ queryKey: ['payrolls'] });
        queryClient.invalidateQueries({ queryKey: ['employee'] });
        queryClient.invalidateQueries({ queryKey: ['employees'] });
      }
      notifySuccess(t('sales.saleAdded'), {
        title: t('common.success', 'Success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });

      if (submitIntent.current === 'save_and_new') {
        form.reset(defaultSaleFormValues());
        submitIntent.current = 'save';
        return;
      }
      navigate('/sales');
    } catch (error: unknown) {
      notifyError(
        formatApiError(error, t('common.error', 'Could not save sale')),
        {
          title: t('common.validationError', 'Validation Error'),
          dismissLabel: t('common.dismiss') || 'Dismiss',
        },
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <SaleOrderFormContent
          control={form.control}
          setValue={form.setValue}
          title={t('sales.addSale')}
          loading={loading}
          onCancel={() => navigate('/sales')}
          submitLabel={`${t('common.add')} ${t('sales.sales')}`}
          loadingLabel={t('common.adding')}
          showSaveAndCreateNew
          onIntent={(intent) => {
            submitIntent.current = intent;
          }}
        />
      </form>
    </Form>
  );
};

export default AddSale;
