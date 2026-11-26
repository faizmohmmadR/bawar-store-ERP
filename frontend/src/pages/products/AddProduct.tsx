import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields, FormPageSection } from '@/components/forms/FormPage';
import { FormSelect } from '@/components/forms/FormSelect';
import { Package } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { ProductImageField } from './ProductImageField';
import useFetchObjects from '@/api/useFetchObjects';
import { ProductPackagingEditor } from '@/components/products/ProductPackagingEditor';
import { ProductCategorySelect } from '@/components/products/ProductCategorySelect';
import {
  createProductFormSchema,
  defaultProductFormValues,
  productFormToPayload,
  type ProductFormValues,
} from '@/lib/productFormSchemas';
import { useSyncProductBasePackaging } from '@/hooks/useSyncProductBasePackaging';

const AddProduct = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data: uoms } = useFetchObjects({ queryKey: ['units-of-measure'], endpoint: 'units-of-measure' });
  const { data: categories } = useFetchObjects({
    queryKey: ['product-categories'],
    endpoint: 'product-categories',
  });

  const schema = useMemo(() => createProductFormSchema(t), [t]);
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultProductFormValues(),
  });

  const uomOptions = useMemo(
    () =>
      (uoms?.results || uoms || []).map((u: { id: number; name: string; symbol?: string }) => ({
        value: String(u.id),
        label: `${u.name}${u.symbol ? ` (${u.symbol})` : ''}`,
      })),
    [uoms],
  );

  useSyncProductBasePackaging(form, uomOptions);

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: 'products',
    endpoint: 'products',
    customSuccessMessage: t('products.productAdded', 'Product added successfully'),
  });

  const onReset = useCallback(() => {
    form.reset(defaultProductFormValues());
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/products',
    onReset,
  });

  const onSubmit = (data: ProductFormValues) => {
    handleAdd(productFormToPayload(data));
  };

  const categoryOptions = (categories?.results || categories || []).map(
    (c: { id: number; name: string }) => ({
      value: String(c.id),
      label: c.name,
    }),
  );

  return (
    <FormPage
      title={t('products.addProduct', 'Add product')}
      description={t(
        'products.createProduct',
        'Create a product with base UOM and purchase/sale packaging units',
      )}
      icon={<Package />}
      backTo="/products"
      maxWidth="6xl"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageSection title={t('products.basicInfo', 'Basic info')}>
            <FormPageFields>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.name', 'Name')} *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.sku', 'SKU')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.barcode', 'Product barcode')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('products.barcodePlaceholder', 'Enter barcode')} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'products.barcodeSyncHint',
                        'Copied automatically to the base unit barcode below.',
                      )}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="base_uom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.baseUom', 'Base unit of measure')} *</FormLabel>
                    <FormControl>
                      <FormSelect
                        value={field.value}
                        onChange={field.onChange}
                        options={uomOptions}
                        placeholder={t('products.selectUom', 'Select base unit')}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'products.baseUomSyncHint',
                        'Sets the base unit name in Packaging / units (e.g. Piece).',
                      )}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.category', 'Category')}</FormLabel>
                    <FormControl>
                      <ProductCategorySelect
                        value={field.value || ''}
                        onChange={field.onChange}
                        options={categoryOptions}
                        placeholder={t('products.selectCategory', 'Select category')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.brand', 'Brand')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reorder_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.reorderLevel', 'Reorder level (base)')}</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="any" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'products.reorderLevelHint',
                        'Notify when on-hand stock (base units) falls to this level or below. 0 = off.',
                      )}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="min_stock_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.minStock', 'Critical min stock (base)')}</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="any" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'products.minStockHint',
                        'Urgent alert when stock reaches this critical level. Usually ≤ reorder level. 0 = off.',
                      )}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>{t('products.description', 'Description')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <ProductImageField control={form.control} />
            </FormPageFields>

            <div className="mt-4 flex flex-wrap gap-6">
              {(
                [
                  ['track_inventory', t('products.trackInventory', 'Track inventory')],
                  ['track_batch', t('products.trackBatch', 'Track batch / lot')],
                  ['track_expiry', t('products.trackExpiry', 'Track expiry')],
                  ['is_active', t('products.active', 'Active')],
                ] as const
              ).map(([name, label]) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">{label}</FormLabel>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </FormPageSection>

          <FormPageSection title={t('products.packagingUnits', 'Packaging / units')}>
            <ProductPackagingEditor control={form.control} setValue={form.setValue} />
          </FormPageSection>

          <FormActions
            loading={loading}
            onCancel={() => navigate('/products')}
            showSaveAndCreateNew={showSaveAndCreateNew}
            onSaveAndCreateNew={() => onIntent('create-new')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddProduct;
