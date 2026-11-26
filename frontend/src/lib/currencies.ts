import { formatDisplayMoney } from './displayMoney';

/** Reporting base currency fallbacks when API data is unavailable. */
export const FALLBACK_BASE_CODE = 'AFN';
export const FALLBACK_BASE_SYMBOL = '؋';

export type CurrencyDetails = {
  id?: number;
  code?: string;
  name?: string;
  symbol?: string;
  is_base?: boolean;
  is_active?: boolean;
};

export function getCurrencySymbol(currency?: CurrencyDetails | null): string {
  return currency?.symbol || FALLBACK_BASE_SYMBOL;
}

export function getCurrencyCode(currency?: CurrencyDetails | null): string {
  return currency?.code || FALLBACK_BASE_CODE;
}

export function formatCurrencyAmount(
  amount: number | string | null | undefined,
  currency?: CurrencyDetails | null,
  options?: { showCode?: boolean; decimals?: number; prefixSign?: '+' | '-' },
): string {
  const code = getCurrencyCode(currency);
  // Currency-aware display: AFN whole (ceil), USD one decimal.
  // `decimals` is ignored for list/report display so callers stay consistent.
  void options?.decimals;
  const formatted = formatDisplayMoney(amount, code);
  const symbol = getCurrencySymbol(currency);
  const sign = options?.prefixSign ?? '';
  const base = `${sign}${symbol}${formatted}`;
  if (options?.showCode) {
    return `${base} ${code}`;
  }
  return base;
}

type CurrencyRecord = {
  currency?: number | string | { id?: number } | null;
  currency_details?: CurrencyDetails | null;
};

/** Resolve currency id from API record for form selects. */
export function resolveCurrencyId(record: CurrencyRecord): string {
  if (record.currency_details?.id != null) {
    return String(record.currency_details.id);
  }
  const currency = record.currency;
  if (currency != null && typeof currency === 'object' && currency.id != null) {
    return String(currency.id);
  }
  if (currency != null && currency !== '') {
    return String(currency);
  }
  return '';
}

/** Convert form value to Currency FK id for API payloads. */
export function toCurrencyFkId(
  value: string | number | null | undefined,
): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}
