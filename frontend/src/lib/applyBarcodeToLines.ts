import type { ResolvedBarcode } from '@/lib/resolveBarcode';

export type BarcodeLineRef = {
  product?: string;
  packaging?: string;
  quantity?: number;
};

export type ApplyBarcodeResult =
  | { action: 'increment'; index: number; quantity: number }
  | { action: 'fill'; index: number }
  | { action: 'insert'; index: number };

/**
 * Find an existing line with the same product+packaging (increment),
 * else fill the first empty product slot, else insert at `insertAt`.
 */
export function planBarcodeLineApply(
  items: BarcodeLineRef[],
  resolved: ResolvedBarcode,
  insertAt = 1,
): ApplyBarcodeResult {
  const productId = String(resolved.product.id);
  const packagingId = String(resolved.packaging.id);

  const existingIndex = items.findIndex(
    (row) =>
      row.product?.toString() === productId
      && row.packaging?.toString() === packagingId,
  );
  if (existingIndex >= 0) {
    return {
      action: 'increment',
      index: existingIndex,
      quantity: (Number(items[existingIndex]?.quantity) || 0) + 1,
    };
  }

  const emptyIndex = items.findIndex((row) => !row.product);
  if (emptyIndex >= 0) {
    return { action: 'fill', index: emptyIndex };
  }

  return { action: 'insert', index: Math.min(Math.max(insertAt, 0), items.length) };
}

export function barcodeUnitPrice(resolved: ResolvedBarcode, mode: 'sale' | 'purchase'): number {
  if (mode === 'sale') {
    return Number(resolved.retail_price ?? resolved.price ?? 0) || 0;
  }
  return Number(resolved.wholesale_price ?? resolved.price ?? 0) || 0;
}
