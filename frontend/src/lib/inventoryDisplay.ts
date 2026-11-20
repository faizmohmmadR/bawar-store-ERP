import { formatOrderNumeric } from '@/lib/orderNumeric';
import type { PackagingBreakdownRow } from '@/types/inventory';

export function baseUomLabel(product?: {
  base_uom_details?: { symbol?: string | null; name?: string | null } | null;
} | null): string {
  return product?.base_uom_details?.symbol || product?.base_uom_details?.name || '';
}

export function formatPackagingBreakdown(
  rows?: PackagingBreakdownRow[] | null,
  emptyLabel = '—',
): string {
  if (!rows?.length) return emptyLabel;
  return rows
    .map((row) => {
      const count = formatOrderNumeric(Number(row.count) || 0);
      if (row.name === 'remainder') return `${count} base`;
      return `${count} ${row.name}`;
    })
    .join(' · ');
}

export function stockValue(quantity: number | string | undefined, averageCost: number | string | undefined) {
  return (Number(quantity) || 0) * (Number(averageCost) || 0);
}
