import { z } from 'zod';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { toCurrencyFkId } from '@/lib/currencies';
import { roundOrderNumeric } from '@/lib/orderNumeric';
import {
  DEFAULT_PIECES_PER_CARTON,
  cartonsFromPieces,
  totalPiecesFromCartonsAndLoose,
} from '@/lib/packaging';
import type { Sale, SaleItem, SaleSource } from '@/types/sale';

type TranslateFn = (key: string, fallback?: string) => string;

export {
  DEFAULT_PIECES_PER_CARTON,
  cartonsFromPieces,
};

export type SaleUnit = 'carton' | 'bottle' | 'plastic' | 'dana' | 'liter' | 'kg' | 'piece';

/** Bottle / plastic / dana / piece all sell one finished/raw piece. */
export const isPieceSaleUnit = (unit?: string | null) =>
  ['bottle', 'plastic', 'dana', 'piece', 'pieces'].includes(String(unit || '').toLowerCase());

export const normalizeStockSaleUnit = (unit?: string | null): SaleUnit => {
  const value = String(unit || 'carton').toLowerCase();
  if (value === 'liter') return 'liter';
  if (value === 'kg') return 'kg';
  if (value === 'plastic') return 'plastic';
  if (value === 'piece') return 'piece';
  if (isPieceSaleUnit(value)) return value === 'dana' ? 'bottle' : (value as SaleUnit);
  return 'carton';
};

