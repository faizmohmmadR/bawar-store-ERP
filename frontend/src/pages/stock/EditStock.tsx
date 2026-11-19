import { formatPrice } from '@/lib/formatNumber';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { Textarea } from '@/components/ui/textarea';
import { Autocomplete } from '@/components/ui/autocomplete';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { FormActions } from '@/components/forms/FormActions';
import { FormPage, FormPageFields } from '@/components/forms/FormPage';
import { toCurrencyFkId } from '@/lib/currencies';
import { useLanguage } from '@/contexts/LanguageContext';
import useUpdate from '@/api/useUpdate';
import useFetchObjects from '@/api/useFetchObjects';
import { Stock } from '@/types/stock';
import { ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';
import {
  DEFAULT_PIECES_PER_CARTON,
  cartonsFromPieces,
  formatCartonPiece,
  normalizeCartonAndLoose,
  pricePerCartonFromPiece,
  pricePerPieceFromCarton,
  remainderPieces,
} from '@/lib/packaging';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';

const EditStock = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();
  const [cartonSize, setCartonSize] = useState(DEFAULT_PIECES_PER_CARTON);

  const { data: stock } = useFetchObjects<Stock>({
    queryKey: ['stock', id],
    endpoint: `stocks/${id}/`,
    enabled: !!id,
  });
  const material = stock?.product_details?.raw_material_details;
  const isMaterialStock = Boolean(stock?.product_details?.raw_material || stock?.product_details?.material_type);
  const materialType = stock?.product_details?.material_type || material?.material_type;

  const schema = useMemo(
    () =>
      z
        .object({
          product: z.string().min(1, t('stock.validation.product')),
          material_quantity: z.string().optional(),
          material_unit_cost_afn: z.string().optional(),
          carton_amount: z.string().optional(),
          piece_amount: z.string().optional(),
          buy_price: z.string().optional(),
          currency: z.string().min(1, t('stock.validation.currency')),
          expire_date: z.string().optional(),
          notes: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          if (isMaterialStock) {
            const quantity = parseFloat(data.material_quantity || '') || 0;
            if (quantity < 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: t('stock.validation.quantity'),
                path: ['material_quantity'],
              });
            }
            if (
              ['bottle', 'bottle_with_cap'].includes(materialType || '')
              && !Number.isInteger(quantity)
            ) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: t('stock.wholeBottlesOnly', 'Bottle quantity must be a whole number'),
                path: ['material_quantity'],
              });
            }
            return;
          }

          const { total_pieces } = normalizeCartonAndLoose(
            parseFloat(data.carton_amount || '') || 0,
            parseFloat(data.piece_amount || '') || 0,
            cartonSize,
          );
          if (total_pieces < 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('stock.validation.quantity'),
              path: ['carton_amount'],
            });
          }
        }),
    [t, cartonSize, isMaterialStock, materialType],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      product: '',
      material_quantity: '',
      material_unit_cost_afn: '',
      carton_amount: '',
      piece_amount: '',
      buy_price: '',
      currency: '',
      expire_date: '',
      notes: '',
    },
  });

  const cartonAmount = useWatch({ control: form.control, name: 'carton_amount' });
  const pieceAmount = useWatch({ control: form.control, name: 'piece_amount' });
  const buyPrice = useWatch({ control: form.control, name: 'buy_price' });
  const normalized = normalizeCartonAndLoose(
    parseFloat(cartonAmount || '') || 0,
    parseFloat(pieceAmount || '') || 0,
    cartonSize,
  );

  const applyQty = (cartons: number, loose: number) => {
    const next = normalizeCartonAndLoose(cartons, loose, cartonSize);
    form.setValue('carton_amount', next.carton_amount ? String(next.carton_amount) : '', {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.setValue('piece_amount', next.piece_amount ? String(next.piece_amount) : '', {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['stocks'],
  });

  useEffect(() => {
    if (!stock) return;
    const rate = Number(stock.product_details?.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON;
    setCartonSize(rate);
    const pieces = Number(stock.on_hand_quantity ?? stock.piece_amount ?? 0);
    const piecePrice = Number(stock.buy_price) || 0;

    form.reset({
      product: stock.product?.toString() || '',
      material_quantity: String(pieces),
      material_unit_cost_afn: String(piecePrice),
      carton_amount: pieces > 0 ? String(cartonsFromPieces(pieces, rate)) : '',
      piece_amount: pieces > 0 ? String(remainderPieces(pieces, rate) || '') : '',
      buy_price: piecePrice ? String(pricePerCartonFromPiece(piecePrice, rate)) : '',
      currency: stock.currency?.toString() || '',
      expire_date: stock.expire_date || '',
      notes: stock.notes || '',
    });
  }, [stock, form]);

  useRedirectOnSuccess(isSuccess, '/stock');

  const onSubmit = (data: z.infer<typeof schema>) => {
    if (!id) return;

    if (isMaterialStock) {
      handleUpdate(id, {
        product: stock?.product?.toString() || data.product,
        piece_amount: parseFloat(data.material_quantity || '') || 0,
        buy_price: parseFloat(data.material_unit_cost_afn || '') || 0,
        currency: 1,
        expire_date: data.expire_date || null,
        notes: data.notes?.trim() || '',
      });
      return;
    }

    const qty = normalizeCartonAndLoose(
      parseFloat(data.carton_amount || '') || 0,
      parseFloat(data.piece_amount || '') || 0,
      cartonSize,
    );
    const cartonPrice = data.buy_price ? parseFloat(data.buy_price) : 0;

    handleUpdate(id, {
      product: stock?.product?.toString() || data.product,
      carton_amount: qty.carton_amount,
      loose_pieces: qty.piece_amount,
      piece_amount: qty.total_pieces,
      buy_price: pricePerPieceFromCarton(cartonPrice, cartonSize),
      currency: toCurrencyFkId(data.currency),
      expire_date: data.expire_date || null,
      notes: data.notes?.trim() || '',
    });
  };

  const piecePricePreview =
    parseFloat(buyPrice || '') > 0
      ? pricePerPieceFromCarton(parseFloat(buyPrice || ''), cartonSize)
      : 0;
  const materialCapacity = material?.capacity_liters != null
    ? `${(Number(material.capacity_liters) * (material.capacity_display_unit === 'ml' ? 1000 : 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${material.capacity_display_unit || 'L'}`
    : material?.capacity_kg != null
      ? `${Number(material.capacity_kg).toLocaleString(undefined, { maximumFractionDigits: 4 })} kg`
      : '';
  const materialPackageSize = materialType === 'carton' && material?.bottles_per_carton
    ? `${material.bottles_per_carton} ${t('stock.bottleUnits', 'bottles')} / ${t('stock.cartonUnits', 'cartons')}`
    : materialType === 'plastic' && material?.bottles_per_plastic
      ? `${material.bottles_per_plastic} ${t('stock.bottleUnits', 'bottles')} / ${t('stock.plasticPackUnits', 'plastic packs')}`
      : '';
  const materialQuantityLabel = materialType === 'carton'
    ? t('stock.cartonsInStock', 'Cartons in stock')
    : materialType === 'plastic'
      ? t('stock.plasticPacksInStock', 'Plastic packs in stock')
      : t('stock.bottlesInStock', 'Bottles in stock');
  const materialPriceLabel = materialType === 'carton'
    ? t('stock.pricePerCarton', 'Price per carton')
    : materialType === 'plastic'
      ? t('stock.pricePerPlasticPack', 'Price per plastic pack')
      : t('stock.pricePerBottle', 'Price per bottle');

  return (
    <FormPage title={t('stock.editStock')} icon={<Package />} backTo="/stock">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {isMaterialStock ? (
            <>
              <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                {t('stock.namedStockHint')}
              </p>
              <FormPageFields>
                <div className="space-y-2">
                  <FormLabel>{t('stock.product')}</FormLabel>
                  <Input
                    value={stock?.product_details?.name || material?.name || ''}
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <FormLabel>{t('stock.bottleCapacity', 'Bottle capacity')}</FormLabel>
                  <Input value={materialCapacity} readOnly placeholder="—" />
                  {materialPackageSize && (
                    <p className="text-xs text-muted-foreground">{materialPackageSize}</p>
                  )}
                </div>
              </FormPageFields>
              <FormPageFields>
                <FormField
                  control={form.control}
                  name="material_quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{materialQuantityLabel} *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step={materialType === 'bottle' || materialType === 'bottle_with_cap' ? '1' : ORDER_NUMERIC_STEP}
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                          {t(
                            'stock.stockCountEditHint',
                            'Enter the current quantity, including zero. Decreases are saved as manual stock corrections.',
                          )}
                        </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="material_unit_cost_afn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{materialPriceLabel} (AFN)</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" step={ORDER_NUMERIC_STEP} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>
              <FormPageFields>
                <FormField
                  control={form.control}
                  name="expire_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('stock.expireDate')}</FormLabel>
                      <DatePickerInput value={field.value || ''} onChange={field.onChange} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('stock.notes')}</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>
              <FormActions
                onCancel={() => navigate('/stock')}
                loading={loading}
                submitLabel={t('common.update')}
                loadingLabel={t('common.updating')}
              />
            </>
          ) : (
            <>
              <FormPageFields>
                <FormField
                  control={form.control}
                  name="product"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('stock.product')} *</FormLabel>
                      <FormControl>
                        <Autocomplete
                          endpoint="products"
                          getOptionLabel={(p) => p.name}
                          getOptionValue={(p) => p.id.toString()}
                          value={field.value}
                          onChange={(value, product) => {
                            field.onChange(value?.toString() || '');
                            setCartonSize(Number(product?.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON);
                          }}
                          placeholder={t('stock.selectProduct')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormPageFields>

          <FormPageFields>
            <FormField
              control={form.control}
              name="expire_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stock.expireDate')}</FormLabel>
                  <DatePickerInput value={field.value || ''} onChange={field.onChange} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="carton_amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stock.cartonAmount', 'Carton')} *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step={ORDER_NUMERIC_STEP}
                      min="0"
                      placeholder="0"
                      value={field.value || ''}
                      onChange={(e) => {
                        const cartons = parseFloat(e.target.value) || 0;
                        applyQty(cartons, parseFloat(form.getValues('piece_amount') || '') || 0);
                      }}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('stock.danaPerCartonHint', '1 کارتن = 8 دانه')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                      {t(
                        'stock.stockCountEditHint',
                        'Enter the current quantity, including zero. Decreases are saved as manual stock corrections.',
                      )}
                    </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            </FormPageFields>

          <FormPageFields>
            <FormField
              control={form.control}
              name="piece_amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stock.pieceAmount', 'Pieces (loose)')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step={ORDER_NUMERIC_STEP}
                      min="0"
                      placeholder="0"
                      value={field.value || ''}
                      onChange={(e) => {
                        const loose = parseFloat(e.target.value) || 0;
                        applyQty(parseFloat(form.getValues('carton_amount') || '') || 0, loose);
                      }}
                    />
                  </FormControl>
                  {normalized.total_pieces > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('stock.savedAsPieces', 'Total')}:{' '}
                      {formatCartonPiece(normalized.total_pieces)} (
                      {normalized.total_pieces} {t('stock.piece', 'pieces')})
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="buy_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stock.pricePerCarton', 'Price / Carton')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step={ORDER_NUMERIC_STEP}
                      min="0"
                      placeholder={t('stock.enterBuyPrice')}
                      {...field}
                    />
                  </FormControl>
                  {piecePricePreview > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('stock.priceStoredPerPiece', 'Per piece')}:{' '}
                      {formatPrice(piecePricePreview)}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormPageFields>

          <FormPageFields>
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('stock.currency')} *</FormLabel>
                  <FormControl>
                    <CurrencySelect
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t('stock.selectCurrency')}
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
                <FormItem>
                  <FormLabel>{t('stock.notes')}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormPageFields>

          <FormActions
            onCancel={() => navigate('/stock')}
            loading={loading}
            submitLabel={t('common.update')}
            loadingLabel={t('common.updating')}
          />
            </>
          )}
        </form>
      </Form>
    </FormPage>
  );
};

export default EditStock;
