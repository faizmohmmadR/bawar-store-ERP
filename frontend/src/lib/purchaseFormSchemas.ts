import { z } from 'zod';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';
import { roundOrderNumeric } from '@/lib/orderNumeric';
import type { Purchase } from '@/types/purchase';

type TranslateFn = (key: string, fallback?: string) => string;

export const defaultPurchaseItem = () => ({
  id: '',
  product: '',
  packaging: '',
  packaging_name: '',
  qty_in_base: 1,
  is_variable_weight: false,
  track_expiry: false,
  quantity: 0,
  measured_base_quantity: '' as string | number,
  price_per_unit: 0,
  profit_percent: 0,
  sale_price: 0,
  lot_number: '',
  expiry_date: '',
});

/** Sale price from cost and markup %. */
export const salePriceFromProfitPercent = (cost: number, profitPercent: number) =>
  roundOrderNumeric((Number(cost) || 0) * (1 + (Number(profitPercent) || 0) / 100));

/** Markup % from cost and sale price. */
export const profitPercentFromSalePrice = (cost: number, salePrice: number) => {
  const unitCost = Number(cost) || 0;
  if (unitCost <= 0) return 0;
  return roundOrderNumeric((((Number(salePrice) || 0) - unitCost) / unitCost) * 100);
};

export const createPurchaseFormSchema = (t: TranslateFn) => {
  const messages = formMessages(t);

  return z
    .object({
      vendor: requiredString(messages.required),
      warehouse: requiredString(messages.required),
      bill_number: z.string().optional(),
      purchase_date: requiredString(messages.required),
      currency: requiredString(messages.required),
      /** USD/KDR → AFN rate used to store stock costs in AFN. */
      exchange_rate: z.coerce.number().optional(),
      status: z.enum(['draft', 'pending', 'received', 'cancelled']),
      /** Default markup % for this purchase — drives sales price from buy price. */
      profit_percent: z.coerce.number().min(0, t('purchases.profitPercentMin', 'Profit % cannot be negative')),
      items: z.array(
        z.object({
          id: z.string().optional(),
          product: z.string(),
          packaging: z.string(),
          packaging_name: z.string().optional(),
          qty_in_base: z.coerce.number().optional(),
          is_variable_weight: z.boolean().optional(),
          track_expiry: z.boolean().optional(),
          quantity: z.coerce.number(),
          measured_base_quantity: z.union([z.string(), z.number()]).optional(),
          price_per_unit: z.coerce.number(),
          profit_percent: z.coerce.number().optional(),
          sale_price: z.coerce.number().optional(),
          lot_number: z.string().optional(),
          expiry_date: z.string().optional(),
        }),
      ),
      notes: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      const validItems = data.items.filter((item) => item.product && item.packaging);

      if (validItems.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('purchases.itemsRequired', 'At least one item is required'),
          path: ['items'],
        });
      }

      const currencyId = Number(data.currency) || 1;
      if (currencyId !== 1 && !(Number(data.exchange_rate) > 1)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t(
            'purchases.exchangeRateRequired',
            'Add a USD→AFN exchange rate in Settings before saving — stock must be stored in AFN.',
          ),
          path: ['currency'],
        });
      }

      data.items.forEach((item, index) => {
        if (!item.product) return;

        if (!item.packaging) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('purchases.selectPackaging', 'Select a purchase unit'),
            path: ['items', index, 'packaging'],
          });
        }

        if ((Number(item.quantity) || 0) <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('purchases.qtyRequired', 'Enter a quantity'),
            path: ['items', index, 'quantity'],
          });
        }

        if (item.is_variable_weight) {
          const measured = Number(item.measured_base_quantity);
          if (!measured || measured <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('purchases.measuredRequired', 'Enter measured base quantity'),
              path: ['items', index, 'measured_base_quantity'],
            });
          }
        }

        if (item.track_expiry && !(item.expiry_date || '').trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t(
              'purchases.expiryRequired',
              'Expiry date is required for products that track expiry',
            ),
            path: ['items', index, 'expiry_date'],
          });
        }

        if (item.price_per_unit <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.positive,
            path: ['items', index, 'price_per_unit'],
          });
        }

        if ((Number(item.sale_price) || 0) < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('purchases.salePriceMin', 'Sales price cannot be negative'),
            path: ['items', index, 'sale_price'],
          });
        }
      });
    });
};

export type PurchaseFormValues = z.infer<ReturnType<typeof createPurchaseFormSchema>>;

export const defaultPurchaseFormValues = (): PurchaseFormValues => ({
  vendor: '',
  warehouse: '',
  bill_number: '',
  purchase_date: new Date().toISOString().slice(0, 10),
  currency: '1',
  exchange_rate: 1,
  status: 'received',
  profit_percent: 0,
  items: [defaultPurchaseItem()],
  notes: '',
});