/** Total pieces for a packed-stock sale line (cartons × N + loose pieces). */
export const saleLineDana = (
  item: {
    carton_amount?: number;
    piece_amount?: number;
    bottles_per_carton?: number;
    sale_source?: SaleSource;
    liter_amount?: number;
    kilogram_amount?: number;
    density_kg_per_liter?: number;
    bottle_capacity_liters?: number;
    unit?: SaleUnit | string;
  },
  piecesPerCarton: number = Number(item.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON,
) => {
  if (item.sale_source === 'tank') {
    return item.unit === 'kg'
      ? Number(item.kilogram_amount) || 0
      : Number(item.liter_amount) || 0;
  }
  if (item.sale_source === 'raw_material') {
    return item.unit === 'kg'
      ? Number(item.kilogram_amount) || 0
      : Number(item.piece_amount) || 0;
  }
  if (item.unit === 'kg') {
    const kgPerBottle = (
      Number(item.density_kg_per_liter) || 0
    ) * (Number(item.bottle_capacity_liters) || 0);
    return kgPerBottle > 0
      ? (Number(item.kilogram_amount) || 0) / kgPerBottle
      : 0;
  }
  return totalPiecesFromCartonsAndLoose(
    Number(item.carton_amount) || 0,
    Number(item.piece_amount) || 0,
    piecesPerCarton,
  );
};

/**
 * Billable quantity in the selected sale unit (same basis as sell price).
 * - carton: cartons (+ loose pieces as fraction)
 * - bottle/plastic/dana: pieces
 * - liter / tank: liters
 * - kg: kilograms
 */
export const saleLineUnitQty = (item: {
  carton_amount?: number;
  piece_amount?: number;
  liter_amount?: number;
  kilogram_amount?: number;
  density_kg_per_liter?: number;
  bottle_capacity_liters?: number;
  unit?: SaleUnit | string;
  sale_source?: SaleSource;
  bottles_per_carton?: number;
}) => {
  if (item.unit === 'kg') {
    return Number(item.kilogram_amount) || 0;
  }
  if (item.sale_source === 'tank' || item.unit === 'liter') {
    return Number(item.liter_amount) || 0;
  }
  if (item.sale_source === 'raw_material' || item.unit === 'piece') {
    return Number(item.piece_amount) || 0;
  }

  const piecesPerCarton = Number(item.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON;
  const totalPieces = totalPiecesFromCartonsAndLoose(
    Number(item.carton_amount) || 0,
    Number(item.piece_amount) || 0,
    piecesPerCarton,
  );
  const unit = normalizeStockSaleUnit(item.unit);
  if (isPieceSaleUnit(unit)) {
    return totalPieces;
  }
  if (totalPieces <= 0 || piecesPerCarton <= 0) return 0;
  return totalPieces / piecesPerCarton;
};

/**
 * Line total:
 * - carton: pieces/N × price_per_carton
 * - bottle/plastic/dana: pieces × price_per_piece
 * - liter / tank: liters × price_per_liter
 */
export const saleLineTotal = (item: {
  carton_amount?: number;
  piece_amount?: number;
  liter_amount?: number;
  kilogram_amount?: number;
  sell_price?: number;
  unit?: SaleUnit | string;
  sale_source?: SaleSource;
  bottles_per_carton?: number;
}) => {
  const price = Number(item.sell_price) || 0;
  const qty = saleLineUnitQty(item);
  return qty > 0 && price > 0 ? qty * price : 0;
};

export const defaultSaleItem = (): {
  id: string;
  sale_source: SaleSource;
  stock: string;
  storage_tank: string;
  raw_material_stock: string;
  unit: SaleUnit;
  carton_amount: number;
  piece_amount: number;
  liter_amount: number;
  kilogram_amount: number;
  piece_count: number;
  density_kg_per_liter: number;
  bottle_capacity_liters: number;
  sell_price: number;
  bottles_per_carton: number;
  raw_material_unit: 'kg' | 'piece';
  raw_weight_per_piece_kg?: number;
  stock_material_type?: string;
} => ({
  id: '',
  sale_source: 'stock',
  stock: '',
  storage_tank: '',
  raw_material_stock: '',
  unit: 'carton',
  carton_amount: 0,
  piece_amount: 0,
  liter_amount: 0,
  kilogram_amount: 0,
  piece_count: 0,
  density_kg_per_liter: 0,
  bottle_capacity_liters: 0,
  sell_price: 0,
  bottles_per_carton: DEFAULT_PIECES_PER_CARTON,
  raw_material_unit: 'piece',
  raw_weight_per_piece_kg: 0,
  stock_material_type: '',
});

export const createSaleFormSchema = (t: TranslateFn) => {
  const messages = formMessages(t);

  return z
    .object({
      transaction_type: z.enum(['paid', 'free']).default('paid'),
      party_type: z.enum(['customer', 'vendor', 'employee']).default('customer'),
      vendor: z.string().trim().default(''),
      vendor_transaction: z.enum(['sale', 'purchase_return']).default('sale'),
      customer: z.string().trim().default(''),
      employee: z.string().trim().default(''),
      currency: requiredString(t('sales.selectCurrency', 'Select a currency')),
      sale_date: requiredString(t('rawMaterialSales.dateRequired', 'Select a sale date')),
      sale_type: z.enum(['stock', 'tank', 'raw_material']).default('stock'),
      discount: z.coerce.number().min(0).default(0),
      notes: z.string().optional(),
      items: z.array(
        z.object({
          id: z.string().optional(),
          sale_source: z.enum(['stock', 'tank', 'raw_material']).default('stock'),
          stock: z.string().default(''),
          storage_tank: z.string().default(''),
          raw_material_stock: z.string().default(''),
          unit: z.enum(['carton', 'bottle', 'plastic', 'dana', 'liter', 'kg', 'piece']).default('carton'),
          carton_amount: z.coerce.number().default(0),
          piece_amount: z.coerce.number().default(0),
          liter_amount: z.coerce.number().default(0),
          kilogram_amount: z.coerce.number().default(0),
          piece_count: z.coerce.number().int().min(0).default(0),
          density_kg_per_liter: z.coerce.number().default(0),
          bottle_capacity_liters: z.coerce.number().default(0),
          sell_price: z.coerce.number().default(0),
          bottles_per_carton: z.coerce.number().min(0).default(DEFAULT_PIECES_PER_CARTON),
          raw_material_unit: z.enum(['kg', 'piece']).default('piece'),
          raw_weight_per_piece_kg: z.coerce.number().optional(),
          stock_material_type: z.string().default(''),
        }),
      ),
    })
    .superRefine((data, ctx) => {
      const saleType = data.sale_type || 'stock';
      if (data.party_type === 'vendor') {
        if (!data.vendor) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('rawMaterialPurchases.selectVendor', 'Select a vendor'), path: ['vendor'] });
        }
      } else if (data.party_type === 'employee') {
        if (!data.employee) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('sales.selectEmployee', 'Select an employee'), path: ['employee'] });
        }
        if (data.transaction_type === 'free') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('sales.employeeSaleMustBePaid', 'Employee sales settle salary and must be paid (not free).'),
            path: ['transaction_type'],
          });
        }
      }
      // party_type customer with empty customer = walk-in cash sale (auto-paid)
      if (data.party_type === 'vendor' && saleType !== 'raw_material') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Vendor transactions must use raw-material stock.', path: ['party_type'] });
      if (data.party_type === 'vendor' && data.vendor_transaction === 'purchase_return' && data.transaction_type === 'free') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Purchase returns require a value.', path: ['transaction_type'] });
      const isEmptyLine = (item: (typeof data.items)[number]) => {
        const hasIdentity = item.sale_source === 'tank'
          ? Boolean(item.storage_tank)
          : item.sale_source === 'raw_material'
            ? Boolean(item.raw_material_stock)
            : Boolean(item.stock);
        const hasQty = item.unit === 'kg'
          ? (Number(item.kilogram_amount) || 0) > 0
          : item.sale_source === 'tank'
            ? (Number(item.liter_amount) || 0) > 0
            : item.sale_source === 'raw_material'
              ? (Number(item.piece_amount) || 0) > 0 || (Number(item.kilogram_amount) || 0) > 0
              : (Number(item.carton_amount) || 0) > 0 || (Number(item.piece_amount) || 0) > 0;
        return !hasIdentity && !hasQty && !(Number(item.sell_price) > 0);
      };

      data.items.forEach((item, index) => {
        // Keep the top empty "select" row from blocking save.
        if (isEmptyLine(item)) return;
        const source = item.sale_source || 'stock';
        // Stock/tank create forms no longer mix RM lines; existing RM lines on a
        // stock sale (added after save) are still allowed so edit/re-save works.
        const allowed =
          source === saleType
          || (saleType === 'stock' && source === 'raw_material' && Boolean(item.id))
          || (saleType === 'raw_material' && source === 'raw_material');
        if (!allowed) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('sales.saleTypeMismatch', 'All items must match the sale type'),
            path: ['items', index, 'sale_source'],
          });
        }
      });

      const validItems = data.items.filter((item) => {
        if (isEmptyLine(item)) return false;
        if (item.sale_source === 'tank') return Boolean(item.storage_tank);
        if (item.sale_source === 'raw_material') return Boolean(item.raw_material_stock);
        return Boolean(item.stock);
      });
      if (validItems.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('sales.itemsRequired'),
          path: ['items'],
        });
      }

      data.items.forEach((item, index) => {
        if (isEmptyLine(item)) return;

        const isTank = item.sale_source === 'tank';
        const isRaw = item.sale_source === 'raw_material';
        const cartons = Number(item.carton_amount) || 0;
        const pieces = Number(item.piece_amount) || 0;
        const liters = Number(item.liter_amount) || 0;
        const kilograms = Number(item.kilogram_amount) || 0;
        const hasQty = item.unit === 'kg'
          ? kilograms > 0
          : isTank
            ? liters > 0
            : isRaw
              ? pieces > 0 || kilograms > 0
              : cartons > 0 || pieces > 0;
        const hasIdentity = isTank
          ? Boolean(item.storage_tank)
          : isRaw
            ? Boolean(item.raw_material_stock)
            : Boolean(item.stock);

        if (isRaw && item.unit === 'piece' && pieces !== Math.trunc(pieces)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('sales.wholePieces', 'Enter whole pieces'), path: ['items', index, 'piece_amount'] });
        }
        if (isRaw && item.unit === 'kg' && item.raw_material_unit === 'piece' && !(Number(item.raw_weight_per_piece_kg) > 0)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: t('rawMaterialSales.setPieceWeight', 'Set piece weight in raw materials to sell this item in kg.'), path: ['items', index, 'unit'] });
        }
        if (!hasIdentity) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: isTank ? t('sales.selectTank', 'Select a storage tank') : isRaw ? t('sales.selectRawMaterial', 'Select a raw material') : t('sales.selectProduct', 'Select a product'),
            path: ['items', index, isTank ? 'storage_tank' : isRaw ? 'raw_material_stock' : 'stock'],
          });
        }
        if (!hasQty) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('sales.qtyRequired', 'Enter quantity'),
            path: [
              'items',
              index,
              isTank
                ? item.unit === 'kg' ? 'kilogram_amount' : 'liter_amount'
                : isRaw
                  ? item.unit === 'kg' ? 'kilogram_amount' : 'piece_amount'
                  : item.unit === 'kg'
                    ? 'kilogram_amount'
                    : isPieceSaleUnit(item.unit)
                      ? 'piece_amount'
                      : 'carton_amount',
            ],
          });
        }
        if (
          item.unit === 'kg'
          && !isRaw
          && (
            !(Number(item.density_kg_per_liter) > 0)
            || (!isTank && !(Number(item.bottle_capacity_liters) > 0))
          )
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('sales.kgConversionUnavailable', 'A valid product density and bottle capacity are required for kilogram sales'),
            path: ['items', index, isTank ? 'storage_tank' : 'stock'],
          });
        }
        if (data.transaction_type !== 'free' && item.sell_price <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.positive,
            path: ['items', index, 'sell_price'],
          });
        }
      });
    });
};

