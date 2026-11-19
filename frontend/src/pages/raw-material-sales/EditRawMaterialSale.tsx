import { saleErrorLabel, saleApiIssues, setSaleApiErrors, revealSaleErrors } from '@/lib/saleValidation';
import { formatValidationIssues } from '@/lib/validationErrors';
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
  defaultSaleItemForType,
  saleFormToUpdatePayload,
  saleToFormValues,
  type SaleFormValues,
} from '@/lib/saleFormSchemas';
import { fetchAfnPerUsdRate, isUsdCurrency } from '@/lib/saleFx';

const EditRawMaterialSale = () => {
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
    defaultValues: {
      ...defaultSaleFormValues(),
      sale_type: 'raw_material',
      items: [defaultSaleItemForType('raw_material')],
    },
  });

  const { data: sale, isLoading: saleLoading } = useFetchObjects<Sale>({
    queryKey: ['raw-material-sale', id],
    endpoint: `raw-material-sales/${id}`,
    enabled: !!id,
  });

  useEffect(() => {
    if (sale) {
      form.reset({ ...saleToFormValues(sale), sale_type: 'raw_material' });
    }
  }, [sale, form]);

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
    if (!sale) return;
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
      await api.patch(
        `/raw-material-sales/${sale.id}/`,
        saleFormToUpdatePayload(cleaned, { afnPerUsd, periodCalendar: calendar }),
      );
      for (const key of ['vendors', 'vendor', 'raw-material-purchases', 'raw-material-purchase', 'general-payment-balance', 'payments', 'financial-reports']) queryClient.invalidateQueries({ queryKey: [key] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-sales'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-sale', id] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-stocks'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      if (cleaned.party_type === 'employee' || sale.employee) {
        queryClient.invalidateQueries({ queryKey: ['employee-payroll-history'] });
        queryClient.invalidateQueries({ queryKey: ['employee-financial-summary'] });
        queryClient.invalidateQueries({ queryKey: ['employee-yearly-summary'] });
        queryClient.invalidateQueries({ queryKey: ['payrolls'] });
        queryClient.invalidateQueries({ queryKey: ['employee'] });
        queryClient.invalidateQueries({ queryKey: ['employees'] });
      }
      notifySuccess(t('rawMaterialSales.saleUpdated', 'Raw material sale updated'), {
        title: t('common.success', 'Success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      if (submitIntent.current === 'save_and_new') {
        navigate('/raw-material-sales/add');
        return;
      }
      navigate(`/raw-material-sales/${sale.id}`);
    } catch (error: unknown) {
      const issues = saleApiIssues(error, data.items);
      setSaleApiErrors(issues, form.setError);
      if (issues.length) revealSaleErrors();
      notifyError(
        formatValidationIssues(issues, formatApiError(error, t('common.error', 'Could not update sale')), path => saleErrorLabel(path, t)),
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
  if (!sale) return null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
        <SaleOrderFormContent
          control={form.control}
          setValue={form.setValue}
          title={t('rawMaterialSales.editSale', 'Edit raw material sale')}
          loading={loading}
          onCancel={() => navigate(`/raw-material-sales/${sale.id}`)}
          submitLabel={t('common.save')}
          loadingLabel={t('common.updating')}
          lockedSaleType="raw_material"
          onIntent={(intent) => {
            submitIntent.current = intent;
          }}
        />
      </form>
    </Form>
  );
};

export default EditRawMaterialSale;
