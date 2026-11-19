import { z } from 'zod';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';
import { roundOrderNumeric } from '@/lib/orderNumeric';
import type { RawMaterialPurchase } from '@/types/raw-material';

type TranslateFn = (key: string, fallback?: string) => string;

export const defaultRawMaterialItem = () => ({
  id: '',
  raw_material: '',
  raw_material_type: '',
  raw_material_category: '',
  raw_material_unit: 'kg' as const,
  quantity: 0,
  piece_count: 0,
  price_per_unit: 0,
});

export const createRawMaterialPurchaseFormSchema = (t: TranslateFn) => {
  const messages = formMessages(t);

  return z
    .object({
      transaction_type: z.enum(['paid', 'free']).default('paid'),
      vendor: requiredString(messages.required),
      bill_number: z.string().optional(),
      purchase_date: requiredString(messages.required),
      currency: requiredString(messages.required),
      status: z.enum(['draft', 'pending', 'received', 'cancelled']),
      items: z.array(
        z.object({
          id: z.string().optional(),
          raw_material: z.string(),
          raw_material_type: z.string().optional(),
          raw_material_category: z.string().optional(),
          raw_material_unit: z.enum(['kg', 'piece']).optional(),
          quantity: z.coerce.number(),
          piece_count: z.coerce.number().int().min(0).default(0),
          price_per_unit: z.coerce.number(),
        }),
      ),
      notes: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      const validItems = data.items.filter((item) => item.raw_material).map(item => data.transaction_type === 'free' ? { ...item, price_per_unit: 0 } : item);
      if (validItems.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('rawMaterialPurchases.itemsRequired', 'At least one item is required'),
          path: ['items'],
        });
      }

      data.items.forEach((item, index) => {
        if (!item.raw_material) return;

        const duplicateIndex = data.items.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex < index && candidate.raw_material === item.raw_material,
        );
        if (duplicateIndex >= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t(
              'rawMaterialPurchases.duplicateRawMaterial',
              'A raw material can only be added once per purchase.',
            ),
            path: ['items', index, 'raw_material'],
          });
          return;
        }

        if ((Number(item.quantity) || 0) <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('rawMaterialPurchases.qtyRequired', 'Enter a quantity'),
            path: ['items', index, 'quantity'],
          });
        }
        if (data.transaction_type !== 'free' && item.price_per_unit <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.positive,
            path: ['items', index, 'price_per_unit'],
          });
        }
      });
    });
};

export type RawMaterialPurchaseFormValues = z.infer<
  ReturnType<typeof createRawMaterialPurchaseFormSchema>
>;

export const defaultRawMaterialPurchaseFormValues = (): RawMaterialPurchaseFormValues => ({
  transaction_type: 'paid',
  vendor: '',
  bill_number: '',
  purchase_date: new Date().toISOString().slice(0, 10),
  currency: '2',
  status: 'received',
  items: [defaultRawMaterialItem()],
  notes: '',
});

export const rawMaterialPurchaseToFormValues = (
  purchase: RawMaterialPurchase,
): RawMaterialPurchaseFormValues => {
  const vendorId = purchase.vendor;
  const purchaseItems = purchase.items || [];

  return {
    transaction_type: purchase.transaction_type || 'paid',
    vendor: vendorId.toString(),
    bill_number: purchase.bill_number || '',
    purchase_date: purchase.purchase_date ? purchase.purchase_date.slice(0, 10) : '',
    currency: resolveCurrencyId(purchase),
    status: purchase.status || 'received',
    items: [
      defaultRawMaterialItem(),
      ...purchaseItems.map((item) => ({
        id: item.id?.toString(),
        raw_material: item.raw_material.toString(),
        raw_material_type: item.raw_material_details?.material_type || '',
        raw_material_category: item.raw_material_details?.category ? String(item.raw_material_details.category) : '',
        raw_material_unit: item.raw_material_details?.unit === 'piece' ? 'piece' as const : 'kg' as const,
        quantity: Number(item.quantity) || 0,
        piece_count: Number(item.piece_count) || 0,
        price_per_unit: Number(item.price_per_unit) || 0,
      })),
    ],
    notes: purchase.notes || '',
  };
};

export const calculateRawMaterialPurchaseSubtotal = (items: RawMaterialPurchaseFormValues['items']) =>
  roundOrderNumeric(items.reduce((total, item) => total + (Number(item.quantity) || 0) * (Number(item.price_per_unit) || 0), 0));

export const calculateRawMaterialPurchaseTotal = (
  items: RawMaterialPurchaseFormValues['items'],
) => calculateRawMaterialPurchaseSubtotal(items);

const mapRawMaterialItemPayload = (
  item: RawMaterialPurchaseFormValues['items'][number],
  withId = false,
) => {
  const payload: Record<string, unknown> = {
    raw_material: withId ? parseInt(item.raw_material) : item.raw_material,
    quantity: roundOrderNumeric(Number(item.quantity)),
    piece_count: item.raw_material_unit === 'kg' ? Math.max(0, Math.trunc(Number(item.piece_count) || 0)) : 0,
    price_per_unit: roundOrderNumeric(item.price_per_unit),
  };
  if (withId && item.id) payload.id = parseInt(item.id);
  return payload;
};

const toPurchaseDateTime = (dateValue: string) => {
  if (!dateValue) return dateValue;
  if (dateValue.includes('T')) return dateValue;
  return `${dateValue}T12:00:00`;
};

export const rawMaterialPurchaseFormToAddPayload = (data: RawMaterialPurchaseFormValues) => {
  const validItems = data.items.filter((item) => item.raw_material).map(item => data.transaction_type === 'free' ? { ...item, price_per_unit: 0 } : item);
  const total = calculateRawMaterialPurchaseTotal(validItems);

  return {
    transaction_type: data.transaction_type || 'paid',
    vendor: data.vendor,
    bill_number: data.bill_number,
    purchase_date: toPurchaseDateTime(data.purchase_date),
    currency: toCurrencyFkId(data.currency),
    status: data.status || 'received',
    total_amount: roundOrderNumeric(total),
    notes: data.notes || '',
    purchase_items: validItems.map((item) => mapRawMaterialItemPayload(item)),
  };
};

export const rawMaterialPurchaseFormToUpdatePayload = (data: RawMaterialPurchaseFormValues) => {
  const validItems = data.items.filter((item) => item.raw_material).map(item => data.transaction_type === 'free' ? { ...item, price_per_unit: 0 } : item);
  const total = calculateRawMaterialPurchaseTotal(validItems);

  return {
    transaction_type: data.transaction_type || 'paid',
    vendor: parseInt(data.vendor),
    bill_number: data.bill_number,
    purchase_date: toPurchaseDateTime(data.purchase_date),
    currency: toCurrencyFkId(data.currency),
    status: data.status,
    total_amount: roundOrderNumeric(total),
    notes: data.notes || '',
    purchase_items: validItems.map((item) => mapRawMaterialItemPayload(item, true)),
  };
};