export type SaleFormValues = z.infer<ReturnType<typeof createSaleFormSchema>>;

export const defaultSaleItemForType = (saleType: SaleSource = 'stock') => {
  const item = defaultSaleItem();
  if (saleType === 'tank') {
    return {
      ...item,
      sale_source: 'tank' as const,
      unit: 'kg' as const,
    };
  }
  if (saleType === 'raw_material') {
    return {
      ...item,
      sale_source: 'raw_material' as const,
      unit: 'piece' as const,
      raw_material_unit: 'piece' as const,
    };
  }
  return item;
};

const localDateTimeString = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

export const defaultSaleFormValues = (): SaleFormValues => ({
  transaction_type: 'paid',
  party_type: 'customer', vendor: '', vendor_transaction: 'sale',
  customer: '',
  employee: '',
  currency: '1',
  sale_date: localDateTimeString(),
  sale_type: 'stock',
  discount: 0,
  notes: '',
  items: [defaultSaleItemForType('stock')],
});

export const saleToFormValues = (sale: Sale): SaleFormValues => {
  const saleItems = sale.items || sale.sales_items || [];
  const sources = saleItems.map((item) => String(item.sale_source || 'stock').toLowerCase());
  const inferredType: SaleSource =
    sources.length > 0 && sources.every((source) => source === 'tank')
      ? 'tank'
      : sources.length > 0 && sources.every((source) => source === 'raw_material')
        ? 'raw_material'
        : 'stock';

  // Form values remain in AFN; USD invoices are displayed using the saved rate.
  const saleCurrencyId = sale.currency_details?.id ?? sale.currency;
  const currencyId = Number(saleCurrencyId) || 1;
  const fxRate = Number(sale.exchange_rate) || 1;
  const toAfnPrice = (price: number | string | undefined) => {
    const n = Number(price) || 0;
    if (currencyId === 2 && fxRate > 0) return roundOrderNumeric(n * fxRate);
    return n;
  };

  return {
    transaction_type: sale.transaction_type || 'paid',
    party_type: sale.vendor ? 'vendor' : sale.employee ? 'employee' : 'customer',
    vendor: sale.vendor?.toString() || '',
    vendor_transaction: sale.vendor_transaction || 'sale',
    customer: sale.customer_details?.id?.toString() || sale.customer?.toString() || '',
    employee: sale.employee_details?.id?.toString() || sale.employee?.toString() || '',
    currency: String(saleCurrencyId || ''),
    sale_date: sale.sale_date ? sale.sale_date.slice(0, 16) : '',
    sale_type: inferredType,
    discount:
      sale.discount_percentage || sale.discount_amount
        ? parseFloat(String(sale.discount_percentage || sale.discount_amount))
        : 0,
    notes: sale.notes || '',
    items:
      saleItems.length > 0
        ? saleItems.map((item: SaleItem) => {
            const rawSource = String(item.sale_source || '').toLowerCase();
            const source: SaleSource =
              rawSource === 'tank'
                ? 'tank'
                : rawSource === 'raw_material'
                  ? 'raw_material'
                  : 'stock';
            if (source === 'tank') {
              const unit = normalizeStockSaleUnit(item.unit || 'liter');
              const density = Number(item.storage_tank_details?.density_kg_per_liter) || 0;
              const quantity = Number(item.quantity) || 0;
              const liters = Number(item.liter_amount)
                || (unit === 'kg' && density > 0 ? quantity / density : quantity);
              const kilograms = Number(item.kilogram_amount)
                || (unit === 'kg' ? quantity : liters * density);
              return {
                id: item.id?.toString(),
                sale_source: 'tank' as const,
                stock: '',
                storage_tank:
                  item.storage_tank_details?.id?.toString()
                  || item.storage_tank?.toString()
                  || '',
                raw_material_stock: '',
                unit: 'kg' as const,
                carton_amount: 0,
                piece_amount: 0,
                liter_amount: liters,
                kilogram_amount: kilograms,
                piece_count: 0,
                density_kg_per_liter: density,
                bottle_capacity_liters: 0,
                sell_price: toAfnPrice(item.sell_price) / (unit === 'kg' ? 1 : (liters > 0 && kilograms > 0 ? kilograms / liters : density || 1)),
                bottles_per_carton: DEFAULT_PIECES_PER_CARTON,
                raw_material_unit: 'piece' as const,
              };
            }

            if (source === 'raw_material') {
              const rmUnit = String(item.raw_material_stock_details?.unit || item.unit || 'piece');
              const isKg = item.unit === 'kg';
              const quantity = Number(item.quantity) || 0;
              return {
                id: item.id?.toString(),
                sale_source: 'raw_material' as const,
                stock: '',
                storage_tank: '',
                raw_material_stock:
                  item.raw_material_stock_details?.id?.toString()
                  || item.raw_material_stock?.toString()
                  || '',
                unit: isKg ? 'kg' as const : 'piece' as const,
                carton_amount: 0,
                piece_amount: isKg ? 0 : quantity,
                liter_amount: 0,
                kilogram_amount: isKg ? quantity : 0,
                piece_count: rmUnit === 'piece' && isKg ? Number(item.liter_amount) || 0 : Number(item.piece_count) || 0,
                density_kg_per_liter: 0,
                bottle_capacity_liters: 0,
                sell_price: toAfnPrice(item.sell_price),
                bottles_per_carton: DEFAULT_PIECES_PER_CARTON,
                raw_weight_per_piece_kg: isKg && rmUnit === 'piece' && Number(item.liter_amount) > 0
                  ? quantity / Number(item.liter_amount)
                  : !isKg && rmUnit === 'kg' && quantity > 0 ? Number(item.kilogram_amount) / quantity
                  : Number(item.raw_material_stock_details?.weight_per_piece_kg)
                    || (rmUnit === 'kg' && Number(item.raw_material_stock_details?.piece_count) > 0 ? Number(item.raw_material_stock_details?.quantity) / Number(item.raw_material_stock_details?.piece_count) : 0),
                raw_material_unit: rmUnit === 'kg' ? 'kg' as const : 'piece' as const,
              };
            }

            const rate = Number(item.stock_details?.product_details?.bottles_per_carton)
              || Number(item.product_details?.bottles_per_carton)
              || DEFAULT_PIECES_PER_CARTON;
            const unit = normalizeStockSaleUnit(item.unit);
            const qty = parseFloat(String(item.quantity ?? 0)) || 0;
            const liter = parseFloat(String(item.liter_amount ?? 0)) || 0;
            const density = Number(item.stock_details?.product_details?.density_kg_per_liter) || 0;
            const bottleCapacity = (Number(item.stock_details?.product_details?.bottle_capacity_kg) / (density || 1)) || Number(item.stock_details?.product_details?.bottle_capacity_liters) || 0;
            const kilograms = Number(item.kilogram_amount)
              || (unit === 'kg' ? qty : liter * density * bottleCapacity);
            const totalPieces =
              liter > 0
                ? liter
                : unit === 'kg'
                  ? density > 0 && bottleCapacity > 0
                    ? kilograms / (density * bottleCapacity)
                    : 0
                  : unit === 'carton'
                  ? qty * rate
                  : qty;

            if (unit === 'kg') {
              return {
                id: item.id?.toString(),
                sale_source: 'stock' as const,
                stock: item.stock_details?.id?.toString() || item.stock?.toString() || '',
                storage_tank: '',
                raw_material_stock: '',
                unit: 'kg' as const,
                carton_amount: 0,
                piece_amount: 0,
                liter_amount: 0,
                kilogram_amount: kilograms,
                piece_count: 0,
                density_kg_per_liter: density,
                bottle_capacity_liters: bottleCapacity,
                sell_price: toAfnPrice(item.sell_price),
                bottles_per_carton: rate,
                stock_material_type: item.stock_details?.product_details?.material_type || item.product_details?.material_type || '',
                raw_material_unit: 'piece' as const,
              };
            }

            if (isPieceSaleUnit(unit)) {
              return {
                id: item.id?.toString(),
                sale_source: 'stock' as const,
                stock: item.stock_details?.id?.toString() || item.stock?.toString() || '',
                storage_tank: '',
                raw_material_stock: '',
                unit,
                carton_amount: 0,
                piece_amount: totalPieces,
                liter_amount: 0,
                kilogram_amount: 0,
                piece_count: 0,
                density_kg_per_liter: density,
                bottle_capacity_liters: bottleCapacity,
                sell_price: toAfnPrice(item.sell_price),
                bottles_per_carton: rate,
                stock_material_type: item.stock_details?.product_details?.material_type || item.product_details?.material_type || '',
                raw_material_unit: 'piece' as const,
              };
            }

            return {
              id: item.id?.toString(),
              sale_source: 'stock' as const,
              stock: item.stock_details?.id?.toString() || item.stock?.toString() || '',
              storage_tank: '',
              raw_material_stock: '',
              unit: 'carton' as const,
              carton_amount: rate > 0 ? totalPieces / rate : 0,
              piece_amount: 0,
              liter_amount: 0,
              kilogram_amount: 0,
              piece_count: 0,
              density_kg_per_liter: density,
              bottle_capacity_liters: bottleCapacity,
              sell_price: toAfnPrice(item.sell_price),
              bottles_per_carton: rate,
              stock_material_type: item.stock_details?.product_details?.material_type || item.product_details?.material_type || '',
              raw_material_unit: 'piece' as const,
            };
          })
        : [defaultSaleItemForType(inferredType)],
  };
};

