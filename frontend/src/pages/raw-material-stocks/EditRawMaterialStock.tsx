import { useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormPageFields, FormPageSection } from '@/components/forms/FormPage';
import { FormActions } from '@/components/forms/FormActions';
import { useLanguage } from '@/contexts/LanguageContext';
import useUpdate from '@/api/useUpdate';
import useFetchObjects from '@/api/useFetchObjects';
import { formMessages } from '@/lib/formSchemas';
import type { RawMaterialStock } from '@/types/raw-material';

const EditRawMaterialStock = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        quantity: z
          .string()
          .min(1, messages.required)
          .refine((v) => parseFloat(v) >= 0, t('common.mustBeNonNegative', 'Must be 0 or more')),
        piece_count: z.string().optional(),
        last_purchase_price: z.string().optional(),
        last_purchase_date: z.string().optional(),
      }).superRefine((data, ctx) => {
        if ((Number(data.quantity) > 0 || Number(data.piece_count) > 0)
          && !(Number(data.last_purchase_price) > 0 && Number.isFinite(Number(data.last_purchase_price)))) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['last_purchase_price'],
            message: t('rawMaterialStock.positiveCostRequired', 'Enter the actual positive AFN cost per material unit.'),
          });
        }
      }),
    [messages.required, t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      quantity: '',
      piece_count: '',
      last_purchase_price: '',
      last_purchase_date: '',
    },
  });

  const { data: stock, isLoading } = useFetchObjects<RawMaterialStock>({
    queryKey: ['raw-material-stocks', id ?? ''],
    endpoint: 'raw-material-stocks',
    id,
  });

  useEffect(() => {
    if (stock && !form.formState.isDirty) {
      form.reset({
        quantity: stock.quantity ?? '0',
        piece_count: String(stock.piece_count ?? 0),
        last_purchase_price: stock.last_purchase_price ?? '0',
        last_purchase_date: stock.last_purchase_date ?? '',
      });
    }
  }, [stock, form]);

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['raw-material-stocks'],
    endpoint: 'raw-material-stocks',
    customSuccessMessage: t('rawMaterialStock.stockUpdated', 'Stock entry updated successfully'),
  });

  if (isSuccess) {
    navigate('/raw-material-stocks');
  }

  const unit = stock?.raw_material_details?.unit;
  const materialName = stock?.raw_material_details?.name;

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleUpdate(id!, {
      quantity: data.quantity,
      piece_count: data.piece_count ? Number(data.piece_count) : 0,
      last_purchase_price: data.last_purchase_price || '0',
      last_purchase_date: data.last_purchase_date || null,
    });
  };

  return (
    <FormPage
      title={t('rawMaterialStock.editStock', 'Edit Stock Entry')}
      description={materialName}
      icon={<Package />}
      backTo="/raw-material-stocks"
    >
      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.loading', 'Loading...')}
        </div>
      ) : stock?.cost_layers?.length ? (
        <div className="space-y-4">
          <p className="rounded-lg border bg-muted/30 p-4 text-sm">{t('rawMaterialStock.purchaseEditHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {stock.cost_layers.map(layer => <div key={layer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <div><p className="font-medium">{layer.invoice_number}</p><bdi dir="ltr" className="text-sm text-muted-foreground">{layer.quantity} {unit} · AFN {layer.price_per_unit_base} / {unit}</bdi></div>
              <Button type="button" variant="outline" onClick={() => navigate(`/raw-material-purchases/${layer.purchase_id}/edit`)}>{t('common.edit')}</Button>
            </div>)}
          </div>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormPageSection title={t('rawMaterialStock.stockDetails', 'Stock Details')}>
              <FormPageFields cols={2}>
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('rawMaterialStock.quantity', 'Quantity')}
                        {unit ? ` (${unit})` : ''} *
                      </FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.0001" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {unit === 'kg' && (
                  <FormField
                    control={form.control}
                    name="piece_count"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('rawMaterialPurchases.pieceCount', 'Piece Count')}</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="1" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="last_purchase_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('rawMaterialStock.lastPurchasePrice', 'Last Purchase Price (AFN)')}</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step="0.000001" placeholder="0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="last_purchase_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('rawMaterialStock.lastPurchaseDate', 'Last Purchase Date')}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>
            </FormPageSection>

            <FormActions
              mode="edit"
              onCancel={() => navigate('/raw-material-stocks')}
              loading={loading}
              submitLabel={t('common.save', 'Save')}
              loadingLabel={t('common.saving', 'Saving...')}
            />
          </form>
        </Form>
      )}
    </FormPage>
  );
};

export default EditRawMaterialStock;
