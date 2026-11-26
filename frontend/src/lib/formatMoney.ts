import { formatDisplayMoney } from '@/lib/displayMoney';
import { resolveCurrencySymbol } from '@/lib/currencyChoices';

/** Format an AFN amount with the base currency symbol (whole afghanis, rounded up). */
export function formatAfn(value: number | string | null | undefined): string {
  const symbol = resolveCurrencySymbol(1) || 'AFN';
  return `${formatDisplayMoney(value, 'AFN')} ${symbol}`;
}
