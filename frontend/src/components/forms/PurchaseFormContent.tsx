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
  calculatePurchaseSubtotal,
  calculatePurchaseTotal,
  defaultPurchaseItem,
  profitPercentFromSalePrice,
  salePriceFromProfitPercent,
  type PurchaseFormValues,
} from '@/lib/purchaseFormSchemas';
import { formatOrderNumeric, ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';
import { notifyError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import useFetchObjects from '@/api/useFetchObjects';

type PackagingOption = {
  id: number;
  name: string;
  qty_in_base?: number | string;
  for_purchase?: boolean;
  is_default_purchase?: boolean;
  is_variable_weight?: boolean;
  is_base?: boolean;
  is_active?: boolean;
  retail_price?: { amount?: number | string; currency?: number } | null;
};

type PurchaseFormContentProps = {
  control: Control<PurchaseFormValues>;
  setValue: UseFormSetValue<PurchaseFormValues>;
  title: string;
  loading: boolean;
  onCancel: () => void;
  submitLabel: string;
  loadingLabel: string;
};

const purchasePackagings = (option?: { packagings?: PackagingOption[] } | null) =>
  (option?.packagings || []).filter(
    (p) => p.for_purchase !== false && p.is_active !== false,
  );

const pickDefaultPackaging = (packs: PackagingOption[]) =>
  packs.find((p) => p.is_default_purchase)
  || packs.find((p) => !p.is_base)
  || packs[0];

export function PurchaseFormContent({
  control,
  setValue,
  title,
  loading,
  onCancel,
  submitLabel,
  loadingLabel,
}: PurchaseFormContentProps) {
  const { t, direction } = useLanguage();
  const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;
  const [summaryOpen, setSummaryOpen] = useState(true);
  const { fields, insert, move, remove } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' }) ?? [];
  const currency = useWatch({ control, name: 'currency' }) ?? '';
  const purchaseDate = useWatch({ control, name: 'purchase_date' }) ?? '';
  const profitPercent = useWatch({ control, name: 'profit_percent' }) ?? 0;
  const { errors } = useFormState({ control });

  const currencySymbol = resolveCurrencySymbol(currency);
  const currencyId = Number(currency) || 1;
  const needsFx = currencyId > 1;

  const lookupDate = useMemo(() => {
    if (!purchaseDate) return undefined;
    if (purchaseDate.length === 10) return `${purchaseDate}T12:00:00`;
    return purchaseDate;
  }, [purchaseDate]);

  const { data: fxLookup, isError: fxError } = useFetchObjects<{ rate?: number | string; error?: string }>({
    queryKey: ['exchange-rate-lookup-purchase', String(currencyId), lookupDate || 'now'],
    endpoint: 'exchange-rates/lookup/',
    params: {
      currency: currencyId,
      ...(lookupDate ? { date: lookupDate } : {}),
    },
    enabled: needsFx && currencyId > 0,
  });
  const fxRateToAfn = needsFx ? (Number(fxLookup?.rate) || 0) : 1;

  useEffect(() => {
    if (!needsFx) {
      setValue('exchange_rate', 1);
      return;
    }
    if (fxRateToAfn > 1) {
      setValue('exchange_rate', fxRateToAfn);
    }
  }, [needsFx, fxRateToAfn, setValue]);

  const subtotal = useMemo(() => calculatePurchaseSubtotal(items), [items]);

  const applyResolvedBarcode = useCallback((resolved: ResolvedBarcode) => {
    if (resolved.packaging.for_purchase === false) {
      notifyError(
        t('products.barcodeNotForPurchase', 'This barcode packaging is not enabled for purchase'),
      );
      return false;
    }
    const plan = planBarcodeLineApply(items, resolved, 1);
    const buyPrice = barcodeUnitPrice(resolved, 'purchase');
    const percent = Number(profitPercent) || 0;
    // Do not pull old list retail into a new purchase — only derive from buy + profit %.
    const salePrice = buyPrice > 0 && percent > 0
      ? salePriceFromProfitPercent(buyPrice, percent)
      : 0;
    const qtyInBase = Number(resolved.packaging.qty_in_base) || 1;
    const productId = String(resolved.product.id);
    const packagingId = String(resolved.packaging.id);
    const isVariable = Boolean(resolved.packaging.is_variable_weight);

    if (plan.action === 'increment') {
      setValue(`items.${plan.index}.quantity`, plan.quantity);
      return true;
    }

    const trackExpiry = Boolean(resolved.product.track_expiry);
    const line = {
      ...defaultPurchaseItem(),
      product: productId,
      packaging: packagingId,
      packaging_name: resolved.packaging.name,
      qty_in_base: qtyInBase,
      is_variable_weight: isVariable,
      track_expiry: trackExpiry,
      quantity: 1,
      price_per_unit: buyPrice,
      profit_percent: percent,
      sale_price: salePrice,
    };

    if (plan.action === 'insert') {
      insert(plan.index, line);
      return true;
    }

    setValue(`items.${plan.index}.product`, productId);
    setValue(`items.${plan.index}.packaging`, packagingId);
    setValue(`items.${plan.index}.packaging_name`, resolved.packaging.name);
    setValue(`items.${plan.index}.qty_in_base`, qtyInBase);
    setValue(`items.${plan.index}.is_variable_weight`, isVariable);
    setValue(`items.${plan.index}.track_expiry`, trackExpiry);
    setValue(`items.${plan.index}.quantity`, 1);
    setValue(`items.${plan.index}.price_per_unit`, buyPrice);
    setValue(`items.${plan.index}.profit_percent`, percent);
    setValue(`items.${plan.index}.sale_price`, salePrice);
    if (plan.index === 0) {
      insert(0, { ...defaultPurchaseItem(), profit_percent: percent });
    }
    return true;
  }, [insert, items, profitPercent, setValue, t]);

  const handleProductCodeSubmit = useCallback(async (code: string) => {
    const resolved = await resolveBarcode(code);
    if (!resolved) {
      notifyError(t('products.barcodeNotFound', 'No product found for this barcode'));
      return false;
    }
    return applyResolvedBarcode(resolved);
  }, [applyResolvedBarcode, t]);
  const total = useMemo(() => calculatePurchaseTotal(items), [items]);

  const applyProfitPercentToItems = (percent: number) => {
    setValue('profit_percent', percent);
    items.forEach((row, index) => {
      const buy = Number(row?.price_per_unit) || 0;
      setValue(`items.${index}.profit_percent`, percent);
      if (buy > 0) {
        setValue(`items.${index}.sale_price`, salePriceFromProfitPercent(buy, percent));
      }
    });
  };

  const itemsError =
    (errors.items as { message?: string; root?: { message?: string } } | undefined)?.message
    || (errors.items as { root?: { message?: string } } | undefined)?.root?.message;

  const statusOptions = [
    { value: 'draft', label: t('purchases.status.draft', 'Draft') },
    { value: 'pending', label: t('purchases.status.pending', 'Pending') },
    { value: 'received', label: t('purchases.status.received', 'Received') },
    { value: 'cancelled', label: t('purchases.status.cancelled', 'Cancelled') },
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
            <h1 className="min-w-0 text-base font-heading font-semibold tracking-tight text-foreground sm:text-lg">
              {title}
            </h1>
          </div>

          {itemsError && (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-semibold text-destructive">{itemsError}</p>
            </div>
          )}

          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <FormField
              control={control}
              name="vendor"
              render={({ field }) => (
                <FormItem className="flex min-w-[220px] flex-[1.3] flex-col gap-1.5 basis-[220px]">
                  <FormLabel className="line-clamp-2 text-sm font-medium leading-snug">
                    {t('purchases.vendor', 'Vendor')} *
                  </FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="vendors"
                      queryParams={{ status: 'active' }}
                      pageSize={30}
                      value={field.value}
                      onChange={(value) => field.onChange(value?.toString() || '')}
                      placeholder={t('purchases.selectVendor', 'Select vendor')}
                      searchPlaceholder={t('common.search')}
                      dropdownMinWidth={360}
                      getOptionLabel={(vendor) => vendor.name || t('common.notAvailable')}
                      getOptionValue={(v) => v.id.toString()}
                      renderOption={(vendor) => (
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1">
                          <span className="truncate font-medium">{vendor.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{vendor.phone || ''}</span>
                        </div>
                      )}
                      className="h-10 w-full"
                    />
                  </FormControl>
                  <FormMessage className="min-h-4 text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="warehouse"
              render={({ field }) => (
                <FormItem className="flex min-w-[200px] flex-1 flex-col gap-1.5 basis-[200px]">
                  <FormLabel className="line-clamp-2 text-sm font-medium leading-snug">
                    {t('purchases.warehouse', 'Warehouse')} *
                  </FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="warehouses"
                      pageSize={30}
                      value={field.value}
                      onChange={(value) => field.onChange(value?.toString() || '')}
                      placeholder={t('purchases.selectWarehouse', 'Select warehouse')}
                      searchPlaceholder={t('common.search')}
                      getOptionLabel={(wh) => wh.name || t('common.notAvailable')}
                      getOptionValue={(wh) => wh.id.toString()}
                      className="h-10 w-full"
                    />
                  </FormControl>
                  <FormMessage className="min-h-4 text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="currency"
              render={({ field }) => (
                <FormItem className="flex min-w-[180px] flex-1 flex-col gap-1.5 basis-[180px]">
                  <FormLabel className="line-clamp-2 text-sm font-medium leading-snug">
                    {t('purchases.currency', 'Currency')} *
                  </FormLabel>
                  <FormControl>
                    <CurrencySelect
                      compact
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t('purchases.selectCurrency', 'Select currency')}
                      className="w-full"
                      triggerClassName="h-10 min-h-10"
                    />
                  </FormControl>
                  <FormMessage className="min-h-4 text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="bill_number"
              render={({ field }) => (
                <FormItem className="flex min-w-[160px] flex-1 flex-col gap-1.5 basis-[160px]">
                  <FormLabel className="line-clamp-2 text-sm font-medium leading-snug">
                    {t('purchases.billNumber', 'Bill #')}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t('purchases.billNumber', 'Bill #')} className="h-10 w-full" />
                  </FormControl>
                  <FormMessage className="min-h-4 text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="status"
              render={({ field }) => (
                <FormItem className="flex min-w-[160px] flex-1 flex-col gap-1.5 basis-[160px]">
                  <FormLabel className="line-clamp-2 text-sm font-medium leading-snug">
                    {t('common.status')}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder={t('common.status')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {statusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="min-h-4 text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="purchase_date"
              render={({ field }) => (
                <FormItem className="flex min-w-[190px] flex-1 flex-col gap-1.5 basis-[190px]">
                  <FormLabel className="line-clamp-2 text-sm font-medium leading-snug">
                    {t('purchases.purchaseDate', 'Purchase date')} *
                  </FormLabel>
                  <FormControl>
                    <DatePickerInput
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="dd/mm/yyyy"
                      className="h-10 w-full"
                    />
                  </FormControl>
                  <FormMessage className="min-h-4 text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="profit_percent"
              render={({ field }) => (
                <FormItem className="flex min-w-[140px] flex-1 flex-col gap-1.5 basis-[140px]">
                  <FormLabel className="line-clamp-2 text-sm font-medium leading-snug">
                    {t('purchases.profitPercent', 'Profit %')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step={ORDER_NUMERIC_STEP}
                      value={field.value || ''}
                      onChange={(event) => {
                        const percent = parseFloat(event.target.value) || 0;
                        field.onChange(percent);
                        applyProfitPercentToItems(percent);
                      }}
                      className="h-10 w-full"
                      placeholder="0"
                    />
                  </FormControl>
                  <FormMessage className="min-h-4 text-xs" />
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
        <div className="flex min-w-0 flex-1 flex-col gap-5 sm:gap-6">
          <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="shrink-0 text-sm font-semibold">{t('purchases.items', 'Items')}</h3>
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-center sm:justify-end">
                <ProductScanBar require="purchase" onResolved={applyResolvedBarcode} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    insert(1, {
                      ...defaultPurchaseItem(),
                      profit_percent: Number(profitPercent) || 0,
                    })
                  }
                >
                  <Plus className="h-4 w-4" />
                  {t('purchases.addItem', 'Add item')}
                </Button>
              </div>
            </div>
            <CardContent className="min-w-0 p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[1360px] table-fixed">
                  <colgroup>
                    <col style={{ width: '2.5rem' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '2.75rem' }} />
                  </colgroup>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="bg-muted/20 px-1.5 text-center text-xs">#</TableHead>
                      <TableHead className="bg-muted/20 h-auto px-2 py-2 text-xs font-semibold normal-case tracking-normal">
                        <span className="line-clamp-2 leading-snug">{t('products.name', 'Product')}</span>
                      </TableHead>
                      <TableHead className="bg-muted/20 h-auto px-2 py-2 text-xs font-semibold normal-case tracking-normal">
                        <span className="line-clamp-2 leading-snug">{t('purchases.expiryDate', 'Expiry')}</span>
                      </TableHead>
                      <TableHead className="bg-muted/20 h-auto px-2 py-2 text-xs font-semibold normal-case tracking-normal">
                        <span className="line-clamp-2 leading-snug">{t('purchases.unitShort', 'Unit')}</span>
                      </TableHead>
                      <TableHead className="bg-muted/20 h-auto px-2 py-2 text-xs font-semibold normal-case tracking-normal">
                        <span className="line-clamp-2 leading-snug">{t('purchases.quantity', 'Qty')}</span>
                      </TableHead>
                      <TableHead className="bg-muted/20 h-auto px-2 py-2 text-xs font-semibold normal-case tracking-normal">
                        <span className="line-clamp-2 leading-snug">{t('purchases.baseQtyShort', 'Base qty')}</span>
                      </TableHead>
                      <TableHead className="bg-muted/20 h-auto px-2 py-2 text-xs font-semibold normal-case tracking-normal">
                        <span className="line-clamp-2 leading-snug">{t('purchases.buyPriceShort', 'Buy')}</span>
                      </TableHead>
                      <TableHead className="bg-muted/20 h-auto px-2 py-2 text-xs font-semibold normal-case tracking-normal">
                        <span className="line-clamp-2 leading-snug">{t('purchases.salesPriceShort', 'Sales')}</span>
                      </TableHead>
                      <TableHead className="bg-muted/20 h-auto px-2 py-2 text-right text-xs font-semibold normal-case tracking-normal">
                        <span className="line-clamp-2 leading-snug">{t('purchases.total', 'Total')}</span>
                      </TableHead>
                      <TableHead className="bg-muted/20 px-1" aria-label={t('common.actions')} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <PurchaseLineRow
                        key={field.id}
                        index={index}
                        control={control}
                        setValue={setValue}
                        items={items}
                        fieldsLength={fields.length}
                        currencySymbol={currencySymbol}
                        profitPercent={Number(profitPercent) || 0}
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
              <h3 className="text-sm font-semibold">{t('purchases.summary', 'Summary')}</h3>
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
                  <span className="text-muted-foreground">{t('purchases.subtotal', 'Subtotal')}</span>
                  <span className="font-semibold tabular-nums">
                    {currencySymbol}
                    {formatOrderNumeric(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-t pt-2">
                  <span className="font-medium">{t('purchases.finalTotal', 'Final total')}</span>
                  <span className="text-base font-bold tabular-nums text-primary">
                    {currencySymbol}
                    {formatOrderNumeric(total)}
                  </span>
                </div>
                <AfnReportingPreview amount={total} currencyId={currency} atDate={purchaseDate} />
                {needsFx && (fxError || fxRateToAfn <= 1) ? (
                  <p className="text-[11px] text-destructive">
                    {t(
                      'purchases.exchangeRateRequired',
                      'Add a USD→AFN exchange rate in Settings before saving — stock must be stored in AFN.',
                    )}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      'purchases.stockStoredInAfn',
                      'Stock costs and sale list prices are always saved in AFN using the rate nearest to the purchase date.',
                    )}
                  </p>
                )}
              </div>

              <FormField
                control={control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">{t('purchases.notes', 'Notes')}</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder={t('purchases.notesPlaceholder', 'Add notes...')}
                        rows={2}
                        className="resize-none text-xs"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </CardContent>
            <div className="mt-auto border-t bg-background p-4">
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
              title={t('purchases.summary', 'Summary')}
              aria-label={t('purchases.summary', 'Summary')}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-[10px] font-medium [writing-mode:vertical-rl] rotate-180">
                {t('purchases.summary', 'Summary')}
              </span>
            </Button>
          </div>
        )}

        {!summaryOpen && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm">
            <div className="mx-auto flex max-w-[1800px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <span className="text-muted-foreground">{t('purchases.finalTotal', 'Final total')}: </span>
                <span className="font-bold tabular-nums text-primary">
                  {currencySymbol}
                  {formatOrderNumeric(total)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setSummaryOpen(true)}>
                  {t('purchases.summary', 'Summary')}
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

function PurchaseLineRow({
  index,
  control,
  setValue,
  items,
  fieldsLength,
  currencySymbol,
  profitPercent,
  insert,
  move,
  remove,
  onProductCodeSubmit,
}: {
  index: number;
  control: Control<PurchaseFormValues>;
  setValue: UseFormSetValue<PurchaseFormValues>;
  items: PurchaseFormValues['items'];
  fieldsLength: number;
  currencySymbol: string;
  profitPercent: number;
  insert: (index: number, value: ReturnType<typeof defaultPurchaseItem>) => void;
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
  onProductCodeSubmit: (code: string) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const item = items[index];
  const lineTotal = (Number(item?.quantity) || 0) * (Number(item?.price_per_unit) || 0);
  const showMeasured = Boolean(item?.is_variable_weight);

  const { data: productDetail } = useFetchObjects<{
    packagings?: PackagingOption[];
    track_expiry?: boolean;
  }>({
    queryKey: ['product-for-purchase-line', item?.product || ''],
    endpoint: item?.product ? `products/${item.product}/` : 'products/',
    enabled: Boolean(item?.product),
  });

  const trackExpiry = Boolean(
    item?.track_expiry || productDetail?.track_expiry,
  );

  useEffect(() => {
    if (!item?.product) {
      if (item?.track_expiry) setValue(`items.${index}.track_expiry`, false);
      return;
    }
    if (productDetail && Boolean(productDetail.track_expiry) !== Boolean(item.track_expiry)) {
      setValue(`items.${index}.track_expiry`, Boolean(productDetail.track_expiry));
    }
  }, [item?.product, item?.track_expiry, productDetail, index, setValue]);

  const packs = useMemo(() => {
    const rows = purchasePackagings(productDetail);
    if (rows.length) return rows;
    if (item?.packaging) {
      return [
        {
          id: Number(item.packaging),
          name: item.packaging_name || t('purchases.unit', 'Unit'),
          qty_in_base: item.qty_in_base || 1,
          for_purchase: true,
          is_variable_weight: item.is_variable_weight,
        },
      ];
    }
    return [];
  }, [productDetail, item?.packaging, item?.packaging_name, item?.qty_in_base, item?.is_variable_weight, t]);

  const effectivePercent = Number(item?.profit_percent) || profitPercent || 0;

  const applyBuyPrice = (buy: number) => {
    setValue(`items.${index}.price_per_unit`, buy);
    setValue(`items.${index}.profit_percent`, effectivePercent);
    if (buy > 0 && effectivePercent > 0) {
      setValue(`items.${index}.sale_price`, salePriceFromProfitPercent(buy, effectivePercent));
    } else if (buy <= 0) {
      setValue(`items.${index}.sale_price`, 0);
    }
  };

  const applySalesPrice = (sales: number) => {
    const buy = Number(item?.price_per_unit) || 0;
    setValue(`items.${index}.sale_price`, sales);
    if (buy > 0 && sales > 0) {
      setValue(`items.${index}.profit_percent`, profitPercentFromSalePrice(buy, sales));
    }
  };

  const applyPackaging = (pack?: PackagingOption | null) => {
    if (!pack) {
      setValue(`items.${index}.packaging`, '');
      setValue(`items.${index}.packaging_name`, '');
      setValue(`items.${index}.qty_in_base`, 1);
      setValue(`items.${index}.is_variable_weight`, false);
      setValue(`items.${index}.measured_base_quantity`, '');
      return;
    }
    setValue(`items.${index}.packaging`, String(pack.id));
    setValue(`items.${index}.packaging_name`, pack.name);
    setValue(`items.${index}.qty_in_base`, Number(pack.qty_in_base) || 1);
    setValue(`items.${index}.is_variable_weight`, Boolean(pack.is_variable_weight));
    setValue(`items.${index}.measured_base_quantity`, '');

    // Keep sales price empty unless buy + profit % can derive it (never copy old retail).
    const buy = Number(item?.price_per_unit) || 0;
    if (buy > 0 && effectivePercent > 0) {
      setValue(`items.${index}.sale_price`, salePriceFromProfitPercent(buy, effectivePercent));
      setValue(`items.${index}.profit_percent`, effectivePercent);
    }
  };

  return (
    <TableRow className="hover:bg-muted/20">
      <TableCell className="px-1.5 py-2 text-center text-xs font-semibold tabular-nums text-muted-foreground">
        <div className="flex h-10 items-center justify-center">{fieldsLength - index}</div>
      </TableCell>

      <TableCell className="py-2 pe-2 ps-1">
        <FormField
          control={control}
          name={`items.${index}.product`}
          render={({ field: productField }) => (
            <FormItem className="min-w-0 space-y-0">
              <FormLabel className="sr-only">{t('products.name')} *</FormLabel>
              <FormControl>
                <Autocomplete
                  endpoint="products"
                  queryParams={{ is_active: true }}
                  pageSize={30}
                  dropdownMinWidth={360}
                  value={productField.value}
                  onCodeSubmit={onProductCodeSubmit}
                  keepOpenAfterCodeSubmit
                  onChange={(value, option) => {
                    const selectedId = value?.toString() || '';
                    const previousId = productField.value?.toString() || '';
                    const productChanged = previousId !== selectedId;
                    productField.onChange(selectedId);

                    const nextPacks = purchasePackagings(option);
                    applyPackaging(pickDefaultPackaging(nextPacks));

                    if (productChanged) {
                      setValue(`items.${index}.quantity`, 0);
                      setValue(`items.${index}.price_per_unit`, 0);
                      setValue(`items.${index}.profit_percent`, profitPercent);
                      setValue(`items.${index}.sale_price`, 0);
                      setValue(
                        `items.${index}.track_expiry`,
                        Boolean(option?.track_expiry),
                      );
                      setValue(`items.${index}.lot_number`, '');
                      setValue(`items.${index}.expiry_date`, '');
                    }

                    if (selectedId && productChanged) {
                      if (!previousId && index === 0) {
                        insert(0, {
                          ...defaultPurchaseItem(),
                          profit_percent: profitPercent,
                        });
                      } else if (index > 1) {
                        move(index, 1);
                      }
                    }
                  }}
                  placeholder={t('purchases.selectProduct', 'Select product')}
                  searchPlaceholder={t(
                    'products.scanOrSearchProduct',
                    'Scan barcode or search name / SKU',
                  )}
                  getOptionLabel={(product) =>
                    [product.sku, product.name].filter(Boolean).join(' · ') || t('common.notAvailable')
                  }
                  getOptionValue={(product) => product.id.toString()}
                  renderOption={(product) => (
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1">
                      <span className="truncate font-medium">{product.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {product.base_uom_details?.symbol
                          || product.base_uom_details?.name
                          || product.sku
                          || ''}
                      </span>
                    </div>
                  )}
                  className="h-10 w-full min-w-0"
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="py-2">
        {trackExpiry ? (
          <FormField
            control={control}
            name={`items.${index}.expiry_date`}
            render={({ field: expiryField }) => (
              <FormItem className="space-y-0">
                <FormLabel className="sr-only">
                  {t('purchases.expiryDate', 'Expiry')} *
                </FormLabel>
                <FormControl>
                  <DatePickerInput
                    value={expiryField.value || ''}
                    onChange={expiryField.onChange}
                    className="h-10 w-full min-w-0"
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        ) : (
          <div className="flex h-10 items-center px-1 text-sm text-muted-foreground">—</div>
        )}
      </TableCell>

      <TableCell className="py-2">
        <FormField
          control={control}
          name={`items.${index}.packaging`}
          render={({ field: packField }) => (
            <FormItem className="space-y-0">
              <FormLabel className="sr-only">{t('purchases.unit', 'Purchase unit')}</FormLabel>
              <Select
                value={packField.value || undefined}
                onValueChange={(value) => {
                  const pack = packs.find((p) => String(p.id) === value);
                  packField.onChange(value);
                  applyPackaging(pack);
                }}
                disabled={!item?.product}
              >
                <FormControl>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={t('purchases.selectUnit', 'Select unit')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {packs.length === 0 ? (
                    <SelectItem value="__empty" disabled>
                      {item?.product
                        ? t('purchases.noPurchaseUnits', 'No purchase units on this product')
                        : t('purchases.selectProductFirst', 'Select a product first')}
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
              <FormLabel className="sr-only">{t('purchases.quantity')} *</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  step={ORDER_NUMERIC_STEP}
                  value={qtyField.value || ''}
                  onChange={(event) => qtyField.onChange(parseFloat(event.target.value) || 0)}
                  className="h-10 w-full min-w-0"
                  placeholder="0"
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="py-2">
        {showMeasured ? (
          <FormField
            control={control}
            name={`items.${index}.measured_base_quantity`}
            render={({ field: measuredField }) => (
              <FormItem className="space-y-0">
                <FormLabel className="sr-only">{t('purchases.measuredBase', 'Measured base')}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step={ORDER_NUMERIC_STEP}
                    value={measuredField.value ?? ''}
                    onChange={(event) =>
                      measuredField.onChange(
                        event.target.value === '' ? '' : parseFloat(event.target.value) || 0,
                      )
                    }
                    className="h-10 w-full min-w-0"
                    placeholder="0"
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
        ) : (
          <div className="flex h-10 items-center px-1 text-sm tabular-nums text-muted-foreground">
            {item?.product
              ? formatOrderNumeric((Number(item.quantity) || 0) * (Number(item.qty_in_base) || 1))
              : '—'}
          </div>
        )}
      </TableCell>

      <TableCell className="py-2">
        <FormField
          control={control}
          name={`items.${index}.price_per_unit`}
          render={({ field: priceField }) => (
            <FormItem className="space-y-0">
              <FormLabel className="sr-only">{t('purchases.buyPrice', 'Buy price')} *</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  step={ORDER_NUMERIC_STEP}
                  value={priceField.value || ''}
                  onChange={(event) => {
                    const buy = parseFloat(event.target.value) || 0;
                    priceField.onChange(buy);
                    applyBuyPrice(buy);
                  }}
                  className="h-10 w-full min-w-0"
                  placeholder="0"
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
          name={`items.${index}.sale_price`}
          render={({ field: saleField }) => (
            <FormItem className="space-y-0">
              <FormLabel className="sr-only">{t('purchases.salesPrice', 'Sales price')}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  step={ORDER_NUMERIC_STEP}
                  value={saleField.value || ''}
                  onChange={(event) => {
                    const sales = parseFloat(event.target.value) || 0;
                    saleField.onChange(sales);
                    applySalesPrice(sales);
                  }}
                  className="h-10 w-full min-w-0"
                  placeholder="0"
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="py-2">
        <div className="flex h-10 items-center justify-end whitespace-nowrap rounded-md bg-muted/30 px-2 text-sm font-semibold tabular-nums">
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
              aria-label={t('common.delete')}
              title={t('common.delete')}
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
