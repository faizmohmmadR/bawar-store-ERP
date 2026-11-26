import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertOctagon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Autocomplete } from '@/components/ui/autocomplete';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';
import type { Product, ProductPackaging } from '@/types/products';

const AddDamagedStock = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [packagings, setPackagings] = useState<ProductPackaging[]>([]);

  const schema = useMemo(
    () =>
      z.object({
        product: z.string().min(1, t('stock.validation.product', 'Product is required')),
        warehouse: z.string().optional(),
        packaging: z.string().optional(),
        quantity: z
          .string()
          .min(1, t('stock.qtyRequired', 'Quantity is required'))
          .refine((v) => parseFloat(v) > 0, t('stock.validation.quantityPositive', 'Quantity must be greater than zero')),
        reason: z.string().optional(),
        notes: z.string().optional(),
      }),
    [t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      product: '',
      warehouse: '',
      packaging: '',
      quantity: '',
      reason: '',
      notes: '',
    },
  });

  const selectedPackagingId = useWatch({ control: form.control, name: 'packaging' });
  const selectedPackaging = packagings.find((p) => String(p.id) === String(selectedPackagingId));

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: [
      'stock-adjustments-damaged',
      'stock-adjustments',
      'inventory-balances',
      'stocks',
    ],
    endpoint: 'stock-adjustments/record-damage/',
    customSuccessMessage: t(
      'stock.movedToDamagedSuccess',
      'Damaged product recorded and stock reduced successfully',
    ),
  });

  const onReset = useCallback(() => {
    form.reset();
    setPackagings([]);
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/stock/damaged',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    handleAdd({
      product: Number(data.product),
      ...(data.warehouse ? { warehouse: Number(data.warehouse) } : {}),
      ...(data.packaging ? { packaging: Number(data.packaging) } : {}),
      quantity: data.quantity,
      reason: data.reason?.trim() || '',
      notes: data.notes?.trim() || '',
    });
  };

  return (
    <FormPage
      title={t('stock.addDamagedStock', 'Add Damaged Product')}
      icon={<AlertOctagon />}
      backTo="/stock/damaged"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageFields>
            <FormField
              control={form.control}
              name="product"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stock.product', 'Product')} *</FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="products"
                      getOptionLabel={(p: Product) => p.name}
                      getOptionValue={(p: Product) => p.id.toString()}
                      value={field.value}
                      onChange={(value, product) => {
                        field.onChange(value?.toString() || '');
                        const next = (product?.packagings || []).filter(
                          (p) => p.is_active !== false,
                        );
                        setPackagings(next);
                        const base =
                          next.find((p) => p.is_base)
                          || next.find((p) => p.for_stock)
                          || next[0];
                        form.setValue('packaging', base ? String(base.id) : '');
                      }}
                      placeholder={t('stock.selectProduct', 'Select product')}
                      queryParams={{ track_inventory: 'true', is_active: 'true' }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="warehouse"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stock.warehouse', 'Warehouse')}</FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="warehouses"
                      getOptionLabel={(w) => w.name}
                      getOptionValue={(w) => w.id.toString()}
                      value={field.value || ''}
                      onChange={(value) => field.onChange(value?.toString() || '')}
                      placeholder={t('stock.selectWarehouse', 'Select warehouse (default if empty)')}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'stock.damagedWarehouseHint',
                      'Leave empty to use the default warehouse.',
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormPageFields>

          <FormPageFields>
            <FormField
              control={form.control}
              name="packaging"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stock.packaging', 'Packaging')}</FormLabel>
                  <Select
                    value={field.value || undefined}
                    onValueChange={field.onChange}
                    disabled={!packagings.length}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t('stock.selectPackaging', 'Select packaging')}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {packagings.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                          {p.is_base ? ` (${t('stock.baseUnit', 'base')})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('stock.quantity', 'Quantity')}
                    {selectedPackaging?.name ? ` (${selectedPackaging.name})` : ''}
                    {' *'}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step={ORDER_NUMERIC_STEP}
                      min="0"
                      inputMode="decimal"
                      placeholder="0"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'stock.fromGoodStock',
                      'Quantity is taken from sellable (good) stock.',
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormPageFields>

          <FormPageFields>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stock.moveReason', 'Reason for damage')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('stock.moveReason', 'Reason for damage (optional)')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t('common.notes', 'Notes')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder={t('common.notes', 'Notes')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormPageFields>

          <FormActions
            loading={loading}
            onCancel={() => navigate('/stock/damaged')}
            onIntent={onIntent}
            showSaveAndCreateNew={showSaveAndCreateNew}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddDamagedStock;
