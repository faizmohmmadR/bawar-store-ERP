/**
 * Static currency helpers — all data comes from STATIC_CURRENCIES, no API calls.
 */
import { STATIC_CURRENCIES, resolveStaticSymbol, type StaticCurrency } from '@/components/forms/CurrencySelect';

export type CurrencyOption = StaticCurrency;

export function getBaseCurrency(): CurrencyOption {
  return STATIC_CURRENCIES.find((c) => c.is_base)!;
}

export function getCurrencyById(
  id: string | number | null | undefined,
): CurrencyOption | undefined {
  if (id === null || id === undefined || id === '') return undefined;
  return STATIC_CURRENCIES.find((c) => c.id.toString() === id.toString());
}

export function toCurrencyFilterOptions(): { value: string; label: string }[] {
  return STATIC_CURRENCIES.map((c) => ({
    value: c.id.toString(),
    label: `${c.code} - ${c.name}`,
  }));
}

export function resolveCurrencySymbol(
  currencyId: string | number | null | undefined,
): string {
  return resolveStaticSymbol(currencyId);
}
