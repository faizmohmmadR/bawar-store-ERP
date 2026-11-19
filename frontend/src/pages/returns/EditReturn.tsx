import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormActions } from '@/components/forms/FormActions';
import { useLanguage } from '@/contexts/LanguageContext';
import { ReloadIcon } from '@radix-ui/react-icons';
import { ArrowLeft, Undo2 } from 'lucide-react';
import useUpdate from '@/api/useUpdate';
import useFetchObjects from '@/api/useFetchObjects';
import {
  resolveCurrencySymbol,
} from '@/lib/currencyChoices';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';
import {
  DEFAULT_PIECES_PER_CARTON,
  buildReturnPayload,
  calculateReturnTotal,
  mapReturnItemToFormLine,
  normalizePiecesPerCarton,
  returnLineTotal,
  syncReturnQtyFromCarton,
} from '@/lib/returnFormUtils';
import { formatReturnAmount, ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';
import { formatCartonPiece } from '@/lib/packaging';
import { useRedirectOnSuccess } from '@/hooks/useRedirectOnSuccess';
import { formMessages, requiredString } from '@/lib/formSchemas';

const EditReturn = () => {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const messages = useMemo(() => formMessages(t), [t]);

  const schema = useMemo(
    () =>
      z
        .object({
          sales: requiredString(messages.required),
          return_date: requiredString(messages.required),
          reason: z.string().optional(),
          currency: requiredString(messages.required),
          notes: z.string().optional(),
          pieces_per_carton: z.coerce.number().min(1).default(DEFAULT_PIECES_PER_CARTON),
          return_items: z
            .array(
              z.object({
                id: z.string().optional(),
                sales_item: requiredString(messages.required),
                carton_amount: z.coerce.number().min(0),
                piece_amount: z.coerce.number().min(0),
                return_price: z.coerce.number().min(0),
                max_piece_amount: z.coerce.number().min(0),
              }),
            )
            .min(1, messages.required),
        })
        .superRefine((data, ctx) => {
          const hasQty = data.return_items.some((item) => item.carton_amount > 0);
          if (!hasQty) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('returns.itemsRequired', 'At least one return quantity is required'),
              path: ['return_items'],
            });
          }
          data.return_items.forEach((item, index) => {
            if (item.piece_amount > item.max_piece_amount) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: t('returns.qtyExceedsMax', 'Quantity exceeds maximum'),
                path: ['return_items', index, 'carton_amount'],
              });
            }
          });
        }),
    [messages.required, t],
  );

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      sales: '',
      return_date: new Date().toISOString().slice(0, 16),
      reason: '',
      currency: '',
      notes: '',
      pieces_per_carton: DEFAULT_PIECES_PER_CARTON,
      return_items: [],
    },
  });

  const { fields, replace } = useFieldArray({ control: form.control, name: 'return_items' });
  const salesId = form.watch('sales');
  const currency = form.watch('currency');
  const returnItems = form.watch('return_items') ?? [];
  const piecesPerCarton = normalizePiecesPerCarton(form.watch('pieces_per_carton'));

  const currencySymbol = resolveCurrencySymbol(currency);

  const { data: returnData, isLoading: returnLoading } = useFetchObjects({
    queryKey: ['return', id],
    endpoint: `returns/${id}`,
    enabled: !!id,
  });

  const { data: saleData } = useFetchObjects({
    queryKey: ['sale', salesId],
    endpoint: `sales/${salesId}`,
    enabled: !!salesId,
  });

  const { handleUpdate, loading, isSuccess } = useUpdate({
    queryKey: ['returns'],
  });

  useRedirectOnSuccess(isSuccess, '/returns');

  useEffect(() => {
    if (returnData && !Array.isArray(returnData)) {
      form.reset({
        sales: returnData.sales?.toString() || '',
        return_date:
          returnData.return_date?.slice(0, 16) || new Date().toISOString().slice(0, 16),
        reason: returnData.reason || '',
        currency: resolveCurrencyId(returnData),
        notes: returnData.notes || '',
        pieces_per_carton: DEFAULT_PIECES_PER_CARTON,
        return_items: [],
      });

      if (returnData.return_items && Array.isArray(returnData.return_items)) {
        replace(
          returnData.return_items.map((item: Parameters<typeof mapReturnItemToFormLine>[0]) =>
            mapReturnItemToFormLine(item, DEFAULT_PIECES_PER_CARTON),
          ),
        );
      }
    }
  }, [returnData, form, replace]);

  const applyCartonQty = (index: number, cartons: number, rate = piecesPerCarton) => {
    const max = returnItems[index]?.max_piece_amount ?? 0;
    const synced = syncReturnQtyFromCarton(cartons, max, rate);
    form.setValue(`return_items.${index}.carton_amount`, synced.carton_amount, {
      shouldValidate: true,
      shouldDirty: true,
    });
    form.setValue(`return_items.${index}.piece_amount`, synced.piece_amount, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const syncAllFromRate = (rate: number) => {
    returnItems.forEach((item, index) => {
      const cartons = Number(item?.carton_amount) || 0;
      if (cartons > 0) {
        const synced = syncReturnQtyFromCarton(cartons, item.max_piece_amount ?? 0, rate);
        form.setValue(`return_items.${index}.carton_amount`, synced.carton_amount, {
          shouldValidate: true,
          shouldDirty: true,
        });
        form.setValue(`return_items.${index}.piece_amount`, synced.piece_amount, {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    });
  };

  const calculateTotal = () => calculateReturnTotal(returnItems, piecesPerCarton);

  const onSubmit = (data: FormValues) => {
    if (!returnData) return;

    handleUpdate(
      returnData.id,
      buildReturnPayload(
        {
          ...data,
          currency: toCurrencyFkId(data.currency),
        },
        { includeItemIds: true },
      ),
    );
  };

  if (returnLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ReloadIcon className="animate-spin h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="min-h-screen flex flex-col">
          <div className="sticky top-0 z-50 border-b border-border/70 bg-card px-3 py-3 shadow-sm sm:px-6 sm:py-4">
            <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 sm:mb-4 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/returns')}
                className="h-9 w-fit shrink-0 gap-1.5 bg-background px-2.5 shadow-none"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>{t('common.back')}</span>
              </Button>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Undo2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base font-heading font-semibold tracking-tight sm:text-lg">
                    {t('returns.editReturn', 'Edit Return')}
                  </h1>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    {t('returns.returnNumber', 'Return')}: {returnData?.return_number}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                control={form.control}
                name="return_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('returns.returnDateRequired')}</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" className="h-8 text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pieces_per_carton"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">
                      {t('returns.piecesPerCarton', 'Pieces / Carton')} *
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        className="h-8 text-sm"
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const rate = Math.max(1, parseFloat(e.target.value) || 1);
                          field.onChange(rate);
                          syncAllFromRate(rate);
                        }}
                        placeholder="8"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('returns.reason')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('returns.returnReason')}
                        className="h-8 text-sm"
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
                  <FormItem>
                    <FormLabel className="text-xs">{t('returns.notes')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('returns.additionalNotes')}
                        className="h-8 text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col xl:flex-row gap-4 p-4">
            <div className="flex-1">
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold mb-2">{t('returns.returnItems')}</h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="text-center p-2 font-semibold w-10">#</th>
                          <th className="text-left p-2 font-semibold w-48">{t('returns.product')}</th>
                          <th className="text-center p-2 font-semibold w-28">{t('returns.maxQty')}</th>
                          <th className="text-center p-2 font-semibold w-24">{t('returns.carton')}</th>
                          <th className="text-right p-2 font-semibold w-28">
                            {t('returns.pricePerCarton')}
                          </th>
                          <th className="text-right p-2 font-semibold w-24">{t('common.total')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, index) => {
                          const item = returnItems[index];
                          const saleItem = saleData?.items?.find(
                            (si: { id: number }) => si.id.toString() === item?.sales_item,
                          );
                          const productName =
                            saleItem?.product_details?.name ||
                            returnData?.return_items?.[index]?.product_details?.name ||
                            'Product';

                          return (
                            <tr key={field.id} className="border-b hover:bg-muted/20">
                              <td className="p-2 text-center font-semibold text-primary">{index + 1}</td>
                              <td className="p-2">
                                <div>{productName}</div>
                                {saleItem?.stock_details?.color ? (
                                  <div className="text-muted-foreground text-[10px]">
                                    {saleItem.stock_details.color}
                                  </div>
                                ) : null}
                              </td>
                              <td className="p-2 text-center font-medium whitespace-nowrap">
                                {formatCartonPiece(item?.max_piece_amount ?? 0, piecesPerCarton)}
                              </td>
                              <td className="p-2">
                                <FormField
                                  control={form.control}
                                  name={`return_items.${index}.carton_amount`}
                                  render={({ field: cartonField }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min={0}
                                          step={ORDER_NUMERIC_STEP}
                                          className="h-9 text-sm text-center"
                                          value={cartonField.value || ''}
                                          onChange={(e) => {
                                            applyCartonQty(index, parseFloat(e.target.value) || 0);
                                          }}
                                          placeholder="0"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </td>
                              <td className="p-2">
                                <FormField
                                  control={form.control}
                                  name={`return_items.${index}.return_price`}
                                  render={({ field: priceField }) => (
                                    <FormItem>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min={0}
                                          step={ORDER_NUMERIC_STEP}
                                          className="h-9 text-sm text-right"
                                          value={priceField.value}
                                          onChange={(e) =>
                                            priceField.onChange(parseFloat(e.target.value) || 0)
                                          }
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </td>
                              <td className="p-2 text-right font-medium">
                                {currencySymbol}
                                {formatReturnAmount(
                                  returnLineTotal(
                                    {
                                      carton_amount: item?.carton_amount ?? 0,
                                      piece_amount: item?.piece_amount ?? 0,
                                      return_price: item?.return_price ?? 0,
                                      sales_item: item?.sales_item ?? '',
                                    },
                                    piecesPerCarton,
                                  ),
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="xl:w-80 w-full flex-shrink-0">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold text-lg mb-3">{t('returns.summary')}</h3>

                  <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{t('returns.customer')}:</span>
                      <span className="font-medium">
                        {returnData?.sales_details?.customer || 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t('returns.invoice')}:</span>
                      <span className="font-medium">{returnData?.sales_details?.invoice_number}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t('returns.originalTotal')}:</span>
                      <span className="font-medium">
                        {currencySymbol}
                        {parseFloat(returnData?.sales_details?.total_amount || '0').toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t-2">
                    <FormLabel className="text-sm mb-2 font-bold">{t('returns.refundAmount')}</FormLabel>
                    <Input
                      type="text"
                      value={`${currencySymbol}${formatReturnAmount(calculateTotal())}`}
                      disabled
                      className="h-12 text-xl font-bold bg-accent/10 text-accent"
                    />
                  </div>

                  <div className="pt-4 border-t">
                    <FormActions
                      onCancel={() => navigate('/returns')}
                      loading={loading}
                      submitLabel={t('returns.updateReturn', 'Update Return')}
                      loadingLabel={t('returns.updatingReturn', 'Updating Return...')}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
};

export default EditReturn;
