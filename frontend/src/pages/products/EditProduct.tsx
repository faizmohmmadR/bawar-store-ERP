import { MassInput } from '@/components/forms/MassInput';
import type { Product } from '@/types/products';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormPage, FormPageFields, FormPageSection } from '@/components/forms/FormPage';
import { Package, Barcode } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import useFetchObjects from '@/api/useFetchObjects';
import useUpdate from '@/api/useUpdate';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { ProductImageField } from './ProductImageField';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  barcode: z.string().optional(),
  description: z.string().optional(),
  bottle_capacity_kg: z.string().optional(),
  image: z.instanceof(File).optional(),
});

const EditProduct = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();

  const { data: productData, isLoading } = useFetchObjects<Product>({
    queryKey: ['products', id || ''],
    endpoint: `products/${id}/`,
    enabled: !!id,
  });

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      barcode: '',
      description: '',
      bottle_capacity_kg: '',
      image: undefined,
    }
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['products'],
    endpoint: 'products',
    customSuccessMessage: t('products.productUpdated', 'Product updated successfully'),
    showSuccessToast: true,
  });

  useEffect(() => {
    if (productData) {
      form.reset({
        name: productData.name || '',
        barcode: productData.barcode || '',
        description: productData.description || '',
        bottle_capacity_kg: productData.bottle_capacity_kg || '',
      });
    }
  }, [productData, form]);

  useRedirectOnSuccess(isSuccess, '/products');

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!id) return;
    const payload = new FormData();
    payload.append('name', data.name);
    payload.append('barcode', data.barcode || '');
    payload.append('description', data.description || '');
    payload.append('bottle_capacity_kg', data.bottle_capacity_kg || '');
    if (data.image) payload.append('image', data.image);
    handleUpdate(id, payload);
  };

  if (isLoading) {
    return (
      <FormPage
        title={t('products.editProduct')}
        icon={<Package />}
        backTo="/products"
        maxWidth="6xl"
      >
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </FormPage>
    );
  }

  return (
    <FormPage
      title={t('products.editProduct')}
      icon={<Package />}
      backTo="/products"
      maxWidth="6xl"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageSection title={t('products.productInformation', 'Product Information')}>
            <div className="space-y-4">
              <FormPageFields>
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('products.productName')} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t('products.namePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="barcode" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Barcode className="h-3 w-3" />
                      {t('products.barcode')}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={t('products.barcodePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </FormPageFields>

              <ProductImageField control={form.control} currentUrl={productData?.image} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
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
              )} />
              <FormField control={form.control} name="bottle_capacity_kg" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('products.bottleCapacityKg', 'Bottle capacity (kg)')}</FormLabel>
                  <FormControl><MassInput value={field.value} onChange={field.onChange} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

            </div>
          </FormPageSection>

          <div className="flex justify-end gap-3 border-t pt-4 mt-6">
            <Button type="button" variant="outline" onClick={() => navigate('/products')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('common.updating') : t('common.update')}
            </Button>
          </div>
        </form>
      </Form>
    </FormPage>
  );
};

export default EditProduct;
