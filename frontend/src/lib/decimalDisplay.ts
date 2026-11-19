/** Display decimals without padding; calculations and input values retain their precision. */
export function formatDecimalDisplay(value: unknown, maximumFractionDigits = 4): string {
  const amount = Number(value);
  const rounded = Number((Number.isFinite(amount) ? amount : 0).toFixed(maximumFractionDigits));
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(rounded === 0 ? 0 : rounded);
}
