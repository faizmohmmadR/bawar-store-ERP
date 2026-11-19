import { saleErrorLabel, saleApiIssues, setSaleApiErrors, revealSaleErrors } from '@/lib/saleValidation';
import { formatValidationIssues } from '@/lib/validationErrors';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, type FieldErrors } from 'react-hook-form';
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
  defaultSaleItemForType,
  saleFormToAddPayload,
  type SaleFormValues,
} from '@/lib/saleFormSchemas';
import { fetchAfnPerUsdRate, isUsdCurrency } from '@/lib/saleFx';

const AddRawMaterialSale = () => {
  const { t } = useLanguage();
  const { calendar } = useCalendarPreference();
  const { isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const submitIntent = useRef<FormSubmitIntent>('save');
  const [loading, setLoading] = useState(false);

  const schema = useMemo(() => createSaleFormSchema(t), [t]);
  const defaults = {
    ...defaultSaleFormValues(),
    sale_type: 'raw_material' as const,
    items: [defaultSaleItemForType('raw_material')],
  };

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  if (authLoading) return null;

  const cleanSaleData = (data: SaleFormValues): SaleFormValues => ({
    ...data,
    sale_type: 'raw_material',
    items: data.items.filter((item) => Boolean(item.raw_material_stock)),
  });

  const onInvalid = (errors: FieldErrors<SaleFormValues>) => {
    revealSaleErrors();
    notifyError(
      formatFormErrors(errors, t('sales.fixInvalid', 'Please complete the required sale fields'), path => saleErrorLabel(path, t)),
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

    form.clearErrors();
    setLoading(true);
    try {
      let afnPerUsd = 1;
      if (isUsdCurrency(cleaned.currency)) {
        afnPerUsd = await fetchAfnPerUsdRate(cleaned.currency, cleaned.sale_date);
      }
      const payload = saleFormToAddPayload(cleaned, { afnPerUsd, periodCalendar: calendar });
      const { data: sale } = await api.post('/raw-material-sales/', payload);
      for (const key of ['vendors', 'vendor', 'raw-material-purchases', 'raw-material-purchase', 'general-payment-balance', 'payments', 'financial-reports']) queryClient.invalidateQueries({ queryKey: [key] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-sales'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-stocks'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      if (cleaned.party_type === 'employee') {
        queryClient.invalidateQueries({ queryKey: ['employee-payroll-history'] });
        queryClient.invalidateQueries({ queryKey: ['employee-financial-summary'] });
        queryClient.invalidateQueries({ queryKey: ['employee-yearly-summary'] });
        queryClient.invalidateQueries({ queryKey: ['payrolls'] });
        queryClient.invalidateQueries({ queryKey: ['employee'] });
        queryClient.invalidateQueries({ queryKey: ['employees'] });
      }
      notifySuccess(t('rawMaterialSales.saleAdded', 'Raw material sale saved'), {
        title: t('common.success', 'Success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });

      if (submitIntent.current === 'save_and_new') {
        form.reset(defaults);
        submitIntent.current = 'save';
        return;
      }
      navigate(`/raw-material-sales/${sale.id}`);
    } catch (error: unknown) {
      const issues = saleApiIssues(error, data.items);
      setSaleApiErrors(issues, form.setError);
      if (issues.length) revealSaleErrors();
      notifyError(
        formatValidationIssues(issues, formatApiError(error, t('common.error', 'Could not save sale')), path => saleErrorLabel(path, t)),
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
          title={t('rawMaterialSales.addSale', 'Sell raw material')}
          loading={loading}
          onCancel={() => navigate('/raw-material-sales')}
          submitLabel={t('rawMaterialSales.saveSale', 'Save sale')}
          loadingLabel={t('common.adding')}
          showSaveAndCreateNew
          lockedSaleType="raw_material"
          onIntent={(intent) => {
            submitIntent.current = intent;
          }}
        />
      </form>
    </Form>
  );
};

export default AddRawMaterialSale;
