import { TransactionTypeSelect } from '@/components/forms/TransactionTypeSelect';
import { MaterialCategorySelect } from '@/components/raw-materials/MaterialCategorySelect';
import { useMemo, useState } from 'react';
import { Control, UseFormSetValue, useFieldArray, useFormState, useWatch } from 'react-hook-form';
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
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
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { AfnReportingPreview } from '@/components/forms/AfnReportingPreview';
import { FormActions } from '@/components/forms/FormActions';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import {
  calculateRawMaterialPurchaseSubtotal,
  calculateRawMaterialPurchaseTotal,
  defaultRawMaterialItem,
  type RawMaterialPurchaseFormValues,
} from '@/lib/rawMaterialPurchaseFormSchemas';
import { formatOrderNumeric, ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';
import { cn } from '@/lib/utils';

type RawMaterialPurchaseFormContentProps = {
  control: Control<RawMaterialPurchaseFormValues>;
  setValue: UseFormSetValue<RawMaterialPurchaseFormValues>;
  title: string;
  loading: boolean;
  onCancel: () => void;
  submitLabel: string;
  loadingLabel: string;
  receivedOnly?: boolean;
};

export function RawMaterialPurchaseFormContent({
  control,
  setValue,
  title,
  loading,
  onCancel,
  submitLabel,
  loadingLabel,
  receivedOnly = false,
}: RawMaterialPurchaseFormContentProps) {
  const { t, direction } = useLanguage();
  const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;
  const [summaryOpen, setSummaryOpen] = useState(true);
  const { fields, insert, move, remove } = useFieldArray({ control, name: 'items' });
  const freePurchase = useWatch({ control, name: 'transaction_type' }) === 'free';
  const items = useWatch({ control, name: 'items' }) ?? [];
  const currency = useWatch({ control, name: 'currency' }) ?? '';
  const purchaseDate = useWatch({ control, name: 'purchase_date' }) ?? '';
  const { errors } = useFormState({ control });

  const currencySymbol = resolveCurrencySymbol(currency);

  const subtotal = useMemo(() => calculateRawMaterialPurchaseSubtotal(items), [items]);
  const total = useMemo(() => calculateRawMaterialPurchaseTotal(items), [items]);

  const itemsError =
    (errors.items as { message?: string; root?: { message?: string } } | undefined)?.message ||
    (errors.items as { root?: { message?: string } } | undefined)?.root?.message;

  const statusOptions = [
    { value: 'draft', label: t('rawMaterialPurchases.status.draft', 'Draft') },
    { value: 'pending', label: t('rawMaterialPurchases.status.pending', 'Pending') },
    { value: 'received', label: t('rawMaterialPurchases.status.received', 'Received') },
    { value: 'cancelled', label: t('rawMaterialPurchases.status.cancelled', 'Cancelled') },
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

          {receivedOnly && <p className="mb-3 text-sm text-muted-foreground">{t('rawMaterials.stockEntryHint')}</p>}
          {itemsError && (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-semibold text-destructive">{itemsError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.2fr)]">
            <FormField control={control} name="transaction_type" render={({ field }) => <FormItem className="flex min-w-0 flex-col gap-1.5 [&_button]:min-w-0">
              <FormLabel>{t('common.transactionType', 'Type')}</FormLabel><FormControl><TransactionTypeSelect value={field.value} onChange={value => {
                field.onChange(value);
                if (value === 'free') items.forEach((_, index) => setValue(`items.${index}.price_per_unit`, 0));
              }} /></FormControl><FormMessage />
            </FormItem>} />

            <FormField
              control={control}
              name="vendor"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel className="text-sm font-medium">{t('rawMaterialPurchases.vendor')} *</FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint="vendors"
                      queryParams={{ status: 'active' }}
                      pageSize={30}
                      value={field.value}
                      onChange={(value) => field.onChange(value?.toString() || '')}
                      placeholder={t('rawMaterialPurchases.selectVendor', 'Select vendor')}
                      searchPlaceholder={t('common.search')}
                      dropdownMinWidth={360}
                      getOptionLabel={(vendor) => vendor.name || t('common.notAvailable')}
                      getOptionValue={(v) => v.id.toString()}
                      renderOption={(vendor) => (
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1">
                          <span className="truncate font-medium">{vendor.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {vendor.phone || ''}
                          </span>
                        </div>
                      )}
                      className="h-10 w-full"
                    />
                  </FormControl>
                  <FormMessage className="text-xs min-h-4" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="currency"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel className="text-sm font-medium">{t('rawMaterialPurchases.currency')} *</FormLabel>
                  <FormControl>
                    <CurrencySelect
                      compact
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t('rawMaterialPurchases.selectCurrency', 'Select currency')}
                      className="w-full"
                      triggerClassName="h-10 min-h-10"
                    />
                  </FormControl>
                  <FormMessage className="text-xs min-h-4" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="bill_number"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel className="text-sm font-medium">{t('rawMaterialPurchases.billNumber')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t('rawMaterialPurchases.billNumber')}
                      className="h-10 w-full"
                    />
                  </FormControl>
                  <FormMessage className="text-xs min-h-4" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="status"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel className="text-sm font-medium">{t('common.status')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={receivedOnly}>
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
                  <FormMessage className="text-xs min-h-4" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="purchase_date"
              render={({ field }) => (
                <FormItem className="flex min-w-0 flex-col gap-1.5">
                  <FormLabel className="text-sm font-medium">{t('rawMaterialPurchases.purchaseDate')} *</FormLabel>
                  <FormControl>
                    <DatePickerInput
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="dd/mm/yyyy"
                      className="h-10 w-full"
                    />
                  </FormControl>
                  <FormMessage className="text-xs min-h-4" />
                </FormItem>
              )}
            />

          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start gap-5 sm:gap-6 px-3 sm:px-5 py-4 sm:py-5">
        <div className="flex-1 min-w-0 flex flex-col gap-5 sm:gap-6">
          <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <h3 className="font-semibold text-sm">{t('rawMaterialPurchases.items')}</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => insert(1, defaultRawMaterialItem())}>
                <Plus className="h-4 w-4" />
                {t('rawMaterialPurchases.addItem')}
              </Button>
            </div>
            <CardContent className="min-w-0 p-0">
              <div className="overflow-x-auto">
                <div className="min-w-[960px]">
                  <div className="grid grid-cols-[40px_minmax(220px,2fr)_minmax(120px,0.7fr)_repeat(4,minmax(110px,1fr))_40px] items-center gap-3 border-b bg-muted/20 px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                    <span className="text-center">#</span>
                    <span>{t('rawMaterials.name')}</span>
                    <span>{t('rawMaterials.category')}</span>
                    <span>{t('rawMaterialPurchases.quantity')}</span>
                    <span>{t('rawMaterialPurchases.pieceCount')} ({t('common.optional', 'Optional')})</span>
                    <span>{t('rawMaterialPurchases.pricePerUnit')}</span>
                    <span className="text-right">{t('rawMaterialPurchases.total')}</span>
                    <span aria-label={t('common.actions')} />
                  </div>
                  <div className="divide-y">
                    {fields.map((field, index) => {
                      const item = items[index];
                      const lineTotal = (Number(item?.quantity) || 0) * (Number(item?.price_per_unit) || 0);

                      return (
                        <section key={field.id} className="grid grid-cols-[40px_minmax(220px,2fr)_minmax(120px,0.7fr)_repeat(4,minmax(110px,1fr))_40px] items-end gap-3 px-4 py-3 hover:bg-muted/20">
                          <span className="flex h-10 items-center justify-center text-xs font-semibold tabular-nums text-muted-foreground">
                            {fields.length - index}
                          </span>
                          <div className="min-w-0 space-y-2">
                            <FormField
                              control={control}
                              name={`items.${index}.raw_material`}
                              render={({ field: productField }) => (
                                <FormItem className="min-w-0 space-y-1.5">
                                  <FormLabel className="sr-only">{t('rawMaterials.name')} *</FormLabel>
                                  <FormControl>
                                    <Autocomplete
                                      endpoint="raw-materials"
                                      queryParams={item?.raw_material_category ? { category: item.raw_material_category } : {}}
                                      excludeValues={items.flatMap((row, rowIndex) =>
                                        rowIndex !== index && row.raw_material ? [row.raw_material] : [],
                                      )}
                                      pageSize={30}
                                      dropdownMinWidth={320}
                                      value={productField.value}
                                      onChange={(value, option) => {
                                        const selectedId = value?.toString() || '';
                                        const materialChanged = productField.value?.toString() !== selectedId;
                                        productField.onChange(selectedId);
                                        setValue(`items.${index}.raw_material_unit`, option?.unit || 'kg');
                                        setValue(`items.${index}.raw_material_type`, option?.material_type || '');
                                        setValue(`items.${index}.raw_material_category`, option?.category ? String(option.category) : '');
                                        if (materialChanged && productField.value) {
                                          setValue(`items.${index}.quantity`, 0);
                                          setValue(`items.${index}.piece_count`, 0);
                                          setValue(`items.${index}.price_per_unit`, 0);
                                        }
                                        if (selectedId && materialChanged) {
                                          if (!items[index]?.raw_material && index === 0) {
                                            insert(0, defaultRawMaterialItem());
                                          } else if (index > 1) {
                                            move(index, 1);
                                          }
                                        }
                                      }}
                                      placeholder={t('rawMaterialPurchases.selectRawMaterial')}
                                      searchPlaceholder={t('common.search')}
                                      getOptionLabel={(material) => [material.category_name, material.name].filter(Boolean).join(" · ")}
                                      getOptionValue={(material) => material.id.toString()}
                                      renderOption={(material) => (
                                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1">
                                          <span className="truncate font-medium">{material.name}</span>
                                          <span className="shrink-0 text-xs text-muted-foreground">
                                            {material.material_type
                                              ? t(`rawMaterials.type${String(material.material_type).split('_').map((part: string) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}`)
                                              : material.unit}
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
                          </div>
                          <div className="min-w-0">
                            <MaterialCategorySelect value={item?.raw_material_category || ''}
                              onChange={(value) => {
                                if (value === (item?.raw_material_category || '')) return;
                                setValue(`items.${index}.raw_material_category`, value, { shouldDirty: true });
                              }} />
                          </div>
                          <div className="min-w-0">
                            <FormField
                              control={control}
                              name={`items.${index}.quantity`}
                              render={({ field: qtyField }) => (
                                <FormItem className="space-y-1.5">
                                  <FormLabel className="sr-only">{t('rawMaterialPurchases.quantity')} ({item?.raw_material_unit || 'kg'}) *</FormLabel>
                                  <div className="relative" dir="ltr">
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        step={ORDER_NUMERIC_STEP}
                                        value={qtyField.value || ''}
                                        onChange={(event) => qtyField.onChange(parseFloat(event.target.value) || 0)}
                                        className="h-10 w-full min-w-0 pr-14"
                                        placeholder="0"
                                      />
                                    </FormControl>
                                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground" aria-hidden="true">
                                      {item?.raw_material ? item.raw_material_unit : '—'}
                                    </span>
                                  </div>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="min-w-0">
                            {item?.raw_material_unit === 'kg' ? (
                              <FormField
                                control={control}
                                name={`items.${index}.piece_count`}
                                render={({ field: pieceCountField }) => (
                                  <FormItem className="space-y-1.5">
                                    <FormLabel className="sr-only">{t('rawMaterialPurchases.pieceCount')}</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={pieceCountField.value || ''}
                                        onChange={(event) => pieceCountField.onChange(
                                          Math.max(0, parseInt(event.target.value, 10) || 0),
                                        )}
                                        className="h-10 w-full min-w-0"
                                        placeholder="0"
                                      />
                                    </FormControl>
                                    <FormMessage className="text-xs" />
                                  </FormItem>
                                )}
                              />
                            ) : (
                              <div className="flex h-10 items-center px-3 text-sm text-muted-foreground">—</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <FormField
                              control={control}
                              name={`items.${index}.price_per_unit`}
                              render={({ field: priceField }) => (
                                <FormItem className="space-y-1.5">
                                  <FormLabel className="sr-only">{t('rawMaterialPurchases.pricePerUnit')}{!freePurchase && ' *'}</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="0"
                                      step={ORDER_NUMERIC_STEP}
                                      value={freePurchase ? 0 : priceField.value || ''}
                                      disabled={freePurchase}
                                      onChange={(event) => priceField.onChange(parseFloat(event.target.value) || 0)}
                                      className="h-10 w-full min-w-0"
                                      placeholder="0"
                                    />
                                  </FormControl>
                                  <FormMessage className="text-xs" />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="flex h-10 items-center justify-end whitespace-nowrap rounded-md bg-muted/30 px-2 text-sm font-semibold tabular-nums">
                            {currencySymbol}{formatOrderNumeric(lineTotal)}
                          </div>
                          <div className="flex h-10 items-center justify-center">
                            {fields.length > 1 && (
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
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {summaryOpen ? (
          <Card className="w-full lg:w-72 xl:w-80 flex-shrink-0 overflow-hidden flex flex-col order-last lg:order-none">
            <div className="border-b bg-muted/30 px-4 py-3">
              <h3 className="font-semibold text-sm">{t('rawMaterialPurchases.summary')}</h3>
            </div>

            <CardContent className="p-4 space-y-3 flex-1">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">{t('rawMaterialPurchases.subtotal')}</span>
                  <span className="font-semibold tabular-nums">
                    {currencySymbol}
                    {formatOrderNumeric(subtotal)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 pt-2 border-t">
                  <span className="text-slate-700 font-medium">{t('rawMaterialPurchases.finalTotal')}</span>
                  <span className="font-bold text-primary text-base tabular-nums">
                    {currencySymbol}
                    {formatOrderNumeric(total)}
                  </span>
                </div>

                <AfnReportingPreview
                  amount={total}
                  currencyId={currency}
                  atDate={purchaseDate}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    'rawMaterialPurchases.stockStoredInAfn',
                    'Stock costs are always saved in AFN using the rate nearest to the purchase date.',
                  )}
                </p>
              </div>

              <FormField
                control={control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-slate-700">
                      {t('rawMaterialPurchases.notes')}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder={t('rawMaterialPurchases.notesPlaceholder', 'Add notes...')}
                        rows={2}
                        className="text-xs resize-none"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </CardContent>

            <div className="p-4 border-t border-slate-200 bg-white mt-auto">
              <FormActions
                className="flex-col w-full pt-0 [&>button]:w-full"
                onCancel={onCancel}
                loading={loading}
                submitLabel={submitLabel}
                loadingLabel={loadingLabel}
              />
            </div>
          </Card>
        ) : (
          <div className="hidden lg:flex w-10 flex-shrink-0 justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto py-3 px-2 flex flex-col gap-1.5 sticky top-4"
              onClick={() => setSummaryOpen(true)}
              title={t('rawMaterialPurchases.summary')}
              aria-label={t('rawMaterialPurchases.summary')}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-[10px] font-medium [writing-mode:vertical-rl] rotate-180">
                {t('rawMaterialPurchases.summary')}
              </span>
            </Button>
          </div>
        )}

        {!summaryOpen && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-sm shadow-lg px-4 py-3 lg:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 max-w-[1800px] mx-auto">
              <div className="text-sm">
                <span className="text-slate-600">{t('rawMaterialPurchases.finalTotal')}: </span>
                <span className="font-bold text-primary">
                  {currencySymbol}
                  {formatOrderNumeric(total)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSummaryOpen(true)}
                >
                  {t('rawMaterialPurchases.summary')}
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
