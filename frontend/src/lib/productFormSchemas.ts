import { z } from 'zod';
import { formMessages, requiredString } from '@/lib/formSchemas';

type TranslateFn = (key: string, fallback?: string) => string;

export type PackagingFormRow = {
  name: string;
  qty_in_base: string;
  barcode: string;
  for_purchase: boolean;
  for_sale: boolean;
  for_stock: boolean;
  is_base: boolean;
  is_default_purchase: boolean;
  is_default_sale: boolean;
  is_variable_weight: boolean;
};

export const defaultPackagingRow = (overrides: Partial<PackagingFormRow> = {}): PackagingFormRow => ({
  name: '',
  qty_in_base: '1',
  barcode: '',
  for_purchase: true,
  for_sale: true,
  for_stock: true,
  is_base: false,
  is_default_purchase: false,
  is_default_sale: false,
  is_variable_weight: false,
  ...overrides,
});

export const defaultBasePackaging = (): PackagingFormRow =>
  defaultPackagingRow({
    name: 'Base',
    qty_in_base: '1',
    is_base: true,
    is_default_sale: true,
    is_default_purchase: true,
  });

export const createProductFormSchema = (t: TranslateFn) => {
  const messages = formMessages(t);

  return z
    .object({
      name: requiredString(messages.required),
      sku: z.string().optional(),
      barcode: z.string().optional(),
      description: z.string().optional(),
      base_uom: requiredString(messages.required),
      brand: z.string().optional(),
      category: z.string().optional(),
      min_stock_level: z.string().optional(),
      reorder_level: z.string().optional(),
      track_inventory: z.boolean().default(true),
      track_batch: z.boolean().default(false),
      track_expiry: z.boolean().default(false),
      is_active: z.boolean().default(true),
      packagings: z.array(
        z.object({
          name: z.string(),
          qty_in_base: z.string(),
          barcode: z.string().optional(),
          for_purchase: z.boolean(),
          for_sale: z.boolean(),
          for_stock: z.boolean(),
          is_base: z.boolean(),
          is_default_purchase: z.boolean(),
          is_default_sale: z.boolean(),
          is_variable_weight: z.boolean(),
        }),
      ),
      image: z.instanceof(File).optional(),
    })
    .superRefine((data, ctx) => {
      const named = data.packagings.filter((p) => p.name.trim());
      if (named.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('products.packagingRequired', 'Add at least one packaging unit'),
          path: ['packagings'],
        });
      }

      const baseRows = named.filter((p) => p.is_base);
      if (baseRows.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('products.oneBaseRequired', 'Exactly one base packaging (qty = 1) is required'),
          path: ['packagings'],
        });
      }

      named.forEach((row, index) => {
        const qty = Number(row.qty_in_base);
        if (!row.name.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: messages.required,
            path: ['packagings', index, 'name'],
          });
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('products.qtyInBaseRequired', 'Enter qty in base units'),
            path: ['packagings', index, 'qty_in_base'],
          });
        }
        if (row.is_base && qty !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('products.baseQtyMustBeOne', 'Base packaging must equal 1 base unit'),
            path: ['packagings', index, 'qty_in_base'],
          });
        }
      });
    });
};

export type ProductFormValues = z.infer<ReturnType<typeof createProductFormSchema>>;

export const defaultProductFormValues = (): ProductFormValues => ({
  name: '',
  sku: '',
  barcode: '',
  description: '',
  base_uom: '',
  brand: '',
  category: '',
  min_stock_level: '0',
  reorder_level: '0',
  track_inventory: true,
  track_batch: false,
  track_expiry: false,
  is_active: true,
  packagings: [
    defaultPackagingRow({
      name: 'Base',
      qty_in_base: '1',
      is_base: true,
      is_default_sale: true,
      is_default_purchase: false,
    }),
    defaultPackagingRow({
      name: 'Carton',
      qty_in_base: '12',
      is_default_purchase: true,
    }),
  ],
  image: undefined,
});

export const productToFormValues = (product: any): ProductFormValues => {
  const packagings = (product.packagings || []).map((p: any) =>
    defaultPackagingRow({
      name: p.name || '',
      qty_in_base: String(p.qty_in_base ?? '1'),
      barcode: p.barcode || '',
      for_purchase: p.for_purchase !== false,
      for_sale: p.for_sale !== false,
      for_stock: p.for_stock !== false,
      is_base: Boolean(p.is_base),
      is_default_purchase: Boolean(p.is_default_purchase),
      is_default_sale: Boolean(p.is_default_sale),
      is_variable_weight: Boolean(p.is_variable_weight),
    }),
  );

  return {
    name: product.name || '',
    sku: product.sku || '',
    barcode: product.barcode || '',
    description: product.description || '',
    base_uom: product.base_uom ? String(product.base_uom) : '',
    brand: product.brand || '',
    category: product.category ? String(product.category) : '',
    min_stock_level: String(product.min_stock_level ?? '0'),
    reorder_level: String(product.reorder_level ?? '0'),
    track_inventory: product.track_inventory !== false,
    track_batch: Boolean(product.track_batch),
    track_expiry: Boolean(product.track_expiry),
    is_active: product.is_active !== false,
    packagings: packagings.length ? packagings : [defaultBasePackaging()],
    image: undefined,
  };
};

export const productFormToPayload = (data: ProductFormValues) => {
  const packagings_data = data.packagings
    .filter((p) => p.name.trim())
    .map((p, index) => ({
      name: p.name.trim(),
      qty_in_base: Number(p.qty_in_base) || 1,
      barcode: p.barcode?.trim() || null,
      for_purchase: p.for_purchase,
      for_sale: p.for_sale,
      for_stock: p.for_stock,
      is_base: p.is_base,
      is_default_purchase: p.is_default_purchase,
      is_default_sale: p.is_default_sale,
      is_variable_weight: p.is_variable_weight,
      sort_order: index,
      uom: p.is_base ? Number(data.base_uom) || null : null,
      is_active: true,
    }));

  // Ensure only one default purchase/sale
  const purchaseDefaults = packagings_data.filter((p) => p.is_default_purchase);
  if (purchaseDefaults.length === 0 && packagings_data.length) {
    packagings_data[0].is_default_purchase = true;
  } else if (purchaseDefaults.length > 1) {
    let seen = false;
    packagings_data.forEach((p) => {
      if (p.is_default_purchase) {
        if (seen) p.is_default_purchase = false;
        seen = true;
      }
    });
  }

  const saleDefaults = packagings_data.filter((p) => p.is_default_sale);
  if (saleDefaults.length === 0 && packagings_data.length) {
    const base = packagings_data.find((p) => p.is_base) || packagings_data[0];
    base.is_default_sale = true;
  } else if (saleDefaults.length > 1) {
    let seen = false;
    packagings_data.forEach((p) => {
      if (p.is_default_sale) {
        if (seen) p.is_default_sale = false;
        seen = true;
      }
    });
  }

  return {
    name: data.name.trim(),
    sku: data.sku?.trim() || null,
    barcode: data.barcode?.trim() || null,
    description: data.description || '',
    base_uom: Number(data.base_uom),
    brand: data.brand?.trim() || null,
    category: data.category ? Number(data.category) : null,
    min_stock_level: Number(data.min_stock_level) || 0,
    reorder_level: Number(data.reorder_level) || 0,
    track_inventory: data.track_inventory,
    track_batch: data.track_batch,
    track_expiry: data.track_expiry,
    is_active: data.is_active,
    packagings_data,
  };
};
