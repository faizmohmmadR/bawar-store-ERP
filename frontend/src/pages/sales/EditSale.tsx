import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { ReloadIcon } from '@radix-ui/react-icons';
import { formatApiError, formatFormErrors, notifyError, notifySuccess } from '@/lib/notify';
import { Form } from '@/components/ui/form';
import { SaleOrderFormContent } from '@/components/forms/SaleOrderFormContent';
import type { FormSubmitIntent } from '@/components/forms/FormActions';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCalendarPreference } from '@/contexts/CalendarPreferenceContext';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import { Sale } from '@/types/sale';
import {
  createSaleFormSchema,
  defaultSaleFormValues,
  saleFormToUpdatePayload,
  saleToFormValues,
  type SaleFormValues,
} from '@/lib/saleFormSchemas';
import { fetchAfnPerUsdRate, isUsdCurrency } from '@/lib/saleFx';

const EditSale = () => {
  const { t } = useLanguage();
  const { calendar } = useCalendarPreference();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const submitIntent = useRef<FormSubmitIntent>('save');
  const [loading, setLoading] = useState(false);

  const schema = useMemo(() => createSaleFormSchema(t), [t]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaultSaleFormValues(),
  });

  const { data: sale, isLoading: saleLoading } = useFetchObjects<Sale>({
    queryKey: ['sale', id],
    endpoint: `sales/${id}`,
    enabled: !!id,
  });

  useEffect(() => {
    if (sale) {
      form.reset(saleToFormValues(sale));
    }
  }, [sale, form]);

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
    if (!sale) return;
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
      await api.patch(`/sales/${sale.id}/`, saleFormToUpdatePayload(cleaned, { afnPerUsd, periodCalendar: calendar }));
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      queryClient.invalidateQueries({ queryKey: ['salesmen'] });
      if (cleaned.party_type === 'employee' || sale.employee) {
        queryClient.invalidateQueries({ queryKey: ['employee-payroll-history'] });
        queryClient.invalidateQueries({ queryKey: ['employee-financial-summary'] });
        queryClient.invalidateQueries({ queryKey: ['employee-yearly-summary'] });
        queryClient.invalidateQueries({ queryKey: ['payrolls'] });
        queryClient.invalidateQueries({ queryKey: ['employee'] });
        queryClient.invalidateQueries({ queryKey: ['employees'] });
      }
      notifySuccess(t('sales.saleUpdated'), {
        title: t('common.success', 'Success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });

      if (submitIntent.current === 'save_and_new') {
        navigate('/sales/add');
        return;
      }
      navigate('/sales');
    } catch (error: unknown) {
      notifyError(
        formatApiError(error, t('common.error', 'Could not update sale')),
        {
          title: t('common.validationError', 'Validation Error'),
          dismissLabel: t('common.dismiss') || 'Dismiss',
        },
      );
    } finally {
      setLoading(false);
    }
  };

  if (saleLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (!sale) {
    return null;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <SaleOrderFormContent
          control={form.control}
          setValue={form.setValue}
          title={t('sales.editSale')}
          loading={loading}
          onCancel={() => navigate('/sales')}
          submitLabel={`${t('common.update')} ${t('sales.sales')}`}
          loadingLabel={t('common.updating')}
          showSaveAndCreateNew
          onIntent={(intent) => {
            submitIntent.current = intent;
          }}
        />
      </form>
    </Form>
  );
};

export default EditSale;