export const purchaseToFormValues = (purchase: Purchase): PurchaseFormValues => {
  const mappedItems = (purchase.items || []).map((item) => ({
    id: item.id?.toString(),
    product: String(item.product),
    packaging: String(item.packaging),
    packaging_name: item.packaging_details?.name || '',
    qty_in_base: Number(item.conversion_factor ?? item.packaging_details?.qty_in_base) || 1,
    is_variable_weight: Boolean(item.packaging_details?.is_variable_weight),
    track_expiry: Boolean(item.product_details?.track_expiry),
    quantity: Number(item.quantity) || 0,
    measured_base_quantity: item.measured_base_quantity ?? '',
    price_per_unit: Number(item.price_per_unit) || 0,
    profit_percent: Number(item.profit_percent) || 0,
    sale_price: Number(item.sale_price) || 0,
    lot_number: item.lot_number || '',
    expiry_date: item.expiry_date || '',
  }));

  const headerPercent =
    mappedItems.find((item) => (Number(item.profit_percent) || 0) > 0)?.profit_percent || 0;

  return {
    vendor: String(purchase.vendor || ''),
    warehouse: String(purchase.warehouse || ''),
    bill_number: purchase.bill_number || '',
    purchase_date: purchase.purchase_date ? purchase.purchase_date.slice(0, 10) : '',
    currency: resolveCurrencyId(purchase),
    exchange_rate: Number(purchase.exchange_rate) || 1,
    status: (purchase.status as PurchaseFormValues['status']) || 'received',
    profit_percent: Number(headerPercent) || 0,
    items: [defaultPurchaseItem(), ...mappedItems],
    notes: purchase.notes || '',
  };
};

export const calculatePurchaseSubtotal = (items: PurchaseFormValues['items']) =>
  roundOrderNumeric(
    items.reduce(
      (total, item) => total + (Number(item.quantity) || 0) * (Number(item.price_per_unit) || 0),
      0,
    ),
  );

export const calculatePurchaseTotal = (items: PurchaseFormValues['items']) =>
  calculatePurchaseSubtotal(items);

const toPurchaseDateTime = (dateValue: string) => {
  if (!dateValue) return dateValue;
  if (dateValue.includes('T')) return dateValue;
  return `${dateValue}T12:00:00`;
};

const mapItemPayload = (item: PurchaseFormValues['items'][number], withId = false) => {
  const measured = item.measured_base_quantity === '' || item.measured_base_quantity == null
    ? null
    : Number(item.measured_base_quantity);
  const cost = roundOrderNumeric(Number(item.price_per_unit) || 0);
  let profitPercent = roundOrderNumeric(Number(item.profit_percent) || 0);
  let salePrice = roundOrderNumeric(Number(item.sale_price) || 0);
  if (cost > 0 && profitPercent > 0 && salePrice <= 0) {
    salePrice = salePriceFromProfitPercent(cost, profitPercent);
  } else if (cost > 0 && salePrice > 0 && profitPercent <= 0) {
    profitPercent = profitPercentFromSalePrice(cost, salePrice);
  }

  const payload: Record<string, unknown> = {
    product: Number(item.product),
    packaging: Number(item.packaging),
    quantity: roundOrderNumeric(Number(item.quantity)),
    conversion_factor: Number(item.qty_in_base) || 1,
    price_per_unit: cost,
    profit_percent: profitPercent,
    sale_price: salePrice,
    measured_base_quantity: measured && measured > 0 ? measured : null,
    lot_number: item.lot_number || null,
    expiry_date: item.expiry_date || null,
  };
  if (withId && item.id) payload.id = Number(item.id);
  return payload;
};

export const purchaseFormToAddPayload = (data: PurchaseFormValues) => {
  const headerPercent = roundOrderNumeric(Number(data.profit_percent) || 0);
  const validItems = data.items.filter((item) => item.product && item.packaging);

  const currencyId = toCurrencyFkId(data.currency);
  const exchangeRate = Number(data.exchange_rate) || 0;

  return {
    transaction_type: 'paid',
    vendor: Number(data.vendor),
    warehouse: Number(data.warehouse),
    bill_number: data.bill_number || null,
    purchase_date: toPurchaseDateTime(data.purchase_date),
    currency: currencyId,
    // Always send rate so stock never stores USD amounts as AFN at rate=1.
    exchange_rate: currencyId === 1 ? 1 : exchangeRate,
    status: data.status || 'received',
    notes: data.notes || '',
    items: validItems.map((item) => {
      const cost = roundOrderNumeric(Number(item.price_per_unit) || 0);
      const linePercent = roundOrderNumeric(Number(item.profit_percent) || 0) || headerPercent;
      const sale =
        roundOrderNumeric(Number(item.sale_price) || 0)
        || (cost > 0 && linePercent > 0 ? salePriceFromProfitPercent(cost, linePercent) : 0);
      return mapItemPayload({
        ...item,
        profit_percent: linePercent,
        sale_price: sale,
      });
    }),
  };
};

export const purchaseFormToUpdatePayload = (data: PurchaseFormValues) => {
  const payload = purchaseFormToAddPayload(data);
  return {
    ...payload,
    items: data.items
      .filter((item) => item.product && item.packaging)
      .map((item) => mapItemPayload(item, true)),
  };
};
