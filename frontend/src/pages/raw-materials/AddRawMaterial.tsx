import { MassInput } from '@/components/forms/MassInput';
import { MaterialCategorySelect } from '@/components/raw-materials/MaterialCategorySelect';
import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { formatApiError, notifyError, notifySuccess } from '@/lib/notify';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import { FormActions } from '@/components/forms/FormActions';
import { FormField, FormItem, FormLabel, FormMessage, FormControl, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import api from '@/api/client';
import { requiredString } from '@/lib/formSchemas';

const CAPACITY_TYPES = ['bottle', 'bottle_with_cap', 'carton'] as const;

const AddRawMaterial = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const schema = useMemo(() => z.object({
    name: requiredString(t('rawMaterials.name')),
    material_type: z.enum(['bottle', 'bottle_with_cap', 'cap', 'cap_label', 'label', 'label_double', 'plastic', 'carton', 'carton_plastic', 'chemistry', 'boiler', 'other']),
    category: z.string().optional(),
    description: z.string().optional(),
    unit: z.enum(['kg', 'g', 'piece']).default('kg'),
    weight_per_piece_kg: z.coerce.number().positive().optional().or(z.literal('')).or(z.null()).transform(value => value === '' || value == null ? null : Number(value)),
    capacity_kg: z.coerce.number().positive().optional().or(z.literal('')).or(z.null()).transform((value) => (
      value === '' || value === null ? null : Number(value)
    )),
    bottles_per_carton: z.coerce.number().int().positive().optional().or(z.literal('')).or(z.null()).transform((value) => (
      value === '' || value === null ? null : Number(value)
    )),
    bottles_per_plastic: z.coerce.number().int().positive().optional().or(z.literal('')).or(z.null()).transform((value) => (
      value === '' || value === null ? null : Number(value)
    )),
  }).superRefine((data, ctx) => {
    if (['bottle', 'bottle_with_cap', 'plastic'].includes(data.material_type) && !data.category) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['category'], message: t('rawMaterials.selectCategory', 'Select category') });
    }
    const isSized = CAPACITY_TYPES.includes(data.material_type as typeof CAPACITY_TYPES[number]);
    if (isSized && !data.capacity_kg) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['capacity_kg'], message: t('rawMaterials.capacityKgRequired', 'Enter capacity in kilograms.') });
    }
    if (data.material_type === 'carton' && !data.bottles_per_carton) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bottles_per_carton'],
        message: t('rawMaterials.bottlesPerCartonRequired'),
      });
    }
  }), [t]);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      category: '',
      name: '',
      material_type: 'chemistry',
      description: '',
      unit: 'kg',
      weight_per_piece_kg: null,
      capacity_kg: null,
      bottles_per_carton: null,
      bottles_per_plastic: null,
    },
  });

  const materialType = form.watch('material_type');
  const showsCapacity = CAPACITY_TYPES.includes(materialType as typeof CAPACITY_TYPES[number]);

  const onSubmit = async (data: z.infer<typeof schema>) => {
    setLoading(true);
    try {
      await api.post('/raw-materials/', {
        category: ['bottle', 'bottle_with_cap', 'plastic'].includes(data.material_type) ? Number(data.category) : null,
        name: data.name,
        material_type: data.material_type,
        description: data.description || null,
        unit: data.unit,
        weight_per_piece_kg: data.weight_per_piece_kg,
        capacity_liters: null,
        capacity_kg: showsCapacity ? data.capacity_kg : null,
        bottles_per_carton: data.material_type === 'carton' ? data.bottles_per_carton : null,
        bottles_per_plastic: data.material_type === 'plastic' ? data.bottles_per_plastic : null,
      });
      queryClient.invalidateQueries({ queryKey: ['raw-materials'] });
      queryClient.invalidateQueries({ queryKey: ['raw-material-stocks'] });
      notifySuccess(t('rawMaterials.rawMaterialAdded', 'Raw material added successfully'), {
        title: t('common.success'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
      navigate('/raw-materials');
    } catch (error: unknown) {
      const payload = isAxiosError(error) ? error.response?.data : undefined;
      const message =
        payload && typeof payload === 'object'
          ? Object.values(payload).flat().join('. ')
          : t('rawMaterials.rawMaterialAddFailed');
      notifyError(formatApiError(error, String(message)), {
        title: t('common.validationError', 'Validation Error'),
        dismissLabel: t('common.dismiss') || 'Dismiss',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormPage title={t('rawMaterials.addRawMaterial')} backTo="/raw-materials">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormPageFields>
            <FormField
              control={form.control}
              name="material_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('rawMaterials.materialType')} *</FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('category', '');
                        if (!CAPACITY_TYPES.includes(value as typeof CAPACITY_TYPES[number])) {
                          form.setValue('capacity_kg', null);
                          form.setValue('bottles_per_carton', null);
                          form.setValue('bottles_per_plastic', null);
                        }
                        if (value !== 'carton') {
                          form.setValue('bottles_per_carton', null);
                        }
                        if (value !== 'plastic') {
                          form.setValue('bottles_per_plastic', null);
                        }
                        if (value === 'plastic' || value === 'carton_plastic' || value === 'chemistry' || value === 'boiler' || value === 'other') {
                          form.setValue('unit', 'kg');
                        } else if (['bottle', 'bottle_with_cap', 'cap', 'cap_label', 'label', 'label_double', 'plastic', 'carton'].includes(value)) {
                          form.setValue('unit', 'piece');
                        }
                      }}
                      value={field.value}
                    >
                      <SelectTrigger><SelectValue placeholder={t('rawMaterials.materialTypePlaceholder')} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottle">{t('rawMaterials.typeBottle')}</SelectItem>
                        <SelectItem value="bottle_with_cap">{t('rawMaterials.typeBottleWithCap')}</SelectItem>
                        <SelectItem value="cap">{t('rawMaterials.typeCap')}</SelectItem>
                        <SelectItem value="cap_label">{t('rawMaterials.typeCapLabel')}</SelectItem>
                        <SelectItem value="label">{t('rawMaterials.typeLabel')}</SelectItem>
                        <SelectItem value="label_double">{t('rawMaterials.typeLabelDouble')}</SelectItem>
                        <SelectItem value="plastic">{t('rawMaterials.typePlastic')}</SelectItem>
                        <SelectItem value="carton">{t('rawMaterials.typeCarton')}</SelectItem>
                        <SelectItem value="carton_plastic">{t('rawMaterials.typeCartonPlastic')}</SelectItem>
                        <SelectItem value="chemistry">{t('rawMaterials.typeChemistry')}</SelectItem>
                        <SelectItem value="boiler">{t('rawMaterials.typeBoiler')}</SelectItem>
                        <SelectItem value="other">{t('rawMaterials.typeOther')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {['bottle', 'bottle_with_cap', 'plastic'].includes(materialType) && <FormField
              control={form.control} name="category" render={({ field }) => <FormItem>
                <FormLabel>{t('rawMaterials.category', 'Category')} *</FormLabel>
                <MaterialCategorySelect value={field.value || ''} onChange={field.onChange} allowCreate />
                <FormMessage />
              </FormItem>} />}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('rawMaterials.name')} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t('rawMaterials.name')} {...field} />
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
                  <FormLabel>{t('rawMaterials.description')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('rawMaterials.description')}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField control={form.control} name="weight_per_piece_kg" render={({ field }) => <FormItem>
              <FormLabel>{t('rawMaterialSales.pieceWeight', 'Actual weight per piece (kg)')} ({t('common.optional', 'Optional')})</FormLabel>
              <FormControl><Input type="number" min="0" step="0.000001" value={field.value ?? ''} onChange={event => field.onChange(event.target.value === '' ? null : Number(event.target.value))} /></FormControl>
              <p className="text-xs text-muted-foreground">{t('rawMaterialSales.pieceWeightHelp', 'Used to convert kg and pieces automatically. Enter the raw item weight, not bottle fill capacity.')}</p>
              <FormMessage />
            </FormItem>} />

            {showsCapacity && (
              <FormField
                control={form.control}
                name="capacity_kg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {['bottle', 'bottle_with_cap'].includes(materialType)
                        ? t('rawMaterials.bottleCapacityKg', 'Bottle capacity (kg)')
                        : t('rawMaterials.matchingBottleCapacityKg', 'Matching bottle capacity (kg)')} *
                    </FormLabel>
                    <FormControl>
                      <MassInput value={field.value} onChange={(value) => field.onChange(value === '' ? null : Number(value))} />
                    </FormControl>
                    <FormDescription>
                      {['bottle', 'bottle_with_cap'].includes(materialType)
                        ? t('rawMaterials.bottleCapacityKgHint', 'Enter the liquid mass held by one bottle.')
                        : t('rawMaterials.packageCapacityKgHint', 'Enter size in kg or grams. Packaging sizes can differ.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {materialType === 'carton' && (
              <FormField
                control={form.control}
                name="bottles_per_carton"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('rawMaterials.bottlesPerCarton')} *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="8"
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
                      />
                    </FormControl>
                    <FormDescription>{t('rawMaterials.bottlesPerCartonHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {materialType === 'plastic' && (
              <FormField
                control={form.control}
                name="bottles_per_plastic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('rawMaterials.bottlesPerPlastic')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="3"
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value === '' ? null : Number(event.target.value))}
                      />
                    </FormControl>
                    <FormDescription>{t('rawMaterials.bottlesPerPlasticHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}


            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('rawMaterials.unit')}</FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={materialType === 'carton_plastic' || materialType === 'boiler'}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="kg">{t('rawMaterials.kilogram')}</SelectItem>
                        <SelectItem value="g">{t('rawMaterials.gram', 'Gram (gr)')}</SelectItem>
                        <SelectItem value="piece">{t('rawMaterials.piece')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  {materialType === 'carton_plastic' && (
                    <FormDescription>
                      {t('rawMaterials.cartonPlasticUnitHint', 'Carton plastic is stocked in kg. Piece/package count is entered on purchases and optional in production.')}
                    </FormDescription>
                  )}
                  {materialType === 'boiler' && (
                    <FormDescription>
                      {t('rawMaterials.boilerUnitHint')}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormPageFields>

          <FormActions
            mode="create"
            onCancel={() => navigate('/raw-materials')}
            loading={loading}
            submitLabel={t('common.add')}
            loadingLabel={t('common.adding')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddRawMaterial;
