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
  quantity: 0,
  measured_base_quantity: '' as string | number,
  price_per_unit: 0,
  lot_number: '',
  expiry_date: '',
});

export const createPurchaseFormSchema = (t: TranslateFn) => {
  const messages = formMessages(t);

  return z
    .object({
      vendor: requiredString(messages.required),
      warehouse: requiredString(messages.required),
      bill_number: z.string().optional(),
      purchase_date: requiredString(messages.required),
      currency: requiredString(messages.required),
      status: z.enum(['draft', 'pending', 'received', 'cancelled']),
      items: z.array(
        z.object({
          id: z.string().optional(),
          product: z.string(),
          packaging: z.string(),
          packaging_name: z.string().optional(),
          qty_in_base: z.coerce.number().optional(),
          is_variable_weight: z.boolean().optional(),
          quantity: z.coerce.number(),
          measured_base_quantity: z.union([z.string(), z.number()]).optional(),
          price_per_unit: z.coerce.number(),
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

        if (item.price_per_unit <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.positive,
            path: ['items', index, 'price_per_unit'],
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
  status: 'received',
  items: [defaultPurchaseItem()],
  notes: '',
});

export const purchaseToFormValues = (purchase: Purchase): PurchaseFormValues => ({
  vendor: String(purchase.vendor || ''),
  warehouse: String(purchase.warehouse || ''),
  bill_number: purchase.bill_number || '',
  purchase_date: purchase.purchase_date ? purchase.purchase_date.slice(0, 10) : '',
  currency: resolveCurrencyId(purchase),
  status: (purchase.status as PurchaseFormValues['status']) || 'received',
  items: [
    defaultPurchaseItem(),
    ...(purchase.items || []).map((item) => ({
      id: item.id?.toString(),
      product: String(item.product),
      packaging: String(item.packaging),
      packaging_name: item.packaging_details?.name || '',
      qty_in_base: Number(item.conversion_factor ?? item.packaging_details?.qty_in_base) || 1,
      is_variable_weight: Boolean(item.packaging_details?.is_variable_weight),
      quantity: Number(item.quantity) || 0,
      measured_base_quantity: item.measured_base_quantity ?? '',
      price_per_unit: Number(item.price_per_unit) || 0,
      lot_number: item.lot_number || '',
      expiry_date: item.expiry_date || '',
    })),
  ],
  notes: purchase.notes || '',
});

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
  const payload: Record<string, unknown> = {
    product: Number(item.product),
    packaging: Number(item.packaging),
    quantity: roundOrderNumeric(Number(item.quantity)),
    conversion_factor: Number(item.qty_in_base) || 1,
    price_per_unit: roundOrderNumeric(Number(item.price_per_unit) || 0),
    measured_base_quantity: measured && measured > 0 ? measured : null,
    lot_number: item.lot_number || null,
    expiry_date: item.expiry_date || null,
  };
  if (withId && item.id) payload.id = Number(item.id);
  return payload;
};

export const purchaseFormToAddPayload = (data: PurchaseFormValues) => {
  const validItems = data.items.filter((item) => item.product && item.packaging);

  return {
    transaction_type: 'paid',
    vendor: Number(data.vendor),
    warehouse: Number(data.warehouse),
    bill_number: data.bill_number || null,
    purchase_date: toPurchaseDateTime(data.purchase_date),
    currency: toCurrencyFkId(data.currency),
    status: data.status || 'received',
    notes: data.notes || '',
    items: validItems.map((item) => mapItemPayload(item)),
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
