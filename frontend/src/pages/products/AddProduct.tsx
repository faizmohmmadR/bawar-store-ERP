import { MassInput } from '@/components/forms/MassInput';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields, FormPageSection } from '@/components/forms/FormPage';
import { Package, Barcode } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import useAdd from '@/api/useAdd';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { ProductImageField } from './ProductImageField';

const emptyValues = {
  name: '',
  barcode: '',
  description: '',
  bottle_capacity_kg: '',
  image: undefined as File | undefined,
};

const AddProduct = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z.object({
        name: requiredString(messages.required),
        barcode: z.string().optional(),
        description: z.string().optional(),
        bottle_capacity_kg: z.string().optional(),
        image: z.instanceof(File).optional(),
      }),
    [messages.required],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: 'products',
    endpoint: 'products',
    customSuccessMessage: t('products.productAdded', 'Product added successfully'),
  });

  const onReset = useCallback(() => {
    form.reset(emptyValues);
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/products',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    const payload = new FormData();
    payload.append('name', data.name);
    payload.append('barcode', data.barcode || '');
    payload.append('description', data.description || '');
    payload.append('bottle_capacity_kg', data.bottle_capacity_kg || '');
    if (data.image) payload.append('image', data.image);
    handleAdd(payload);
  };

  return (
    <FormPage
      title={t('products.addProduct')}
      description={t('products.createProduct', 'Create a new product')}
      icon={<Package />}
      backTo="/products"
      maxWidth="6xl"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageSection title={t('products.productInformation', 'Product Information')}>
            <FormPageFields>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.productName')} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t('products.namePlaceholder')} {...field} />
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
                    <FormLabel>
                      <Barcode className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      {t('products.barcode')}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={t('products.barcodePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{t('products.description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('products.descriptionPlaceholder')}
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bottle_capacity_kg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.bottleCapacityKg', 'Bottle capacity (kg)')}</FormLabel>
                    <FormControl>
                      <MassInput value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />



              <ProductImageField control={form.control} />
            </FormPageFields>
          </FormPageSection>

          <FormActions
            mode="create"
            onCancel={() => navigate('/products')}
            loading={loading}
            submitLabel={t('common.create', 'Create')}
            loadingLabel={t('common.creating', 'Creating...')}
            showSaveAndCreateNew={showSaveAndCreateNew}
            onIntent={onIntent}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddProduct;