export const calculateSaleSubtotal = (items: SaleFormValues['items']) =>
  roundOrderNumeric(items.reduce((total, item) => total + saleLineTotal(item), 0));

export const calculateSaleTotal = (items: SaleFormValues['items'], discount: number) => {
  const subtotal = calculateSaleSubtotal(items);
  return roundOrderNumeric(subtotal - (subtotal * (discount || 0)) / 100);
};

const mapSaleItemPayload = (
  item: SaleFormValues['items'][number],
  withId = false,
  /** Divide AFN sell prices by this rate to store USD line prices. */
  afnPerUsd: number = 1,
) => {
  const sellPriceAfn = Number(item.sell_price) || 0;
  const sellPrice =
    afnPerUsd > 0 && afnPerUsd !== 1
      ? roundOrderNumeric(sellPriceAfn / afnPerUsd)
      : roundOrderNumeric(sellPriceAfn);

  if (item.sale_source === 'tank') {
    const unit = item.unit === 'kg' ? 'kg' : 'liter';
    const kilograms = roundOrderNumeric(Number(item.kilogram_amount) || 0);
    const density = Number(item.density_kg_per_liter) || 0;
    const liters = roundOrderNumeric(
      unit === 'kg'
        ? (density > 0 ? kilograms / density : 0)
        : Number(item.liter_amount) || 0,
    );
    const payload: Record<string, unknown> = {
      sale_source: 'tank',
      storage_tank: parseInt(item.storage_tank),
      stock: null,
      raw_material_stock: null,
      piece_count: 0,
      unit,
      quantity: unit === 'kg' ? kilograms : liters,
      liter_amount: liters,
      kilogram_amount: unit === 'kg'
        ? kilograms
        : roundOrderNumeric(liters * density),
      sell_price: sellPrice,
    };
    if (withId && item.id) payload.id = parseInt(item.id);
    return payload;
  }

  if (item.sale_source === 'raw_material') {
    const isKg = item.unit === 'kg';
    const kilograms = roundOrderNumeric(Number(item.kilogram_amount) || 0);
    const pieces = roundOrderNumeric(Number(item.piece_amount) || 0);
    const payload: Record<string, unknown> = {
      sale_source: 'raw_material',
      raw_material_stock: parseInt(item.raw_material_stock, 10),
      stock: null,
      storage_tank: null,
      unit: isKg ? 'kg' : 'piece',
      quantity: isKg ? kilograms : pieces,
      liter_amount: isKg ? 0 : pieces,
      kilogram_amount: isKg ? kilograms : 0,
      piece_count: isKg && item.raw_material_unit === 'kg' ? Math.max(0, Math.trunc(Number(item.piece_count) || 0)) : 0,
      sell_price: sellPrice,
    };
    if (withId && item.id) payload.id = parseInt(item.id);
    return payload;
  }

  const unit = normalizeStockSaleUnit(item.unit);
  const rate = Number(item.bottles_per_carton) || DEFAULT_PIECES_PER_CARTON;
  const totalPieces = roundOrderNumeric(saleLineDana(item));
  const quantity = unit === 'kg'
    ? roundOrderNumeric(Number(item.kilogram_amount) || 0)
    : unit === 'carton'
    ? roundOrderNumeric(
        (Number(item.carton_amount) || 0) +
        (Number(item.piece_amount) || 0) / rate,
      )
    : totalPieces;

  const payload: Record<string, unknown> = {
    sale_source: 'stock',
    stock: parseInt(item.stock),
    storage_tank: null,
    raw_material_stock: null,
    piece_count: 0,
    unit,
    quantity,
    liter_amount: totalPieces,
    kilogram_amount: unit === 'kg'
      ? roundOrderNumeric(Number(item.kilogram_amount) || 0)
      : roundOrderNumeric(
          totalPieces
          * (Number(item.bottle_capacity_liters) || 0)
          * (Number(item.density_kg_per_liter) || 0),
        ),
    sell_price: sellPrice,
  };
  if (withId && item.id) payload.id = parseInt(item.id);
  return payload;
};

