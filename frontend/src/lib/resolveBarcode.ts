import api from '@/api/client';

export type ResolvedBarcodePackaging = {
  id: number;
  name: string;
  qty_in_base?: number | string;
  barcode?: string | null;
  is_base?: boolean;
  for_sale?: boolean;
  for_purchase?: boolean;
  is_default_sale?: boolean;
  is_default_purchase?: boolean;
  is_variable_weight?: boolean;
  is_active?: boolean;
};

export type ResolvedBarcodeProduct = {
  id: number;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  track_expiry?: boolean;
  packagings?: ResolvedBarcodePackaging[];
};

export type ResolvedBarcode = {
  code: string;
  product: ResolvedBarcodeProduct;
  packaging: ResolvedBarcodePackaging;
  price?: number | string | null;
  retail_price?: number | string | null;
  wholesale_price?: number | string | null;
};

/** Exact barcode lookup (packaging → alias → product). Returns null when not found. */
export async function resolveBarcode(code: string): Promise<ResolvedBarcode | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  try {
    const { data } = await api.get<ResolvedBarcode>('stock-movements/resolve-barcode/', {
      params: { code: trimmed },
    });
    if (!data?.product?.id || !data?.packaging?.id) return null;
    return { ...data, code: data.code || trimmed };
  } catch {
    return null;
  }
}

/** Heuristic: scanners send dense codes without spaces; typing names usually has letters+spaces. */
export function looksLikeBarcode(value: string): boolean {
  const code = value.trim();
  if (code.length < 4) return false;
  // Prefer numeric / alphanumeric SKU-like tokens without spaces
  if (/\s/.test(code)) return false;
  return /^[0-9A-Za-z\-_.]{4,64}$/.test(code);
}
