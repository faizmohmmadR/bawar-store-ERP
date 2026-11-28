import { collectFormIssues } from '@/lib/validationErrors';
import { saleErrorLabel } from '@/lib/saleValidation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TransactionTypeSelect } from '@/components/forms/TransactionTypeSelect';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Control, UseFormSetValue, useFieldArray, useFormState, useWatch } from 'react-hook-form';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Card, CardContent } from '@/components/ui/card';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { CurrencySelect } from '@/components/forms/CurrencySelect';
import { DateTimePickerInput } from '@/components/ui/date-time-picker-input';
import { AfnReportingPreview } from '@/components/forms/AfnReportingPreview';
import { FormActions, type FormSubmitIntent } from '@/components/forms/FormActions';
import { useLanguage } from '@/contexts/LanguageContext';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';
import { FALLBACK_BASE_SYMBOL } from '@/lib/currencies';
import {
  calculateSaleSubtotal,
  calculateSaleTotal,
  defaultSaleItem,
  defaultSaleItemForType,
  isPieceSaleUnit,
  normalizeStockSaleUnit,
  saleLineDana,
  saleLineTotal,
  type SaleFormValues,
  type SaleUnit,
} from '@/lib/saleFormSchemas';
import { afnToUsd, isUsdCurrency, usdToAfn } from '@/lib/saleFx';
import type { SaleSource } from '@/types/sale';
import { formatOrderNumeric, ORDER_NUMERIC_STEP } from '@/lib/orderNumeric';
import useFetchObjects from '@/api/useFetchObjects';
import {
  cartonsFromPieces,
  DEFAULT_PIECES_PER_CARTON,
} from '@/lib/packaging';
import { stockPieces } from '@/lib/stockApi';
import {
  orderFormHeaderControlClass,
  orderFormHeaderField,
  orderFormHeaderLabel,
  orderFormPanelHeader,
  orderFormPanelTitle,
  orderFormRowControl,
  orderFormTableNumericCol,
  orderFormTablePriceCol,
  orderFormTableProductCol,
  orderFormTableTotalCol,
  orderFormTableUnitCol,
} from '@/components/forms/orderFormStyles';
import { cn } from '@/lib/utils';

type SaleOrderFormContentProps = {
  control: Control<SaleFormValues>;
  setValue: UseFormSetValue<SaleFormValues>;
  title: string;
  loading: boolean;
  onCancel: () => void;
  submitLabel: string;
  loadingLabel: string;
  showSaveAndCreateNew?: boolean;
  onIntent?: (intent: FormSubmitIntent) => void;
  /** When set, hides the sale-type toggle and keeps every line on this source. */
  lockedSaleType?: SaleSource;
};

