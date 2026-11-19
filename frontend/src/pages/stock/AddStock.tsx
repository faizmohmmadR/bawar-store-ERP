import { formatPrice } from '@/lib/formatNumber';
import { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import useAdd from '@/api/useAdd';
import { ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';
import {
  DEFAULT_PIECES_PER_CARTON,
  formatCartonPiece,
  normalizeCartonAndLoose,
  pricePerPieceFromCarton,
} from '@/lib/packaging';
import { useSaveAndCreateNew } from '@/hooks/useSaveAndCreateNew';

const AddStock = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [cartonSize, setCartonSize] = useState(DEFAULT_PIECES_PER_CARTON);

  const schema = useMemo(
    () =>
      z
        .object({
          product: z.string().min(1, t('stock.validation.product')),
          carton_amount: z.string().optional(),
          piece_amount: z.string().optional(),
          buy_price: z.string().optional(),
          currency: z.string().min(1, t('stock.validation.currency')),
          expire_date: z.string().optional(),
          notes: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          const { total_pieces } = normalizeCartonAndLoose(
            parseFloat(data.carton_amount || '') || 0,
            parseFloat(data.piece_amount || '') || 0,
            cartonSize,
          );
          if (total_pieces <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('stock.qtyRequired', 'Enter carton and/or piece quantity'),
              path: ['carton_amount'],
            });
          }
        }),
    [t, cartonSize],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      product: '',
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

  const { handleAdd, loading, isSuccess } = useAdd({
    queryKey: ['stocks'],
    endpoint: 'stocks/',
  });

  const onReset = useCallback(() => {
    form.reset();
    setCartonSize(DEFAULT_PIECES_PER_CARTON);
  }, [form]);

  const { onIntent, showSaveAndCreateNew } = useSaveAndCreateNew({
    isSuccess,
    listPath: '/stock',
    onReset,
  });

  const onSubmit = (data: z.infer<typeof schema>) => {
    const qty = normalizeCartonAndLoose(
      parseFloat(data.carton_amount || '') || 0,
      parseFloat(data.piece_amount || '') || 0,
      cartonSize,
    );
    const cartonPrice = data.buy_price ? parseFloat(data.buy_price) : 0;

    handleAdd({
      product: data.product,
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

  return (
    <FormPage title={t('stock.addStock')} icon={<Package />} backTo="/stock">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
            mode="create"
            showSaveAndCreateNew={showSaveAndCreateNew}
            onIntent={onIntent}
            onCancel={() => navigate('/stock')}
            loading={loading}
            submitLabel={t('common.add')}
            loadingLabel={t('common.adding')}
          />
        </form>
      </Form>
    </FormPage>
  );
};

export default AddStock;
