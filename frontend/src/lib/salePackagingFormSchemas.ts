import { z } from 'zod';
import { formMessages, requiredString } from '@/lib/formSchemas';
import { resolveCurrencyId, toCurrencyFkId } from '@/lib/currencies';
import { roundOrderNumeric } from '@/lib/orderNumeric';
import type { Sale } from '@/types/sale';

type TranslateFn = (key: string, fallback?: string) => string;

export const defaultSalePackagingItem = () => ({
  id: '',
  product: '',
  packaging: '',
  packaging_name: '',
  qty_in_base: 1,
  quantity: 0,
  sell_price: 0,
});

export const createSalePackagingFormSchema = (t: TranslateFn) => {
  const messages = formMessages(t);

  return z
    .object({
      customer: z.string().optional(),
      warehouse: requiredString(messages.required),
      bill_no: z.string().optional(),
      sale_date: requiredString(messages.required),
      currency: requiredString(messages.required),
      status: z.enum(['draft', 'confirmed', 'shipped', 'delivered', 'invoiced', 'cancelled']),
      discount: z.coerce.number().min(0).max(100).default(0),
      items: z.array(
        z.object({
          id: z.string().optional(),
          product: z.string(),
          packaging: z.string(),
          packaging_name: z.string().optional(),
          qty_in_base: z.coerce.number().optional(),
          quantity: z.coerce.number(),
          sell_price: z.coerce.number(),
        }),
      ),
      notes: z.string().optional(),
      plate_number: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      const validItems = data.items.filter((item) => item.product && item.packaging);
      if (validItems.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('sales.itemsRequired', 'At least one item is required'),
          path: ['items'],
        });
      }

      data.items.forEach((item, index) => {
        if (!item.product) return;
        if (!item.packaging) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('sales.selectPackaging', 'Select a sale unit'),
            path: ['items', index, 'packaging'],
          });
        }
        if ((Number(item.quantity) || 0) <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('sales.qtyRequired', 'Enter a quantity'),
            path: ['items', index, 'quantity'],
          });
        }
        if ((Number(item.sell_price) || 0) <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.positive,
            path: ['items', index, 'sell_price'],
          });
        }
      });
    });
};

export type SalePackagingFormValues = z.infer<ReturnType<typeof createSalePackagingFormSchema>>;

export const defaultSalePackagingFormValues = (): SalePackagingFormValues => ({
  customer: '',
  warehouse: '',
  bill_no: '',
  sale_date: new Date().toISOString().slice(0, 10),
  currency: '1',
  status: 'confirmed',
  discount: 0,
  items: [defaultSalePackagingItem()],
  notes: '',
  plate_number: '',
});

export const saleToPackagingFormValues = (sale: Sale): SalePackagingFormValues => {
  const lines = sale.sales_items || sale.items || [];
  return {
    customer: sale.customer ? String(sale.customer) : '',
    warehouse: String((sale as { warehouse?: number }).warehouse || ''),
    bill_no: sale.bill_no || '',
    sale_date: sale.sale_date ? String(sale.sale_date).slice(0, 10) : '',
    currency: resolveCurrencyId(sale),
    status: (sale.status as SalePackagingFormValues['status']) || 'confirmed',
    discount: Number(sale.discount_percentage) || 0,
    items: [
      defaultSalePackagingItem(),
      ...lines.map((item: any) => ({
        id: item.id?.toString(),
        product: String(item.product || item.product_details?.id || ''),
        packaging: String(item.packaging || item.packaging_details?.id || ''),
        packaging_name: item.packaging_details?.name || '',
        qty_in_base: Number(item.conversion_factor ?? item.packaging_details?.qty_in_base) || 1,
        quantity: Number(item.quantity) || 0,
        sell_price: Number(item.sell_price) || 0,
      })),
    ],
    notes: sale.notes || '',
    plate_number: sale.plate_number || '',
  };
};

export const calculateSaleSubtotal = (items: SalePackagingFormValues['items']) =>
  roundOrderNumeric(
    items.reduce(
      (total, item) => total + (Number(item.quantity) || 0) * (Number(item.sell_price) || 0),
      0,
    ),
  );

export const calculateSaleTotal = (
  items: SalePackagingFormValues['items'],
  discountPercent = 0,
) => {
  const subtotal = calculateSaleSubtotal(items);
  const discount = roundOrderNumeric(subtotal * (Number(discountPercent) || 0) / 100);
  return roundOrderNumeric(subtotal - discount);
};

const toSaleDateTime = (dateValue: string) => {
  if (!dateValue) return dateValue;
  if (dateValue.includes('T')) return dateValue;
  return `${dateValue}T12:00:00`;
};

const mapItemPayload = (item: SalePackagingFormValues['items'][number]) => ({
  product: Number(item.product),
  packaging: Number(item.packaging),
  quantity: roundOrderNumeric(Number(item.quantity)),
  conversion_factor: Number(item.qty_in_base) || 1,
  sell_price: roundOrderNumeric(Number(item.sell_price) || 0),
});

export const salePackagingFormToPayload = (data: SalePackagingFormValues) => {
  const validItems = data.items.filter((item) => item.product && item.packaging);
  const total = calculateSaleTotal(validItems, data.discount);

  return {
    transaction_type: 'paid',
    customer: data.customer ? Number(data.customer) : null,
    vendor: null,
    employee: null,
    warehouse: Number(data.warehouse),
    bill_no: data.bill_no || null,
    sale_date: toSaleDateTime(data.sale_date),
    currency: toCurrencyFkId(data.currency),
    status: data.status || 'confirmed',
    discount_percentage: Number(data.discount) || 0,
    total_amount: roundOrderNumeric(total),
    notes: data.notes || '',
    plate_number: data.plate_number || null,
    sales_items: validItems.map((item) => mapItemPayload(item)),
  };
};
