import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Autocomplete } from '@/components/ui/autocomplete';
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
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages, requiredString } from '@/lib/formSchemas';
import type { RawMaterial } from '@/types/raw-material';

const AddRawMaterialStock = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        raw_material: requiredString(messages.required),
        quantity: z
          .string()
          .min(1, messages.required)
          .refine((v) => parseFloat(v) >= 0, t('common.mustBeNonNegative', 'Must be 0 or more')),
        piece_count: z.string().optional(),
        last_purchase_price: z.string().optional(),
        last_purchase_date: z.string().optional(),
        _unit: z.string().optional(),
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
      raw_material: '',
      quantity: '',
      piece_count: '',
      last_purchase_price: '',
      last_purchase_date: '',
      _unit: '',
    },
  });

  const unit = form.watch('_unit');

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['raw-material-stocks'],
    endpoint: 'raw-material-stocks',
    customSuccessMessage: t('rawMaterialStock.stockAdded', 'Stock entry added successfully'),
  });

  const onReset = useCallback(() => form.reset(), [form]);
  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/raw-material-stocks',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleAdd({
      raw_material: Number(data.raw_material),
      quantity: data.quantity,
      piece_count: data.piece_count ? Number(data.piece_count) : 0,
      last_purchase_price: data.last_purchase_price || '0',
      last_purchase_date: data.last_purchase_date || null,
    });
  };

  return (
    <FormPage
      title={t('rawMaterialStock.addStock', 'Add Stock Entry')}
      icon={<Package />}
      backTo="/raw-material-stocks"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageSection
            title={t('rawMaterialStock.stockDetails', 'Stock Details')}
          >
            <FormPageFields cols={1}>
              <FormField
                control={form.control}
                name="raw_material"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('rawMaterialStock.rawMaterial', 'Raw Material')} *</FormLabel>
                    <FormControl>
                      <Autocomplete
                        endpoint="raw-materials"
                        searchParam="search"
                        pageSize={30}
                        value={field.value}
                        onChange={(val, option) => {
                          field.onChange(val ? String(val) : '');
                          form.setValue('_unit', (option as RawMaterial)?.unit ?? '');
                          form.setValue('piece_count', '');
                        }}
                        placeholder={t('rawMaterials.selectRawMaterial', 'Select raw material...')}
                        getOptionLabel={(m: RawMaterial) => `${m.name} (${m.unit})`}
                        getOptionValue={(m: RawMaterial) => String(m.id)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormPageFields>

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
                      <Input
                        type="number"
                        min="0"
                        step="0.0001"
                        placeholder="0"
                        {...field}
                      />
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
            mode="create"
            showSaveAndCreateNew={showSaveAndCreateNew}
            onIntent={onIntent}
            onCancel={() => navigate('/raw-material-stocks')}
            loading={loading}
            submitLabel={t('common.add', 'Add')}
            loadingLabel={t('common.adding', 'Adding...')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddRawMaterialStock;