function SaleUnitToggle({
  value,
  onChange,
  cartonLabel,
  bottleLabel,
  plasticLabel,
  kilogramLabel,
  kilogramDisabled = false,
  materialType,
}: {
  value: SaleUnit;
  onChange: (v: SaleUnit) => void;
  cartonLabel: string;
  bottleLabel: string;
  plasticLabel: string;
  kilogramLabel: string;
  kilogramDisabled?: boolean;
  materialType?: string;
}) {
  const active = value === 'kg'
    ? 'kg'
    : value === 'plastic' || value === 'bottle' || value === 'dana'
    ? (value === 'dana' ? 'bottle' : value)
    : 'carton';
  const nativeUnit = materialType === 'carton' ? 'carton' : materialType === 'plastic' ? 'plastic' : ['bottle', 'bottle_with_cap'].includes(materialType || '') ? 'bottle' : null;
  const btn = (unit: SaleUnit, label: string, withBorder: boolean, disabled = false) => (
    (!nativeUnit || unit === nativeUnit || (nativeUnit === 'bottle' && unit === 'kg')) && <button
      type="button"
      tabIndex={0}
      onClick={() => onChange(unit)}
      disabled={disabled}
      className={cn(
        'flex-1 text-[10px] sm:text-xs font-medium transition-colors px-0.5',
        withBorder && 'border-l',
        disabled && 'cursor-not-allowed opacity-40',
        active === unit
          ? 'bg-primary text-primary-foreground'
          : 'bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex h-9 w-full rounded-md border overflow-hidden">
      {btn('carton', cartonLabel, false)}
      {btn('bottle', bottleLabel, true)}
      {btn('plastic', plasticLabel, true)}
      {btn('kg', kilogramLabel, true, kilogramDisabled)}
    </div>
  );
}


function SaleSourceToggle({
  value,
  onChange,
  stockLabel,
  tankLabel,
}: {
  value: SaleSource;
  onChange: (v: SaleSource) => void;
  stockLabel: string;
  tankLabel: string;
}) {
  const options: { key: 'stock' | 'tank'; label: string }[] = [
    { key: 'stock', label: stockLabel },
    { key: 'tank', label: tankLabel },
  ];
  return (
    <div className="flex h-9 w-36 rounded-md border overflow-hidden">
      {options.map((option, index) => (
        <button
          key={option.key}
          type="button"
          tabIndex={0}
          onClick={() => onChange(option.key)}
          className={cn(
            'flex-1 text-[11px] font-medium transition-colors px-1',
            index > 0 && 'border-l',
            value === option.key
              ? 'bg-neutral-900 text-primary'
              : 'bg-background text-muted-foreground hover:bg-muted',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function parseQtyInput(raw: string) {
  if (raw === '' || raw === '.') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Local draft text so parent re-renders don't wipe / block typing. */
export function SaleQtyInput({
  value,
  onChange,
  className,
  placeholder,
  disabled = false,
  'aria-label': ariaLabel,
}: {
  value: number | null | undefined;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const focusedRef = useRef(false);
  const [text, setText] = useState(() =>
    value === 0 || value == null ? '' : String(value),
  );

  useEffect(() => {
    if (focusedRef.current) return;
    setText(value === 0 || value == null ? '' : String(value));
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      value={text}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        const n = parseQtyInput(text);
        setText(n === 0 ? '' : String(n));
        onChange(n);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        onChange(parseQtyInput(raw));
      }}
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}

export function SaleOrderFormContent({
  control,
  setValue,
  title,
  loading,
  onCancel,
  submitLabel,
  loadingLabel,
  showSaveAndCreateNew = false,
  onIntent,
  lockedSaleType,
}: SaleOrderFormContentProps) {
  const { t, direction } = useLanguage();
  const BackIcon = direction === 'rtl' ? ArrowRight : ArrowLeft;
  const [summaryOpen, setSummaryOpen] = useState(true);
  const { fields, prepend, remove } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' }) ?? [];
  const discount = useWatch({ control, name: 'discount' }) ?? 0;
  const currency = useWatch({ control, name: 'currency' }) ?? '';
  const partyType = useWatch({ control, name: 'party_type' }) || 'customer';
  const vendorParty = partyType === 'vendor';
  const employeeParty = partyType === 'employee';
  const freeSale = useWatch({ control, name: 'transaction_type' }) === 'free';
  const saleType: SaleSource =
    lockedSaleType && lockedSaleType !== 'tank' && lockedSaleType !== 'raw_material'
      ? lockedSaleType
      : 'stock';
  const { errors } = useFormState({ control });

  const isLineEmpty = useCallback(
    (item?: Partial<SaleFormValues['items'][number]> | null) =>
      !item?.stock,
    [],
  );

  // Keep an empty select row at the top so choosing an item pushes it below.
  useEffect(() => {
    if (!items.length) return;
    if (!isLineEmpty(items[0])) {
      prepend(defaultSaleItemForType(saleType), { shouldFocus: false });
    }
  }, [items, isLineEmpty, prepend, saleType]);

  // Form prices stay in AFN internally, but are entered in the invoice currency.
  const afnSymbol = FALLBACK_BASE_SYMBOL;
  const invoiceSymbol = resolveCurrencySymbol(currency);
  const saleDate = useWatch({ control, name: 'sale_date' });
  const isTankSale = false;
  const isRawMaterialSale = false;
  const isUsd = isUsdCurrency(currency);

  const lookupDate = useMemo(() => {
    if (!saleDate) return undefined;
    if (saleDate.length === 10) return `${saleDate}T12:00:00`;
    return saleDate;
  }, [saleDate]);

  const { data: fxLookup } = useFetchObjects<{ rate?: number | string }>({
    queryKey: ['exchange-rate-lookup', '2', lookupDate || 'now'],
    endpoint: 'exchange-rates/lookup/',
    params: {
      currency: 2,
      ...(lookupDate ? { date: lookupDate } : {}),
    },
    enabled: isUsd,
  });

  const afnPerUsd = Number(fxLookup?.rate) || 0;
  const currencyItems = useMemo(
    () =>
      isUsd && afnPerUsd > 0
        ? items.map((item) => ({
            ...item,
            sell_price: afnToUsd(Number(item.sell_price) || 0, afnPerUsd, 4),
          }))
        : items,
    [items, isUsd, afnPerUsd],
  );
  const totalAfn = useMemo(() => calculateSaleTotal(items, discount), [items, discount]);
  const subtotalInCurrency = useMemo(
    () => (isUsd && afnPerUsd <= 0 ? null : calculateSaleSubtotal(currencyItems)),
    [currencyItems, isUsd, afnPerUsd],
  );
  const totalInCurrency = useMemo(
    () => (isUsd && afnPerUsd <= 0 ? null : calculateSaleTotal(currencyItems, discount)),
    [currencyItems, discount, isUsd, afnPerUsd],
  );
  const discountInCurrency =
    subtotalInCurrency == null ? null : (subtotalInCurrency * (discount || 0)) / 100;
  const priceCurrencyLabel = isUsd
    ? t('sales.usdAmount', 'USD')
    : t('sales.afnEquivalent', 'AFN');

  const lineTotalInCurrency = (item?: Partial<SaleFormValues['items'][number]> | null) => {
    if (!isUsd) return saleLineTotal(item ?? {});
    if (afnPerUsd <= 0) return null;
    return saleLineTotal({
      ...item,
      sell_price: afnToUsd(Number(item?.sell_price) || 0, afnPerUsd, 4),
    });
  };

  const validationIssues = collectFormIssues(errors);

  const getPriceLabel = useCallback(
    (unit: SaleUnit | string, source: 'stock' | 'tank' | 'raw_material' = 'stock') => {
      if (unit === 'kg') {
        return t('sales.pricePerKg', 'Price / Kg');
      }
      if (source === 'raw_material') {
        return t('sales.pricePerPiece', 'Price / pcs');
      }
      if (source === 'tank' || unit === 'liter') {
        return t('sales.pricePerKg', 'Price / kg');
      }
      const normalized = normalizeStockSaleUnit(unit);
      if (normalized === 'plastic') return t('sales.pricePerPlastic', 'Price / Plastic');
      if (isPieceSaleUnit(normalized)) return t('sales.pricePerBottle', 'Price / Bottle');
      return t('sales.pricePerCarton', 'Price / Carton');
    },
    [t],
  );

  const getQtyLabel = useCallback(
    (unit: SaleUnit | string, source: 'stock' | 'tank' | 'raw_material' = 'stock') => {
      if (unit === 'kg') {
        return t('sales.qtyKg', 'Quantity (Kg)');
      }
      if (source === 'raw_material') {
        return t('sales.qtyPiece', 'Quantity (pcs)');
      }
      if (source === 'tank' || unit === 'liter') {
        return t('sales.qtyKg', 'Quantity (kg)');
      }
      const normalized = normalizeStockSaleUnit(unit);
      if (normalized === 'plastic') return t('sales.qtyPlastic', 'Quantity (Plastic)');
      if (isPieceSaleUnit(normalized)) return t('sales.qtyBottle', 'Quantity (Bottle)');
      return t('sales.qtyCarton', 'Quantity (Carton)');
    },
    [t],
  );

  const qtyColumnTitle = useMemo(() => {
    const defaultUnit = isTankSale ? 'kg' : isRawMaterialSale ? 'piece' : 'carton';
    const units = new Set(
      (items.length ? items : [{ unit: defaultUnit }])
        .map((i) => i?.unit || defaultUnit),
    );
    if (units.size === 1) {
      return getQtyLabel(
        [...units][0],
        isTankSale ? 'tank' : isRawMaterialSale ? 'raw_material' : 'stock',
      );
    }
    return t('sales.quantity', 'Quantity');
  }, [items, getQtyLabel, t, isTankSale, isRawMaterialSale]);

  const priceColumnTitle = useMemo(() => {
    const defaultUnit = isTankSale ? 'kg' : isRawMaterialSale ? 'piece' : 'carton';
    const units = new Set(
      (items.length ? items : [{ unit: defaultUnit }])
        .map((i) => i?.unit || defaultUnit),
    );
    if (units.size === 1) {
      return getPriceLabel(
        [...units][0],
        isTankSale ? 'tank' : isRawMaterialSale ? 'raw_material' : 'stock',
      );
    }
    return t('sales.price', 'Price');
  }, [items, getPriceLabel, t, isTankSale, isRawMaterialSale]);

  const customerQueryParams = useMemo(() => ({}), []);
  const stockQueryParams = useMemo(() => {
    return { condition: 'good' };
  }, []);

  const getStockLabel = useCallback(
    (s: { product_details?: { name?: string } }) =>
      s.product_details?.name || t('sales.product', 'Product'),
    [t],
  );

  const getStockValue = useCallback((s: { id: string | number }) => s.id.toString(), []);

  const getTankLabel = useCallback(
    (tank: { name?: string; current_liters?: string | number; product_name?: string; current_kg?: string | number }) => {
      const product = tank.product_name ? `${tank.product_name} · ` : '';
      const kilograms = Number(tank.current_kg || 0);
      return `${tank.name || t('sales.tank', 'Tank')} · ${product}${kilograms} kg`;
    },
    [t],
  );

  const getTankValue = useCallback((tank: { id: string | number }) => tank.id.toString(), []);

  const renderProductOption = useCallback(
    (s: Parameters<typeof stockPieces>[0] & {
      carton_amount?: number | string;
      bottle_amount?: number | string;
      plastic_amount?: number | string;
    }) => {
      const pieces = stockPieces(s);
      const type = s.product_details?.material_type;
      const name = s.product_details?.name || t('sales.product', 'Product');
      const color = (s as { color?: string }).color?.trim();
      const unit = type === 'carton' ? t('stock.cartonUnits') : type === 'plastic' ? t('stock.plasticPackUnits')
        : ['bottle', 'bottle_with_cap'].includes(type || '') ? t('stock.bottleUnits') : t('sales.piecesShort', 'pcs');
      const qtyText = (s.product_details?.raw_material || s.product_details?.material_type)
        ? `${pieces.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${unit}`
        : `${cartonsFromPieces(pieces, Number(s.product_details?.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON)} ${t('sales.cartonShort', 'CTN')} · ${pieces} ${t('sales.piecesShort', 'pcs')}`;

      const label = color ? `${name} · ${color}` : name;
      return (
        <div className="flex w-full min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium text-foreground" title={label}>
            {label}
          </span>
          <span
            className="truncate text-xs text-muted-foreground"
            title={`${t('sales.available', 'Available')}: ${qtyText}`}
          >
            {t('sales.available', 'Available')}: {qtyText}
          </span>
        </div>
      );
    },
    [t],
  );

  const renderTankOption = useCallback(
    (tank: { name?: string; current_liters?: string | number; current_kg?: string | number }) => {
      const name = tank.name || t('sales.tank', 'Tank');
      const available = `${Number(tank.current_kg || 0)} kg`;
      return (
        <div className="flex w-full min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium text-foreground" title={name}>
            {name}
          </span>
          <span
            className="truncate text-xs text-muted-foreground"
            title={`${t('sales.available', 'Available')}: ${available}`}
          >
            {t('sales.available', 'Available')}: {available}
          </span>
        </div>
      );
    },
    [t],
  );

  const switchUnit = (index: number, nextUnit: SaleUnit) => {
    const item = items[index] ?? defaultSaleItem();
    if (item.sale_source === 'tank') return;
    const totalPieces = saleLineDana(item);
    const cartonSize = Number(item.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON;
    const normalized = normalizeStockSaleUnit(nextUnit);
    setValue(`items.${index}.unit`, normalized, { shouldDirty: true, shouldValidate: true });
    if (normalized === 'kg') {
      const kgPerBottle = (Number(item.density_kg_per_liter) || 0)
        * (Number(item.bottle_capacity_liters) || 0);
      setValue(`items.${index}.kilogram_amount`, totalPieces * kgPerBottle, { shouldDirty: true });
      setValue(`items.${index}.carton_amount`, 0, { shouldDirty: true });
      setValue(`items.${index}.piece_amount`, 0, { shouldDirty: true });
    } else if (isPieceSaleUnit(normalized)) {
      setValue(`items.${index}.piece_amount`, totalPieces, { shouldDirty: true });
      setValue(`items.${index}.carton_amount`, 0, { shouldDirty: true });
      setValue(`items.${index}.kilogram_amount`, 0, { shouldDirty: true });
    } else {
      const cartons = cartonSize > 0 ? totalPieces / cartonSize : 0;
      setValue(`items.${index}.carton_amount`, cartons, { shouldDirty: true });
      setValue(`items.${index}.piece_amount`, 0, { shouldDirty: true });
      setValue(`items.${index}.kilogram_amount`, 0, { shouldDirty: true });
    }
  };

  const applySaleType = (nextType: SaleSource) => {
    setValue('sale_type', nextType, { shouldDirty: true, shouldValidate: true });
    const currentItems = items.length ? items : [defaultSaleItem()];
    currentItems.forEach((_, index) => {
      setValue(`items.${index}.sale_source`, nextType, { shouldDirty: true, shouldValidate: true });
      if (nextType === 'tank') {
        setValue(`items.${index}.stock`, '', { shouldDirty: true });
        setValue(`items.${index}.raw_material_stock`, '', { shouldDirty: true });
        setValue(`items.${index}.unit`, 'kg', { shouldDirty: true });
        setValue(`items.${index}.carton_amount`, 0, { shouldDirty: true });
        setValue(`items.${index}.piece_amount`, 0, { shouldDirty: true });
        setValue(`items.${index}.kilogram_amount`, 0, { shouldDirty: true });
        setValue(`items.${index}.piece_count`, 0, { shouldDirty: true });
      } else if (nextType === 'raw_material') {
        setValue(`items.${index}.stock`, '', { shouldDirty: true });
        setValue(`items.${index}.storage_tank`, '', { shouldDirty: true });
        setValue(`items.${index}.unit`, 'piece', { shouldDirty: true });
        setValue(`items.${index}.raw_material_unit`, 'piece', { shouldDirty: true });
        setValue(`items.${index}.carton_amount`, 0, { shouldDirty: true });
        setValue(`items.${index}.piece_amount`, 0, { shouldDirty: true });
        setValue(`items.${index}.liter_amount`, 0, { shouldDirty: true });
        setValue(`items.${index}.kilogram_amount`, 0, { shouldDirty: true });
        setValue(`items.${index}.piece_count`, 0, { shouldDirty: true });
      } else {
        setValue(`items.${index}.storage_tank`, '', { shouldDirty: true });
        setValue(`items.${index}.raw_material_stock`, '', { shouldDirty: true });
        setValue(`items.${index}.unit`, 'carton', { shouldDirty: true });
        setValue(`items.${index}.liter_amount`, 0, { shouldDirty: true });
        setValue(`items.${index}.kilogram_amount`, 0, { shouldDirty: true });
        setValue(`items.${index}.piece_count`, 0, { shouldDirty: true });
        setValue(`items.${index}.density_kg_per_liter`, 0, { shouldDirty: true });
      }
    });
  };

  const switchRawUnit = (index: number, unit: 'kg' | 'piece', force = false) => {
    if (!force && items[index]?.unit === unit) return;
    setValue(`items.${index}.unit`, unit, { shouldDirty: true });
    setValue(`items.${index}.piece_amount`, 0, { shouldDirty: true });
    setValue(`items.${index}.kilogram_amount`, 0, { shouldDirty: true });
    setValue(`items.${index}.piece_count`, 0, { shouldDirty: true });
    setValue(`items.${index}.sell_price`, 0, { shouldDirty: true });
  };
  const rawUnitSelect = (index: number, unit: SaleUnit) => {
    const item = items[index];
    const weightKnown = Number(item?.raw_weight_per_piece_kg) > 0;
    const unitError = errors.items?.[index]?.unit?.message;
    return <div><div className={cn("flex h-9 w-full overflow-hidden rounded-md border", unitError && "border-destructive")} role="group" aria-label={t('rawMaterials.unit', 'Unit')}>
      {(['piece', 'kg'] as const).map((choice, position) => {
        const disabled = !!item?.raw_material_stock && choice !== item.raw_material_unit && !weightKnown && choice !== unit;
        return <button key={choice} type="button" aria-pressed={unit === choice} disabled={disabled}
          title={disabled ? t('rawMaterialSales.setPieceWeight', 'Set piece weight in raw materials to enable conversion.') : undefined}
          onClick={() => switchRawUnit(index, choice)}
          className={cn('flex-1 px-1 text-xs font-medium transition-colors', position > 0 && 'border-s', disabled && 'cursor-not-allowed opacity-40', unit === choice ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>
          {choice === 'kg' ? t('sales.kilogramShort', 'kg') : t('sales.piecesShort', 'pcs')}
        </button>;
      })}
    </div>{unitError && <p className="mt-1 text-xs text-destructive">{String(unitError)}</p>}</div>;
  };

  const addEmptySelectRow = () => {
    prepend(defaultSaleItemForType(saleType), { shouldFocus: false });
  };

  const handleRemoveRow = (index: number) => {
    if (fields.length <= 1) return;
    remove(index);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
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

          {validationIssues.length > 0 && <div id="sale-validation-errors" role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="mb-2 text-sm font-semibold text-destructive">{t('sales.fixInvalid', 'Please complete the required sale fields')}</p>
            <ul className="list-inside list-disc space-y-1 text-sm text-destructive">
              {validationIssues.map(issue => <li key={issue.path + issue.message}><span className="font-medium">{saleErrorLabel(issue.path, t)}{saleErrorLabel(issue.path, t) ? ': ' : ''}</span>{issue.message}</li>)}
            </ul>
          </div>}

          {isRawMaterialSale && vendorParty && <p className="mb-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{t('rawMaterialSales.vendorCreditHelp', 'Goods reduce stock and settle the vendor balance in this currency. Any excess stays as credit for future purchases; no cash moves.')}</p>}
          {employeeParty && <p className="mb-3 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{t('sales.employeeSalaryHelp', 'This sale posts as paid salary for the employee on the sale date. No cash moves — goods settle wages.')}</p>}
          <div className="flex items-start gap-3 flex-wrap">
            <FormField control={control} name="transaction_type" render={({ field }) => <FormItem className="flex min-w-0 shrink-0 flex-col">
              <FormLabel className={orderFormHeaderLabel}>{t('common.transactionType', 'Type')}</FormLabel>
              <FormControl><TransactionTypeSelect className={orderFormHeaderControlClass(!!errors.transaction_type)} value={field.value} onChange={value => {
                field.onChange(value);
                if (value === 'free') {
                  if (vendorParty) setValue('vendor_transaction', 'sale');
                  if (employeeParty) setValue('party_type', 'customer');
                  setValue('discount', 0);
                  items.forEach((_, index) => { setValue(`items.${index}.sell_price`, 0); });
                }
              }} /></FormControl><FormMessage />
            </FormItem>} />

            <FormField control={control} name="party_type" render={({ field }) => <FormItem className="min-w-0 flex flex-col">
              <FormLabel className={orderFormHeaderLabel}>{t('sales.partyType', 'Buyer')}</FormLabel>
              <Select value={field.value} onValueChange={value => {
                field.onChange(value);
                setValue('customer', '');
                setValue('vendor', '');
                setValue('employee', '');
                setValue('vendor_transaction', 'sale');
                if (value === 'employee') {
                  setValue('transaction_type', 'paid');
                }
              }}>
                <FormControl><SelectTrigger className={orderFormHeaderControlClass(false)}><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="customer">{t('sales.customer')}</SelectItem>
                  <SelectItem value="employee">{t('sales.employee', 'Employee')}</SelectItem>
                  {isRawMaterialSale && <SelectItem value="vendor">{t('rawMaterialPurchases.vendor')}</SelectItem>}
                </SelectContent>
              </Select><FormMessage />
            </FormItem>} />
            <FormField
              key={vendorParty ? 'vendor' : employeeParty ? 'employee' : 'customer'}
              control={control}
              name={vendorParty ? 'vendor' : employeeParty ? 'employee' : 'customer'}
              render={({ field }) => (
                <FormItem className="min-w-0 flex flex-col flex-1 min-w-[10rem]">
                  <FormLabel className={orderFormHeaderLabel}>
                    {vendorParty
                      ? t('rawMaterialPurchases.vendor')
                      : employeeParty
                        ? t('sales.employee', 'Employee')
                        : t('sales.customer')}
                    {(vendorParty || employeeParty) ? ' *' : ''}
                  </FormLabel>
                  <FormControl>
                    <Autocomplete
                      endpoint={vendorParty ? 'vendors' : employeeParty ? 'employees' : 'customers'}
                      queryParams={employeeParty ? undefined : customerQueryParams}
                      value={field.value}
                      onChange={(value) => field.onChange(value?.toString() || '')}
                      placeholder={
                        vendorParty
                          ? t('rawMaterialPurchases.selectVendor', 'Select vendor')
                          : employeeParty
                            ? t('sales.selectEmployee', 'Select employee')
                            : t('sales.walkInOptional', 'Walk-in (optional)')
                      }
                      getOptionLabel={(c) => (employeeParty ? (c.full_name || c.name) : c.name)}
                      getOptionValue={(c) => c.id.toString()}
                      className={orderFormHeaderControlClass(!!(
                        vendorParty ? errors.vendor : employeeParty ? errors.employee : errors.customer
                      ))}
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
                <FormItem className="min-w-0 flex flex-col w-40 shrink-0">
                  <FormLabel className={orderFormHeaderLabel}>{t('sales.currency')} *</FormLabel>
                  <FormControl>
                    <CurrencySelect
                      compact
                      value={field.value}
                      onChange={field.onChange}
                      allowedCodes={['AFN', 'USD']}
                      autoSelectBase
                      placeholder={t('sales.selectCurrency', 'Select AFN or USD')}
                      className="w-full"
                      triggerClassName={orderFormHeaderControlClass(!!errors.currency)}
                    />
                  </FormControl>
                  <FormMessage className="text-xs min-h-4" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="bill_no"
              render={({ field }) => (
                <FormItem className="min-w-0 flex flex-col w-44 shrink-0">
                  <FormLabel className={orderFormHeaderLabel}>{t('sales.billNo', 'Bill No')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t('sales.billNoPlaceholder', 'Optional bill number')}
                      className={orderFormHeaderControlClass(false)}
                    />
                  </FormControl>
                  <FormMessage className="text-xs min-h-4" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="sale_date"
              render={({ field }) => (
                <FormItem className="min-w-0 flex flex-col w-56 shrink-0">
                  <FormLabel className={orderFormHeaderLabel}>{t('sales.saleDate')} *</FormLabel>
                  <FormControl>
                    <DateTimePickerInput
                      value={field.value || ''}
                      onChange={field.onChange}
                      className={orderFormHeaderControlClass(!!errors.sale_date)}
                    />
                  </FormControl>
                  <FormMessage className="text-xs min-h-4" />
                </FormItem>
              )}
            />
          </div>
        </div>
      </div>

      <div
        className={cn(
          'flex flex-col lg:flex-row lg:items-start gap-5 sm:gap-6 px-3 sm:px-5 py-4 sm:py-5 flex-1 overflow-auto',
          !summaryOpen && 'pb-24 lg:pb-5',
        )}
      >
        <Card className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {isRawMaterialSale && <p className="border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground">{t('rawMaterialSales.unitHelp', 'Choose kg or pieces and enter one quantity. Conversion uses saved piece weight or recorded stock weight and counts.')}</p>}
          <div className={orderFormPanelHeader}>
            <h3 className={orderFormPanelTitle}>{t('sales.saleItems', 'Sale Items')}</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={addEmptySelectRow}
              title={t('sales.addLine', 'Add line')}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t('sales.addLine', 'Add line')}</span>
            </Button>
          </div>
          <CardContent className="p-0 flex-1">
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full table-fixed text-xs sm:text-sm min-w-[56rem]">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-center px-2 py-2 font-semibold w-10 first:pl-3">#</th>
                    <th className={cn('text-left px-2 py-2 font-semibold', orderFormTableProductCol)}>
                      {isTankSale
                        ? t('sales.tank')
                        : isRawMaterialSale
                          ? t('sales.rawMaterial', 'Raw material')
                          : t('sales.product')}
                    </th>
                    <th className={cn('text-left px-2 py-2 font-semibold', orderFormTableUnitCol)}>
                      {t('sales.unit', 'Unit')}
                    </th>
                    <th className={cn('text-left px-2 py-2 font-semibold', orderFormTableNumericCol)}>
                      {qtyColumnTitle}
                    </th>
                    <th className={cn('text-left px-2 py-2 font-semibold', orderFormTablePriceCol)}>
                      {priceColumnTitle} ({priceCurrencyLabel})
                    </th>
                    <th
                      className={cn(
                        'text-right px-2 py-2 font-semibold last:pr-3',
                        orderFormTableTotalCol,
                      )}
                    >
                      {t('sales.total')} ({priceCurrencyLabel})
                    </th>
                    <th className="w-10 last:pr-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, index) => {
                    const item = items[index];
                    const lineSource = (item?.sale_source || saleType) as SaleSource;
                    const isTank = false;
                    const isRaw = false;
                    const isDraft = isLineEmpty(item);
                    const unit = (item?.unit || (isTank ? 'kg' : isRaw ? 'piece' : 'carton')) as SaleUnit;
                    const isCarton = !isTank && !isRaw && !isPieceSaleUnit(unit);
                    const lineTotal = lineTotalInCurrency(item);
                    const qtyName = unit === 'kg'
                      ? (`items.${index}.kilogram_amount` as const)
                      : isTank
                      ? (`items.${index}.liter_amount` as const)
                      : isCarton
                        ? (`items.${index}.carton_amount` as const)
                        : (`items.${index}.piece_amount` as const);
                    const rowNumber = isDraft
                      ? '+'
                      : String(
                          items
                            .slice(0, index + 1)
                            .filter((row) => !isLineEmpty(row)).length,
                        );

                    return (
                      <tr
                        key={field.id}
                        className={cn(
                          'border-b hover:bg-muted/20',
                          isDraft && 'bg-muted/10',
                        )}
                      >
                        <td className="px-2 py-1.5 text-center font-semibold text-primary first:pl-3 align-middle">
                          {rowNumber}
                        </td>
                        <td className={cn('px-2 py-1.5 align-middle', orderFormTableProductCol)}>
                          {isTank ? (
                            <FormField
                              control={control}
                              name={`items.${index}.storage_tank`}
                              render={({ field: tankField }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <Autocomplete
                                      endpoint="storage-tanks"
                                      value={tankField.value}
                                      onChange={(value, option) => {
                                        const next = value?.toString() || '';
                                        tankField.onChange(next);
                                        setValue(
                                          `items.${index}.density_kg_per_liter`,
                                          Number(option?.density_kg_per_liter) || 0,
                                          { shouldDirty: true },
                                        );
                                      }}
                                      placeholder={t('sales.selectTank', 'Select storage tank')}
                                      getOptionLabel={getTankLabel}
                                      getOptionValue={getTankValue}
                                      className={cn(orderFormRowControl, 'min-h-9 py-0')}
                                      renderOption={renderTankOption}
                                      dropdownMinWidth={320}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          ) : isRaw ? (
                            <FormField
                              control={control}
                              name={`items.${index}.raw_material_stock`}
                              render={({ field: rmField }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <Autocomplete
                                      endpoint="raw-material-stocks"
                                      value={rmField.value}
                                      onChange={(value, option) => {
                                        const next = value?.toString() || '';
                                        rmField.onChange(next);
                                        const rmUnit = String(option?.raw_material_details?.unit || 'piece') === 'kg' ? 'kg' : 'piece';
                                        setValue(`items.${index}.raw_material_unit`, rmUnit, { shouldDirty: true });
                                        switchRawUnit(index, rmUnit, true);
                                        setValue(`items.${index}.raw_weight_per_piece_kg`, Number(option?.raw_material_details?.weight_per_piece_kg) || (rmUnit === 'kg' && Number(option?.piece_count) > 0 ? Number(option?.quantity) / Number(option?.piece_count) : 0), { shouldDirty: true });
                                        setValue(`items.${index}.piece_amount`, 0, { shouldDirty: true });
                                        setValue(`items.${index}.kilogram_amount`, 0, { shouldDirty: true });
                                        setValue(`items.${index}.piece_count`, 0, { shouldDirty: true });
                                      }}
                                      placeholder={t('sales.selectRawMaterial', 'Select raw material')}
                                      getOptionLabel={(option) => {
                                        const name = option?.raw_material_details?.name || option?.raw_material_name || t('sales.rawMaterial', 'Raw material');
                                        const unit = option?.raw_material_details?.unit || 'kg';
                                        const qty = Number(option?.quantity || 0);
                                        const pieces = Number(option?.piece_count || 0);
                                        const piecePart = unit === 'kg' && pieces > 0 ? ` · ${pieces} ${t('sales.piecesShort', 'pcs')}` : '';
                                        return `${name} · ${qty.toLocaleString()} ${unit}${piecePart}`;
                                      }}
                                      getOptionValue={(option) => option.id.toString()}
                                      className={cn(orderFormRowControl, 'min-h-9 py-0')}
                                      dropdownMinWidth={320}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          ) : (
                            <FormField
                              control={control}
                              name={`items.${index}.stock`}
                              render={({ field: stockField }) => (
                                <FormItem className="space-y-0">
                                  <FormControl>
                                    <Autocomplete
                                      endpoint="stocks"
                                      queryParams={stockQueryParams}
                                      value={stockField.value}
                                      onChange={(value, option) => {
                                        const next = value?.toString() || '';
                                        stockField.onChange(next);
                                        const type = option?.product_details?.material_type || '';
                                        setValue(`items.${index}.stock_material_type`, type, { shouldDirty: true });
                                        const native = type === 'carton' ? 'carton' : type === 'plastic' ? 'plastic' : ['bottle', 'bottle_with_cap'].includes(type) ? 'bottle' : 'carton';
                                        setValue(`items.${index}.unit`, native, { shouldDirty: true, shouldValidate: true });
                                        setValue(`items.${index}.carton_amount`, 0, { shouldDirty: true });
                                        setValue(`items.${index}.piece_amount`, 0, { shouldDirty: true });
                                        setValue(`items.${index}.kilogram_amount`, 0, { shouldDirty: true });
                                        setValue(`items.${index}.bottles_per_carton`, (option?.product_details?.raw_material || option?.product_details?.material_type) ? 1 : Number(option?.product_details?.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON);
                                        setValue(`items.${index}.density_kg_per_liter`, Number(option?.product_details?.density_kg_per_liter) || 0);
                                        setValue(`items.${index}.bottle_capacity_liters`, (Number(option?.product_details?.bottle_capacity_kg) / (Number(option?.product_details?.density_kg_per_liter) || 1)) || Number(option?.product_details?.bottle_capacity_liters) || 0);
                                      }}
                                      placeholder={t('sales.selectProduct')}
                                      getOptionLabel={getStockLabel}
                                      getOptionValue={getStockValue}
                                      className={cn(orderFormRowControl, 'min-h-9 py-0')}
                                      renderOption={renderProductOption}
                                      dropdownMinWidth={320}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          )}
                        </td>
                        <td className={cn('px-2 py-1.5 align-middle', orderFormTableUnitCol)}>
                          {isTank ? (
                            <div className="flex h-9 items-center justify-center rounded-md border px-2 text-xs">kg</div>
                          ) : isRaw ? (
                            rawUnitSelect(index, unit)
                          ) : (
                            <SaleUnitToggle
                              materialType={item?.stock_material_type}
                              value={unit === 'liter' ? 'carton' : unit}
                              onChange={(next) => switchUnit(index, next)}
                              cartonLabel={t('sales.cartonShort', 'CTN')}
                              bottleLabel={t('sales.bottleShort', 'BTL')}
                              plasticLabel={t('sales.plasticShort', 'PLS')}
                              kilogramLabel={t('sales.kilogramShort', 'kg')}
                              kilogramDisabled={
                                !(Number(item?.density_kg_per_liter) > 0)
                                || !(Number(item?.bottle_capacity_liters) > 0)
                              }
                            />
                          )}
                        </td>
                        <td className={cn('px-2 py-1.5 align-middle', orderFormTableNumericCol)}>
                          <FormField
                            control={control}
                            name={qtyName}
                            render={({ field: qtyField }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <SaleQtyInput
                                    key={qtyName}
                                    value={qtyField.value}
                                    onChange={qtyField.onChange}
                                    className={cn(orderFormRowControl, 'text-sm w-full min-w-0')}
                                    placeholder={getQtyLabel(unit, isRaw ? 'raw_material' : saleType)}
                                    aria-label={getQtyLabel(unit, isRaw ? 'raw_material' : saleType)}
                                  />
                                </FormControl>
                                <FormMessage className="text-xs" />

                              </FormItem>
                            )}
                          />
                        </td>
                        <td className={cn('px-2 py-1.5 align-middle', orderFormTablePriceCol)}>
                          <FormField
                            control={control}
                            name={`items.${index}.sell_price`}
                            render={({ field: priceField }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <SaleQtyInput
                                    value={
                                      freeSale
                                        ? 0
                                        : isUsd
                                          ? afnPerUsd > 0
                                            ? afnToUsd(Number(priceField.value) || 0, afnPerUsd, 4)
                                            : undefined
                                          : priceField.value
                                    }
                                    disabled={freeSale || (isUsd && afnPerUsd <= 0)}
                                    onChange={(value) => {
                                      if (!isUsd) {
                                        priceField.onChange(value);
                                        return;
                                      }
                                      const priceAfn = usdToAfn(value, afnPerUsd);
                                      if (priceAfn != null) priceField.onChange(priceAfn);
                                    }}
                                    className={cn(orderFormRowControl, 'text-sm w-full min-w-0')}
                                    placeholder={getPriceLabel(unit, isRaw ? 'raw_material' : saleType)}
                                    aria-label={getPriceLabel(unit, isRaw ? 'raw_material' : saleType)}
                                  />
                                </FormControl>
                                <FormMessage className="text-xs" />
                              </FormItem>
                            )}
                          />
                        </td>
                        <td
                          className={cn(
                            'px-2 py-1.5 text-right font-semibold text-sm tabular-nums last:pr-3 align-middle',
                            orderFormTableTotalCol,
                          )}
                        >
                          {lineTotal == null ? '—' : `${invoiceSymbol}${formatOrderNumeric(lineTotal)}`}
                        </td>
                        <td className="px-1 py-1.5 last:pr-2 align-middle">
                          {fields.length > 1 && !isDraft && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveRow(index)}
                              className="h-9 w-9 p-0 hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="block sm:hidden p-3 space-y-3">
              {fields.map((field, index) => {
                const item = items[index];
                const lineSource = (item?.sale_source || saleType) as SaleSource;
                const isTank = false;
                const isRaw = false;
                const isDraft = isLineEmpty(item);
                const unit = (item?.unit || (isTank ? 'kg' : isRaw ? 'piece' : 'carton')) as SaleUnit;
                const isCarton = !isTank && !isRaw && !isPieceSaleUnit(unit);
                const lineTotal = lineTotalInCurrency(item);
                const qtyName = unit === 'kg'
                  ? (`items.${index}.kilogram_amount` as const)
                  : isTank
                  ? (`items.${index}.liter_amount` as const)
                  : isCarton
                    ? (`items.${index}.carton_amount` as const)
                    : (`items.${index}.piece_amount` as const);
                const rowNumber = isDraft
                  ? '+'
                  : String(
                      items
                        .slice(0, index + 1)
                        .filter((row) => !isLineEmpty(row)).length,
                    );

                return (
                  <Card key={field.id} className={cn('border-2 shadow-sm', isDraft && 'border-dashed')}>
                    <CardContent className="p-3 sm:p-4 space-y-3">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-bold text-base text-primary">
                          {isDraft
                            ? t('sales.addLine', 'Add line')
                            : `${t('sales.item')} #${rowNumber}`}
                        </span>
                        {fields.length > 1 && !isDraft && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveRow(index)}
                            className="h-9 w-9 p-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      {isTank ? (
                        <FormField
                          control={control}
                          name={`items.${index}.storage_tank`}
                          render={({ field: tankField }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium">
                                {t('sales.tank', 'Storage tank')} *
                              </FormLabel>
                              <FormControl>
                                <Autocomplete
                                  endpoint="storage-tanks"
                                  value={tankField.value}
                                  onChange={(value, option) => {
                                    const next = value?.toString() || '';
                                    tankField.onChange(next);
                                    setValue(
                                      `items.${index}.density_kg_per_liter`,
                                      Number(option?.density_kg_per_liter) || 0,
                                      { shouldDirty: true },
                                    );
                                  }}
                                  placeholder={t('sales.selectTank', 'Select storage tank')}
                                  getOptionLabel={getTankLabel}
                                  getOptionValue={getTankValue}
                                  className={cn(orderFormRowControl, 'min-h-9 py-0')}
                                  renderOption={renderTankOption}
                                  dropdownMinWidth={320}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      ) : isRaw ? (
                        <FormField
                          control={control}
                          name={`items.${index}.raw_material_stock`}
                          render={({ field: rmField }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-medium">
                                {t('sales.rawMaterial', 'Raw material')} *
                              </FormLabel>
                              <FormControl>
                                <Autocomplete
                                  endpoint="raw-material-stocks"
                                  value={rmField.value}
                                  onChange={(value, option) => {
                                    const next = value?.toString() || '';
                                    rmField.onChange(next);
                                    const rmUnit = String(option?.raw_material_details?.unit || 'piece') === 'kg' ? 'kg' : 'piece';
                                    setValue(`items.${index}.raw_material_unit`, rmUnit, { shouldDirty: true });
                                    switchRawUnit(index, rmUnit, true);
                                        setValue(`items.${index}.raw_weight_per_piece_kg`, Number(option?.raw_material_details?.weight_per_piece_kg) || (rmUnit === 'kg' && Number(option?.piece_count) > 0 ? Number(option?.quantity) / Number(option?.piece_count) : 0), { shouldDirty: true });
                                  }}
                                  placeholder={t('sales.selectRawMaterial', 'Select raw material')}
                                  getOptionLabel={(option) => {
                                    const name = option?.raw_material_details?.name || option?.raw_material_name || t('sales.rawMaterial', 'Raw material');
                                    const rmUnit = option?.raw_material_details?.unit || 'kg';
                                    return `${name} · ${Number(option?.quantity || 0).toLocaleString()} ${rmUnit}`;
                                  }}
                                  getOptionValue={(option) => option.id.toString()}
                                  className={cn(orderFormRowControl, 'min-h-9 py-0')}
                                  dropdownMinWidth={320}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      ) : (
                        <>
                          <div className="w-full max-w-[14rem]">
                            <SaleUnitToggle
                              materialType={item?.stock_material_type}
                              value={unit === 'liter' ? 'carton' : unit}
                              onChange={(next) => switchUnit(index, next)}
                              cartonLabel={t('sales.cartonShort', 'CTN')}
                              bottleLabel={t('sales.bottleShort', 'BTL')}
                              plasticLabel={t('sales.plasticShort', 'PLS')}
                              kilogramLabel={t('sales.kilogramShort', 'kg')}
                              kilogramDisabled={
                                !(Number(item?.density_kg_per_liter) > 0)
                                || !(Number(item?.bottle_capacity_liters) > 0)
                              }
                            />
                          </div>
                          <FormField
                            control={control}
                            name={`items.${index}.stock`}
                            render={({ field: stockField }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-medium">
                                  {t('sales.product')} *
                                </FormLabel>
                                <FormControl>
                                  <Autocomplete
                                    endpoint="stocks"
                                    queryParams={stockQueryParams}
                                    value={stockField.value}
                                    onChange={(value, option) => {
                                      const next = value?.toString() || '';
                                      stockField.onChange(next);
                                        const type = option?.product_details?.material_type || '';
                                        setValue(`items.${index}.stock_material_type`, type, { shouldDirty: true });
                                        const native = type === 'carton' ? 'carton' : type === 'plastic' ? 'plastic' : ['bottle', 'bottle_with_cap'].includes(type) ? 'bottle' : 'carton';
                                        setValue(`items.${index}.unit`, native, { shouldDirty: true, shouldValidate: true });
                                        setValue(`items.${index}.carton_amount`, 0, { shouldDirty: true });
                                        setValue(`items.${index}.piece_amount`, 0, { shouldDirty: true });
                                        setValue(`items.${index}.kilogram_amount`, 0, { shouldDirty: true });

                                      setValue(`items.${index}.bottles_per_carton`, (option?.product_details?.raw_material || option?.product_details?.material_type) ? 1 : Number(option?.product_details?.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON);
                                      setValue(`items.${index}.density_kg_per_liter`, Number(option?.product_details?.density_kg_per_liter) || 0);
                                      setValue(`items.${index}.bottle_capacity_liters`, (Number(option?.product_details?.bottle_capacity_kg) / (Number(option?.product_details?.density_kg_per_liter) || 1)) || Number(option?.product_details?.bottle_capacity_liters) || 0);
                                    }}
                                    placeholder={t('sales.selectProduct')}
                                    getOptionLabel={getStockLabel}
                                    getOptionValue={getStockValue}
                                    className={cn(orderFormRowControl, 'min-h-9 py-0')}
                                    renderOption={renderProductOption}
                                    dropdownMinWidth={320}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {isTank && (
                        <div className="flex h-9 items-center justify-center rounded-md border px-2 text-xs">kg</div>
                      )}
                      {isRaw && <div className="space-y-1"><p className="text-sm font-medium">{t('rawMaterials.unit', 'Unit')}</p>{rawUnitSelect(index, unit)}</div>}

                      <FormField
                        control={control}
                        name={qtyName}
                        render={({ field: qtyField }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">
                              {getQtyLabel(unit, isRaw ? 'raw_material' : saleType)}
                            </FormLabel>
                            <FormControl>
                              <SaleQtyInput
                                key={qtyName}
                                value={qtyField.value}
                                onChange={qtyField.onChange}
                                className={cn(orderFormRowControl, 'text-sm w-full')}
                                placeholder={getQtyLabel(unit, isRaw ? 'raw_material' : saleType)}
                                aria-label={getQtyLabel(unit, isRaw ? 'raw_material' : saleType)}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />

                              </FormItem>
                        )}
                      />

                      <FormField
                        control={control}
                        name={`items.${index}.sell_price`}
                        render={({ field: priceField }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">
                              {getPriceLabel(unit, isRaw ? 'raw_material' : saleType)} ({priceCurrencyLabel}){!freeSale && ' *'}
                            </FormLabel>
                            <FormControl>
                              <SaleQtyInput
                                value={
                                  freeSale
                                    ? 0
                                    : isUsd
                                      ? afnPerUsd > 0
                                        ? afnToUsd(Number(priceField.value) || 0, afnPerUsd, 4)
                                        : undefined
                                      : priceField.value
                                }
                                disabled={freeSale || (isUsd && afnPerUsd <= 0)}
                                onChange={(value) => {
                                  if (!isUsd) {
                                    priceField.onChange(value);
                                    return;
                                  }
                                  const priceAfn = usdToAfn(value, afnPerUsd);
                                  if (priceAfn != null) priceField.onChange(priceAfn);
                                }}
                                className={cn(orderFormRowControl, 'text-sm w-full')}
                                placeholder={getPriceLabel(unit, isRaw ? 'raw_material' : saleType)}
                                aria-label={getPriceLabel(unit, isRaw ? 'raw_material' : saleType)}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />

                      <div className="text-right font-semibold text-base pt-2 border-t">
                        {t('sales.total')}: {lineTotal == null ? '—' : `${invoiceSymbol}${formatOrderNumeric(lineTotal)}`}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {summaryOpen ? (
          <Card className="w-full lg:w-80 flex-shrink-0 overflow-hidden flex flex-col">
            <div className={orderFormPanelHeader}>
              <h3 className={orderFormPanelTitle}>{t('sales.summary')}</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setSummaryOpen(false)}
                title={t('common.close', 'Close')}
                aria-label={t('common.close', 'Close')}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <CardContent className="p-4 space-y-3 flex-1">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">{t('sales.subtotal')}</span>
                  <span className="font-semibold tabular-nums">
                    {subtotalInCurrency == null
                      ? '—'
                      : `${invoiceSymbol}${formatOrderNumeric(subtotalInCurrency)}`}
                  </span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-600">
                      {t('sales.discount')} ({discount}%)
                    </span>
                    <span className="font-semibold text-red-600 tabular-nums">
                      {discountInCurrency == null
                        ? '—'
                        : `-${invoiceSymbol}${formatOrderNumeric(discountInCurrency)}`}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3 pt-2 border-t">
                  <span className="text-slate-700 font-medium">
                    {t('sales.grandTotal')}
                  </span>
                  <span className="font-bold text-primary text-base tabular-nums">
                    {invoiceSymbol}
                    {totalInCurrency == null ? '—' : formatOrderNumeric(totalInCurrency)}
                  </span>
                </div>
                {isUsd && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-600">{t('sales.afnEquivalent')}</span>
                    <span className="font-semibold tabular-nums">
                      {afnSymbol}
                      {formatOrderNumeric(totalAfn)}
                    </span>
                  </div>
                )}

                {isUsd && (
                  <>
                    <AfnReportingPreview
                      amount={totalAfn}
                      currencyId={currency}
                      atDate={saleDate}
                      amountIsAfn
                    />
                  </>
                )}
              </div>

              <FormField
                control={control}
                name="discount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-slate-700">
                      {t('sales.discountPercentage')} (%)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step={ORDER_NUMERIC_STEP}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="h-9 text-sm"
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium text-slate-700">
                      {t('sales.notes')}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder={t('sales.notesPlaceholder', 'Add notes...')}
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
                showSaveAndCreateNew={showSaveAndCreateNew}
                onIntent={onIntent}
              />
            </div>
          </Card>
        ) : (
          <div className="hidden lg:flex w-12 flex-shrink-0 flex-col items-center gap-3 sticky top-4 self-start">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto py-3 px-2 flex flex-col gap-1.5"
              onClick={() => setSummaryOpen(true)}
              title={t('sales.summary')}
              aria-label={t('sales.summary')}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-[10px] font-medium [writing-mode:vertical-rl] rotate-180">
                {t('sales.summary')}
              </span>
            </Button>
          </div>
        )}

        {!summaryOpen && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-sm shadow-lg px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 max-w-[1800px] mx-auto">
              <div className="text-sm">
                <span className="text-slate-600">{t('sales.grandTotal')}: </span>
                <span className="font-bold text-primary tabular-nums">
                  {invoiceSymbol}
                  {totalInCurrency == null ? '—' : formatOrderNumeric(totalInCurrency)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setSummaryOpen(true)}>
                  {t('sales.summary')}
                </Button>
                <FormActions
                  className="pt-0"
                  onCancel={onCancel}
                  loading={loading}
                  submitLabel={submitLabel}
                  loadingLabel={loadingLabel}
                  showSaveAndCreateNew={showSaveAndCreateNew}
                  onIntent={onIntent}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
