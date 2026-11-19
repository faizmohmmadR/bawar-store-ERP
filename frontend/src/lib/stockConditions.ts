export const STOCK_CONDITIONS = [
  { value: 'good', labelKey: 'stock.condition.good', fallback: 'Good' },
  { value: 'damaged', labelKey: 'stock.condition.damaged', fallback: 'Damaged' },
  { value: 'waste', labelKey: 'stock.condition.waste', fallback: 'Waste' },
] as const;

export type StockCondition = (typeof STOCK_CONDITIONS)[number]['value'];

export const DEFAULT_STOCK_CONDITION: StockCondition = 'good';

export function stockConditionLabel(
  condition: string | undefined | null,
  t?: (key: string, fallback?: string) => string,
): string {
  const value = (condition || DEFAULT_STOCK_CONDITION) as StockCondition;
  const entry = STOCK_CONDITIONS.find((c) => c.value === value) || STOCK_CONDITIONS[0];
  if (t) return t(entry.labelKey, entry.fallback);
  return entry.fallback;
}
