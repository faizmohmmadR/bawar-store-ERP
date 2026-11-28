import { useCallback, useEffect, useMemo, useState } from 'react';
import { Control, UseFormSetValue, useFieldArray, useFormState, useWatch } from 'react-hook-form';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { AfnReportingPreview } from '@/components/forms/AfnReportingPreview';
import { FormActions } from '@/components/forms/FormActions';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { ProductScanBar } from '@/components/products/ProductScanBar';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import {
  barcodeUnitPrice,
  planBarcodeLineApply,
} from '@/lib/applyBarcodeToLines';
import { resolveBarcode, type ResolvedBarcode } from '@/lib/resolveBarcode';
import {
  calculateSaleSubtotal,
  calculateSaleTotal,
  defaultSalePackagingItem,
  type SalePackagingFormValues,
} from '@/lib/salePackagingFormSchemas';
import { formatOrderNumeric, ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';
import { notifyError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import useFetchObjects from '@/api/useFetchObjects';

type RetailPrice = { amount?: number | string; currency?: number } | null | undefined;

type PackagingOption = {
  id: number;
  name: string;
  qty_in_base?: number | string;
  for_sale?: boolean;
  is_default_sale?: boolean;
  is_base?: boolean;
  is_active?: boolean;
  retail_price?: RetailPrice;
  retail_prices?: RetailPrice[];
};

type ProductOption = {
  id: number;
  name?: string;
  sku?: string | null;
  stock_on_hand?: number | string | null;
  base_uom_details?: { symbol?: string | null; name?: string | null } | null;
  packagings?: PackagingOption[];
  default_sales_packaging?: number | null;
};

type Props = {
  control: Control<SalePackagingFormValues>;
  setValue: UseFormSetValue<SalePackagingFormValues>;
  title: string;
  loading: boolean;
  onCancel: () => void;
  submitLabel: string;
  loadingLabel: string;
};

const AFN = 1;

const salePackagings = (option?: { packagings?: PackagingOption[] } | null) =>
  (option?.packagings || []).filter((p) => p.for_sale !== false && p.is_active !== false);

/** Prefer product default sale unit, then flagged default, then base unit. */
const pickDefaultPackaging = (
  packs: PackagingOption[],
  product?: { default_sales_packaging?: number | null } | null,
) => {
  if (!packs.length) return undefined;
  const defaultId = product?.default_sales_packaging;
  if (defaultId != null) {
    const byFk = packs.find((p) => Number(p.id) === Number(defaultId));
    if (byFk) return byFk;
  }
  return (
    packs.find((p) => p.is_default_sale)
    || packs.find((p) => p.is_base)
    || packs[0]
  );
};

/** Stock sale list price is always AFN — never a USD / native purchase copy. */
function pickAfnRetailAmount(pack: PackagingOption | null | undefined): number {
  const listed = (pack?.retail_prices || []).filter(Boolean) as Array<{ amount?: number | string; currency?: number }>;
  const afn = listed.find((row) => Number(row.currency) === AFN);
  if (afn && Number(afn.amount) > 0) return Number(afn.amount);
  const single = pack?.retail_price;
  if (single && Number(single.amount) > 0 && Number(single.currency || AFN) === AFN) {
    return Number(single.amount);
  }
  return 0;
}

export function SaleFormContent({
  control,
  setValue,
  title,
  loading,
  onCancel,
  submitLabel,
  loadingLabel,
}: Props) {
  const { t, direction } = useLanguage();
  const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;
  const [summaryOpen, setSummaryOpen] = useState(true);
  const { fields, insert, move, remove } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' }) ?? [];
  const currency = useWatch({ control, name: 'currency' }) ?? '';
  const saleDate = useWatch({ control, name: 'sale_date' }) ?? '';
  const discount = useWatch({ control, name: 'discount' }) ?? 0;
  const warehouse = useWatch({ control, name: 'warehouse' }) ?? '';
  const { errors } = useFormState({ control });

  const currencySymbol = resolveCurrencySymbol(currency || AFN);

  const subtotal = useMemo(() => calculateSaleSubtotal(items), [items]);
  const total = useMemo(
    () => calculateSaleTotal(items, Number(discount) || 0),
    [items, discount],
  );

  const applyResolvedBarcode = useCallback((resolved: ResolvedBarcode) => {
    if (resolved.packaging.for_sale === false) {
      notifyError(
        t('products.barcodeNotForSale', 'This barcode packaging is not enabled for sale'),
      );
      return false;
    }
    const plan = planBarcodeLineApply(items, resolved, 1);
    // Barcode resolve returns AFN retail from stock — use as-is.
    const price = barcodeUnitPrice(resolved, 'sale');
    const qtyInBase = Number(resolved.packaging.qty_in_base) || 1;
    const productId = String(resolved.product.id);
    const packagingId = String(resolved.packaging.id);

    if (plan.action === 'increment') {
      setValue(`items.${plan.index}.quantity`, plan.quantity);
      if (!(Number(items[plan.index]?.sell_price) > 0) && price > 0) {
        setValue(`items.${plan.index}.sell_price`, price);
      }
      return true;
    }

    if (plan.action === 'insert') {
      insert(plan.index, {
        ...defaultSalePackagingItem(),
        product: productId,
        packaging: packagingId,
        packaging_name: resolved.packaging.name,
        qty_in_base: qtyInBase,
        quantity: 1,
        sell_price: price,
      });
      return true;
    }

    setValue(`items.${plan.index}.product`, productId);
    setValue(`items.${plan.index}.packaging`, packagingId);
    setValue(`items.${plan.index}.packaging_name`, resolved.packaging.name);
    setValue(`items.${plan.index}.qty_in_base`, qtyInBase);
    setValue(`items.${plan.index}.quantity`, 1);
    if (price > 0) setValue(`items.${plan.index}.sell_price`, price);
    if (plan.index === 0) insert(0, defaultSalePackagingItem());
    return true;
  }, [insert, items, setValue, t]);

  const handleProductCodeSubmit = useCallback(async (code: string) => {
    const resolved = await resolveBarcode(code);
    if (!resolved) {
      notifyError(t('products.barcodeNotFound', 'No product found for this barcode'));
      return false;
    }
    return applyResolvedBarcode(resolved);
  }, [applyResolvedBarcode, t]);

  const itemsError =
    (errors.items as { message?: string; root?: { message?: string } } | undefined)?.message
    || (errors.items as { root?: { message?: string } } | undefined)?.root?.message;

  const statusOptions = [
    { value: 'draft', label: t('sales.status.draft', 'Draft') },
    { value: 'confirmed', label: t('sales.status.confirmed', 'Confirmed') },
    { value: 'delivered', label: t('sales.status.delivered', 'Delivered') },
    { value: 'cancelled', label: t('sales.status.cancelled', 'Cancelled') },
  ];

  return (
    <div className="min-h-full bg-background">
      <div className="z-40 flex-shrink-0 border-b border-border/70 bg-card shadow-sm">
        <div className="w-full px-3 py-3 sm:px-4 sm:py-4">
          <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 sm:mb-4 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="h-9 w-fit shrink-0 gap-1.5 bg-background px-2.5 shadow-none"
            >
              <BackIcon className="h-4 w-4" />
              <span>{t('common.back')}</span>
            </Button>
            <h1 className="min-w-0 text-base font-heading font-semibold tracking-tight sm:text-lg">
              {title}
            </h1>
          </div>

          {itemsError ? (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-semibold text-destructive">{itemsError}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
            <FormField
              control={control}
              name="customer"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel>{t('sales.customer')} ({t('common.optional', 'optional')})</FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="customers"
                      pageSize={30}
                      value={field.value || ''}
                      onChange={(value) => field.onChange(value?.toString() || '')}
                      placeholder={t('sales.selectCustomerOptional', 'Select customer (optional)')}
                      getOptionLabel={(c) => c.name || t('common.notAvailable')}
                      getOptionValue={(c) => c.id.toString()}
                      className="h-10 w-full"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="warehouse"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel>{t('purchases.warehouse', 'Warehouse')} *</FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="warehouses"
                      pageSize={30}
                      value={field.value}
                      onChange={(value) => field.onChange(value?.toString() || '')}
                      placeholder={t('purchases.selectWarehouse', 'Select warehouse')}
                      getOptionLabel={(wh) => wh.name}
                      getOptionValue={(wh) => wh.id.toString()}
                      className="h-10 w-full"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="currency"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel>{t('sales.currency', t('common.currency', 'Currency'))} *</FormLabel>
                  <FormControl>
                    <CurrencySelect
                      compact
                      value={field.value}
                      onChange={field.onChange}
                      allowedCodes={['AFN']}
                      className="w-full"
                      triggerClassName="h-10 min-h-10"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="status"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel>{t('common.status')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {statusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="sale_date"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel>{t('sales.saleDate', 'Sale date')} *</FormLabel>
                  <FormControl>
                    <DatePickerInput
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="dd/mm/yyyy"
                      className="h-10 w-full"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="discount"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel>{t('sales.discount', 'Discount %')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={field.value || ''}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      className="h-10 w-full"
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>
        </div>
      </div>

      <div
        className={cn(
          'flex flex-col gap-5 px-3 py-4 sm:gap-6 sm:px-5 sm:py-5 lg:flex-row lg:items-start',
          !summaryOpen && 'pb-24 lg:pb-5',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="shrink-0 text-sm font-semibold">{t('sales.items', 'Items')}</h3>
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-center sm:justify-end">
                <ProductScanBar require="sale" onResolved={applyResolvedBarcode} />
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => insert(1, defaultSalePackagingItem())}>
                  <Plus className="h-4 w-4" />
                  {t('sales.addItem', 'Add item')}
                </Button>
              </div>
            </div>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[1000px] table-fixed">
                  <colgroup>
                    <col style={{ width: '2.25rem' }} />
                    <col style={{ width: '36%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '2.5rem' }} />
                  </colgroup>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="bg-muted/20 px-1.5 text-center text-xs">#</TableHead>
                      <TableHead className="bg-muted/20 text-xs">{t('products.name', 'Product')}</TableHead>
                      <TableHead className="bg-muted/20 text-xs">{t('sales.unit', 'Sale unit')}</TableHead>
                      <TableHead className="bg-muted/20 text-xs">{t('sales.quantity', 'Qty')}</TableHead>
                      <TableHead className="bg-muted/20 text-xs">{t('purchases.baseQty', 'Base qty')}</TableHead>
                      <TableHead className="bg-muted/20 text-xs">{t('sales.price', 'Price')}</TableHead>
                      <TableHead className="bg-muted/20 text-right text-xs">{t('sales.total', 'Total')}</TableHead>
                      <TableHead className="bg-muted/20 px-1" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <SaleLineRow
                        key={field.id}
                        index={index}
                        control={control}
                        setValue={setValue}
                        items={items}
                        fieldsLength={fields.length}
                        currencySymbol={currencySymbol}
                        warehouseId={warehouse}
                        insert={insert}
                        move={move}
                        remove={remove}
                        onProductCodeSubmit={handleProductCodeSubmit}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {summaryOpen ? (
          <Card className="order-last flex w-full flex-shrink-0 flex-col overflow-hidden lg:order-none lg:sticky lg:top-4 lg:w-72 xl:w-80">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
              <h3 className="text-sm font-semibold">{t('sales.summary', 'Summary')}</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                onClick={() => setSummaryOpen(false)}
                title={t('common.close', 'Close')}
                aria-label={t('common.close', 'Close')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <CardContent className="flex-1 space-y-3 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t('sales.subtotal', 'Subtotal')}</span>
                  <span className="font-semibold tabular-nums">
                    {currencySymbol}{formatOrderNumeric(subtotal)}
                  </span>
                </div>
                {Number(discount) > 0 ? (
                  <div className="flex justify-between gap-3 text-muted-foreground">
                    <span>{t('sales.discount', 'Discount')} ({discount}%)</span>
                    <span className="tabular-nums">
                      -{currencySymbol}{formatOrderNumeric(subtotal - total)}
                    </span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3 border-t pt-2">
                  <span className="font-medium">{t('sales.finalTotal', 'Final total')}</span>
                  <span className="text-base font-bold tabular-nums text-primary">
                    {currencySymbol}{formatOrderNumeric(total)}
                  </span>
                </div>
                <AfnReportingPreview amount={total} currencyId={currency} atDate={saleDate} />
              </div>

              <FormField
                control={control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">{t('sales.notes', 'Notes')}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} className="resize-none text-xs" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
            <div className="mt-auto border-t p-4">
              <FormActions
                className="w-full flex-col pt-0 [&>button]:w-full"
                onCancel={onCancel}
                loading={loading}
                submitLabel={submitLabel}
                loadingLabel={loadingLabel}
              />
            </div>
          </Card>
        ) : (
          <div className="sticky top-4 order-last hidden w-12 flex-shrink-0 flex-col items-center gap-3 self-start lg:order-none lg:flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex h-auto flex-col gap-1.5 px-2 py-3"
              onClick={() => setSummaryOpen(true)}
              title={t('sales.summary', 'Summary')}
              aria-label={t('sales.summary', 'Summary')}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-[10px] font-medium [writing-mode:vertical-rl] rotate-180">
                {t('sales.summary', 'Summary')}
              </span>
            </Button>
          </div>
        )}

        {!summaryOpen && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm">
            <div className="mx-auto flex max-w-[1800px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <span className="text-muted-foreground">{t('sales.finalTotal', 'Final total')}: </span>
                <span className="font-bold tabular-nums text-primary">
                  {currencySymbol}{formatOrderNumeric(total)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSummaryOpen(true)}>
                  {t('sales.summary', 'Summary')}
                </Button>
                <FormActions
                  className="pt-0"
                  onCancel={onCancel}
                  loading={loading}
                  submitLabel={submitLabel}
                  loadingLabel={loadingLabel}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SaleLineRow({
  index,
  control,
  setValue,
  items,
  fieldsLength,
  currencySymbol,
  warehouseId,
  insert,
  move,
  remove,
  onProductCodeSubmit,
}: {
  index: number;
  control: Control<SalePackagingFormValues>;
  setValue: UseFormSetValue<SalePackagingFormValues>;
  items: SalePackagingFormValues['items'];
  fieldsLength: number;
  currencySymbol: string;
  warehouseId: string;
  insert: (index: number, value: ReturnType<typeof defaultSalePackagingItem>) => void;
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
  onProductCodeSubmit: (code: string) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const item = items[index];
  const lineTotal = (Number(item?.quantity) || 0) * (Number(item?.sell_price) || 0);

  const { data: productDetail } = useFetchObjects<ProductOption>({
    queryKey: ['product-for-sale-line', item?.product || '', warehouseId || ''],
    endpoint: item?.product ? `products/${item.product}/` : 'products/',
    params: warehouseId ? { warehouse: warehouseId } : undefined,
    enabled: Boolean(item?.product),
  });

  const packs = useMemo(() => {
    const rows = salePackagings(productDetail);
    if (rows.length) return rows;
    if (item?.packaging) {
      return [{
        id: Number(item.packaging),
        name: item.packaging_name || t('sales.unit', 'Unit'),
        qty_in_base: item.qty_in_base || 1,
        for_sale: true,
      }];
    }
    return [];
  }, [productDetail, item?.packaging, item?.packaging_name, item?.qty_in_base, t]);

  const fillSellPrice = (pack?: PackagingOption | null) => {
    const price = pickAfnRetailAmount(pack);
    setValue(`items.${index}.sell_price`, price > 0 ? price : 0);
  };

  // Fill AFN stock retail when packs load and the line price is still empty.
  useEffect(() => {
    if (!item?.product || !item?.packaging) return;
    if (Number(item.sell_price) > 0) return;
    const pack = packs.find((p) => String(p.id) === String(item.packaging));
    const price = pickAfnRetailAmount(pack);
    if (price > 0) fillSellPrice(pack);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when packs/retail become available
  }, [packs, item?.product, item?.packaging, item?.sell_price]);

  const applyPackaging = (pack?: PackagingOption | null, { fillPrice = true } = {}) => {
    if (!pack) {
      setValue(`items.${index}.packaging`, '');
      setValue(`items.${index}.packaging_name`, '');
      setValue(`items.${index}.qty_in_base`, 1);
      if (fillPrice) setValue(`items.${index}.sell_price`, 0);
      return;
    }
    setValue(`items.${index}.packaging`, String(pack.id));
    setValue(`items.${index}.packaging_name`, pack.name);
    setValue(`items.${index}.qty_in_base`, Number(pack.qty_in_base) || 1);
    if (fillPrice) fillSellPrice(pack);
  };

  // When product detail loads, auto-select the product's default sale unit.
  useEffect(() => {
    if (!item?.product || !productDetail?.packagings?.length) return;
    const rows = salePackagings(productDetail);
    if (!rows.length) return;
    const selectedOk =
      item.packaging
      && rows.some((p) => String(p.id) === String(item.packaging));
    if (selectedOk) return;
    const pack = pickDefaultPackaging(rows, productDetail);
    if (pack) applyPackaging(pack, { fillPrice: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once packs arrive / product changes
  }, [item?.product, item?.packaging, productDetail]);

  const stockLabel = (product?: ProductOption | null) => {
    if (product?.stock_on_hand == null || product.stock_on_hand === '') return null;
    const qty = formatOrderNumeric(Number(product.stock_on_hand) || 0);
    const uom = product.base_uom_details?.symbol || product.base_uom_details?.name || '';
    return uom ? `${qty} ${uom}` : qty;
  };

  return (
    <TableRow className="hover:bg-muted/20">
      <TableCell className="px-1.5 py-2 text-center text-xs font-semibold text-muted-foreground">
        <div className="flex h-10 items-center justify-center">{fieldsLength - index}</div>
      </TableCell>

      <TableCell className="py-2 pe-2 ps-1">
        <FormField
          control={control}
          name={`items.${index}.product`}
          render={({ field: productField }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Autocomplete
                  endpoint="products"
                  queryParams={{
                    is_active: true,
                    ...(warehouseId ? { warehouse: warehouseId } : {}),
                  }}
                  pageSize={30}
                  dropdownMinWidth={400}
                  value={productField.value}
                  onCodeSubmit={onProductCodeSubmit}
                  keepOpenAfterCodeSubmit
                  onChange={(value, option) => {
                    const selectedId = value?.toString() || '';
                    const previousId = productField.value?.toString() || '';
                    const changed = previousId !== selectedId;
                    productField.onChange(selectedId);
                    const productOption = option as ProductOption;
                    const pack = pickDefaultPackaging(
                      salePackagings(productOption),
                      productOption,
                    );
                    applyPackaging(pack, { fillPrice: true });
                    if (changed) {
                      setValue(`items.${index}.quantity`, selectedId ? 1 : 0);
                      if (!selectedId) setValue(`items.${index}.sell_price`, 0);
                    }
                    if (selectedId && changed) {
                      if (!previousId && index === 0) insert(0, defaultSalePackagingItem());
                      else if (index > 1) move(index, 1);
                    }
                  }}
                  placeholder={t('sales.selectProduct', 'Select product')}
                  searchPlaceholder={t(
                    'products.scanOrSearchProduct',
                    'Scan barcode or search name / SKU',
                  )}
                  getOptionLabel={(p: ProductOption) =>
                    [p.sku, p.name].filter(Boolean).join(' · ') || p.name || ''
                  }
                  getOptionValue={(p: ProductOption) => p.id.toString()}
                  renderOption={(p: ProductOption) => {
                    const stock = stockLabel(p);
                    return (
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.name}</div>
                          {p.sku ? (
                            <div className="truncate text-xs text-muted-foreground">SKU {p.sku}</div>
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-md px-1.5 py-0.5 text-xs tabular-nums',
                            Number(p.stock_on_hand) > 0
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {stock ?? '—'}
                        </span>
                      </div>
                    );
                  }}
                  className="h-10 w-full"
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="py-2">
        <FormField
          control={control}
          name={`items.${index}.packaging`}
          render={({ field: packField }) => (
            <FormItem className="space-y-0">
              <Select
                value={packField.value || undefined}
                onValueChange={(value) => {
                  const pack = packs.find((p) => String(p.id) === value);
                  packField.onChange(value);
                  applyPackaging(pack, { fillPrice: true });
                }}
                disabled={!item?.product}
              >
                <FormControl>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={t('sales.selectUnit', 'Select unit')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {packs.length === 0 ? (
                    <SelectItem value="__empty" disabled>
                      {t('sales.noSaleUnits', 'No sale units on this product')}
                    </SelectItem>
                  ) : (
                    packs.map((pack) => (
                      <SelectItem key={pack.id} value={String(pack.id)}>
                        {pack.name} (×{formatOrderNumeric(Number(pack.qty_in_base) || 1)})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="py-2">
        <FormField
          control={control}
          name={`items.${index}.quantity`}
          render={({ field: qtyField }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  step={ORDER_NUMERIC_STEP}
                  value={qtyField.value || ''}
                  onChange={(e) => qtyField.onChange(parseFloat(e.target.value) || 0)}
                  className="h-10"
                  placeholder="0"
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="py-2">
        <div className="flex h-10 items-center px-1 text-sm tabular-nums text-muted-foreground">
          {item?.product
            ? formatOrderNumeric((Number(item.quantity) || 0) * (Number(item.qty_in_base) || 1))
            : '—'}
        </div>
      </TableCell>

      <TableCell className="py-2">
        <FormField
          control={control}
          name={`items.${index}.sell_price`}
          render={({ field: priceField }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  step={ORDER_NUMERIC_STEP}
                  value={priceField.value || ''}
                  onChange={(e) => priceField.onChange(parseFloat(e.target.value) || 0)}
                  className="h-10"
                  placeholder="0"
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="py-2">
        <div className="flex h-10 items-center justify-end rounded-md bg-muted/30 px-2 text-sm font-semibold tabular-nums">
          <span className="me-1 text-muted-foreground">{currencySymbol}</span>
          {formatOrderNumeric(lineTotal)}
        </div>
      </TableCell>

      <TableCell className="py-2 text-center">
        <div className="flex h-10 items-center justify-center">
          {fieldsLength > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
