import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { ReloadIcon } from '@radix-ui/react-icons';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { Autocomplete } from '@/components/ui/autocomplete';
import { SaleQtyInput } from '@/components/forms/SaleOrderFormContent';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import api from '@/api/client';
import type { Sale } from '@/types/sale';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { formatOrderNumeric, roundOrderNumeric } from '@/lib/orderNumeric';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';

type RmLineValues = {
  raw_material_stock: string;
  unit: 'kg' | 'piece';
  quantity: number;
  sell_price: number;
};

const emptyLine = (): RmLineValues => ({
  raw_material_stock: '',
  unit: 'piece',
  quantity: 0,
  sell_price: 0,
});

const AddRawMaterialToSale = () => {
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        items: z
          .array(
            z.object({
              raw_material_stock: requiredString(messages.required),
              unit: z.enum(['kg', 'piece']),
              quantity: z.coerce.number().gt(0, t('sales.qtyRequired', 'Enter quantity')),
              sell_price: z.coerce.number().min(0),
            }),
          )
          .min(1, messages.required),
      }),
    [messages.required, t],
  );

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { items: [emptyLine()] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });
  const watchedItems = useWatch({ control: form.control, name: 'items' }) ?? [];

  const { data: sale, isLoading: saleLoading, isError } = useFetchObjects<Sale>({
    queryKey: ['sale', id],
    endpoint: `sales/${id}`,
    enabled: !!id,
  });

  const onSubmit = async (data: FormValues) => {
    if (!sale || !id) return;
    setLoading(true);
    try {
      for (const item of data.items) {
        const isKg = item.unit === 'kg';
        const qty = roundOrderNumeric(Number(item.quantity) || 0);

        await api.post('/sales-items/', {
          sales: Number(id),
          sale_source: 'raw_material',
          raw_material_stock: Number(item.raw_material_stock),
          stock: null,
          storage_tank: null,
          unit: isKg ? 'kg' : 'piece',
          quantity: qty,
          liter_amount: isKg ? 0 : qty,
          kilogram_amount: isKg ? qty : 0,
          piece_count: 0,
          sell_price: roundOrderNumeric(Number(item.sell_price) || 0),
          commission_amount: 0,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale', id] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-stocks'] });
      notifySuccess(t('sales.rawMaterialAdded', 'Raw materials added to sale'), {
        title: t('common.success', 'Success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate(`/sales/${id}`);
    } catch (error: unknown) {
      const payload = (error as { response?: { data?: unknown } })?.response?.data;
      const message =
        payload && typeof payload === 'object'
          ? Object.values(payload as Record<string, unknown>).flat().join('. ')
          : t('common.error', 'Could not add raw materials');
      notifyError(formatApiError(error, String(message)), {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
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

  if (isError || !sale) {
    return (
      <div className="container mx-auto py-6 text-center space-y-4">
        <p className="text-muted-foreground">{t('sales.saleNotFound', 'Sale not found')}</p>
        <Button variant="outline" onClick={() => navigate('/sales')}>
          <ArrowLeft className="h-4 w-4 me-2" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  if (sale.status === 'cancelled') {
    return (
      <div className="container mx-auto py-6 text-center space-y-4">
        <p className="text-muted-foreground">
          {t('sales.cannotAddRawMaterialCancelled', 'Cannot add raw materials to a cancelled sale.')}
        </p>
        <Button variant="outline" onClick={() => navigate(`/sales/${id}`)}>
          <ArrowLeft className="h-4 w-4 me-2" />
          {t('common.back')}
        </Button>
      </div>
    );
  }

  const currencyId = sale.currency_details?.id ?? sale.currency;
  const currencyLabel =
    sale.currency_details?.code || (Number(currencyId) === 2 ? 'USD' : 'AFN');
  const currencySymbol = resolveCurrencySymbol(currencyId);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate(`/sales/${id}`)}>
          <ArrowLeft className="h-4 w-4 me-2" />
          {t('common.back')}
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            {t('sales.addRawMaterial', 'Add raw material')}
          </h1>
          <p className="text-sm text-muted-foreground truncate">
            {sale.invoice_number}
            {sale.customer_details?.name ? ` · ${sale.customer_details.name}` : ''}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-6 space-y-4">
              {fields.map((field, index) => {
                const item = watchedItems[index];
                const unit = item?.unit || 'piece';
                const qtyLabel =
                  unit === 'kg'
                    ? t('sales.qtyKg', 'Quantity (Kg)')
                    : t('sales.qtyPiece', 'Quantity (pcs)');
                const priceLabel =
                  unit === 'kg'
                    ? t('sales.pricePerKg', 'Price / Kg')
                    : t('sales.pricePerPiece', 'Price / pcs');
                const quantity = Number(item?.quantity) || 0;
                const price = Number(item?.sell_price) || 0;

                return (
                  <div
                    key={field.id}
                    className="rounded-lg border p-3 sm:p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-primary">
                        {t('sales.rawMaterial', 'Raw material')} #{index + 1}
                      </p>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name={`items.${index}.raw_material_stock`}
                      render={({ field: rmField }) => (
                        <FormItem>
                          <FormLabel>{t('sales.rawMaterial', 'Raw material')} *</FormLabel>
                          <FormControl>
                            <Autocomplete
                              endpoint="raw-material-stocks"
                              value={rmField.value}
                              onChange={(value, option) => {
                                rmField.onChange(value?.toString() || '');
                                const rmUnit =
                                  String(option?.raw_material_details?.unit || 'piece') === 'kg'
                                    ? 'kg'
                                    : 'piece';
                                form.setValue(`items.${index}.unit`, rmUnit, { shouldDirty: true });
                                form.setValue(`items.${index}.quantity`, 0, { shouldDirty: true });
                              }}
                              placeholder={t('sales.selectRawMaterial', 'Select raw material')}
                              getOptionLabel={(option) => {
                                const name =
                                  option?.raw_material_details?.name
                                  || option?.raw_material_name
                                  || t('sales.rawMaterial', 'Raw material');
                                const rmUnit = option?.raw_material_details?.unit || 'kg';
                                return `${name} · ${Number(option?.quantity || 0).toLocaleString()} ${rmUnit}`;
                              }}
                              getOptionValue={(option) => option.id.toString()}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field: qtyField }) => (
                          <FormItem>
                            <FormLabel>{qtyLabel} *</FormLabel>
                            <FormControl>
                              <SaleQtyInput
                                value={qtyField.value}
                                onChange={qtyField.onChange}
                                className="h-9 w-full"
                                placeholder={qtyLabel}
                                aria-label={qtyLabel}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`items.${index}.sell_price`}
                        render={({ field: priceField }) => (
                          <FormItem>
                            <FormLabel>{priceLabel} ({currencyLabel}) *</FormLabel>
                            <FormControl>
                              <SaleQtyInput
                                value={priceField.value}
                                onChange={priceField.onChange}
                                className="h-9 w-full"
                                placeholder={priceLabel}
                                aria-label={priceLabel}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <p className="text-sm font-semibold text-right">
                      {t('sales.total', 'Total')}:{' '}
                      {currencySymbol}
                      {formatOrderNumeric(roundOrderNumeric(quantity * price))}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {t('sales.unit', 'Unit')}:{' '}
                      {unit === 'kg'
                        ? t('sales.kilogramShort', 'kg')
                        : t('sales.piecesShort', 'pcs')}
                    </p>
                  </div>
                );
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append(emptyLine())}
              >
                <Plus className="h-4 w-4 me-1.5" />
                {t('sales.addLine', 'Add line')}
              </Button>
            </CardContent>
          </Card>

          <FormActions
            loading={loading}
            onCancel={() => navigate(`/sales/${id}`)}
            submitLabel={t('sales.addRawMaterial', 'Add raw material')}
            loadingLabel={t('common.saving', 'Saving...')}
          />
        </form>
      </Form>
    </div>
  );
};

export default AddRawMaterialToSale;
