/** Display historical tank-volume sales as mass without changing their totals. */
type DisplayItem = {
  sale_source?: string; unit?: string; quantity?: unknown; liter_amount?: unknown;
  kilogram_amount?: unknown; sell_price?: unknown;
  storage_tank_details?: { density_kg_per_liter?: unknown } | null;
};
const num = (value: unknown) => Number(value) || 0;
export function saleDisplayUnit(item: DisplayItem): string {
  return item.sale_source === 'tank' || item.unit === 'liter' ? 'kg' : item.unit || 'piece';
}
export function saleDisplayQuantity(item: DisplayItem): number {
  if (item.sale_source === 'tank' || item.unit === 'liter') {
    if (num(item.kilogram_amount) > 0) return num(item.kilogram_amount);
    if (item.unit === 'kg') return num(item.quantity);
    return num(item.quantity ?? item.liter_amount) * (num(item.storage_tank_details?.density_kg_per_liter) || 1);
  }
  return num(item.quantity ?? item.liter_amount);
}
export function saleDisplayPrice(item: DisplayItem): number {
  if (item.unit === 'liter' || (item.sale_source === 'tank' && !item.unit)) {
    const quantity = num(item.quantity ?? item.liter_amount);
    const mass = saleDisplayQuantity(item);
    return mass > 0 && quantity > 0 ? num(item.sell_price) * quantity / mass : num(item.sell_price);
  }
  return num(item.sell_price);
}