const normalizeItemsForSaleType = (data: SaleFormValues) => {
  const saleType = data.sale_type || 'stock';
  return data.items.map((item) => {
    if (saleType === 'raw_material') {
      return { ...item, sale_source: 'raw_material' as const };
    }
    if (saleType === 'tank') {
      return { ...item, sale_source: 'tank' as const };
    }
    // Stock sales may mix packed products with raw-material lines.
    if (item.sale_source === 'raw_material') {
      return { ...item, sale_source: 'raw_material' as const };
    }
    return { ...item, sale_source: 'stock' as const };
  });
};

export type SalePayloadFxOptions = {
  /** AFN per 1 USD. When currency is USD, line prices and total are converted AFN → USD. */
  afnPerUsd?: number;
  /** Payroll period calendar for employee salary settlements (matches employee balance filters). */
  periodCalendar?: 'gregorian' | 'jalali' | 'hijri';
};

const buildSalePayload = (
  data: SaleFormValues,
  opts: SalePayloadFxOptions & { withItemIds?: boolean; status?: string } = {},
) => {
  const items = normalizeItemsForSaleType(data).map(item => data.transaction_type === 'free' ? { ...item, sell_price: 0 } : item);
  const validItems = items.filter((item) => {
    if (item.sale_source === 'tank') return Boolean(item.storage_tank);
    if (item.sale_source === 'raw_material') return Boolean(item.raw_material_stock);
    return Boolean(item.stock);
  });
  const currencyId = Number(toCurrencyFkId(data.currency)) || 1;
  const afnPerUsd = Number(opts.afnPerUsd) || 1;
  const isUsd = currencyId === 2;
  const currencyItems = isUsd && afnPerUsd > 0
    ? items.map((item) => ({
        ...item,
        sell_price: roundOrderNumeric((Number(item.sell_price) || 0) / afnPerUsd),
      }))
    : items;
  const total = calculateSaleTotal(currencyItems, data.discount);

  const isRawMaterialSale = (data.sale_type || 'stock') === 'raw_material';

  return {
    transaction_type: data.transaction_type || 'paid',
    customer: data.party_type === 'customer' && data.customer ? data.customer : null,
    vendor: data.party_type === 'vendor' ? Number(data.vendor) : null,
    employee: data.party_type === 'employee' ? Number(data.employee) : null,
    vendor_transaction: data.party_type === 'vendor' ? data.vendor_transaction : 'sale',
    currency: toCurrencyFkId(data.currency),
    sale_date: data.sale_date,
    notes: data.notes || '',
    discount_percentage: data.transaction_type === 'free' ? 0 : data.discount || 0,
    total_amount: total,
    sales_items: validItems.map((item) =>
      mapSaleItemPayload(item, Boolean(opts.withItemIds), isUsd ? afnPerUsd : 1),
    ),
    ...(opts.status ? { status: opts.status } : {}),
    ...(data.party_type === 'employee' && opts.periodCalendar
      ? { period_calendar: opts.periodCalendar }
      : {}),
  };
};

export const saleFormToAddPayload = (
  data: SaleFormValues,
  fx: SalePayloadFxOptions = {},
) => buildSalePayload(data, { ...fx, status: 'confirmed' });

export const saleFormToUpdatePayload = (
  data: SaleFormValues,
  fx: SalePayloadFxOptions = {},
) => buildSalePayload(data, { ...fx, withItemIds: true });
