import { formatOrderNumeric } from '@/lib/orderNumeric';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';

/** Format an AFN amount with the base currency symbol. */
export function formatAfn(value: number | string | null | undefined): string {
  const n = Number(value || 0);
  const symbol = resolveCurrencySymbol(1) || 'AFN';
  return `${formatOrderNumeric(n)} ${symbol}`;
}
