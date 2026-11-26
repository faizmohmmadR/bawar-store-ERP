import { CurrencyDetails, FALLBACK_BASE_CODE, FALLBACK_BASE_SYMBOL, getCurrencyCode, getCurrencySymbol } from '@/lib/currencies';
import { formatDisplayMoney } from '@/lib/displayMoney';

type LoanCurrencySource = {
  currency_details?: CurrencyDetails | null;
};

export function getLoanCurrencySymbol(record: LoanCurrencySource | null | undefined): string {
  return getCurrencySymbol(record?.currency_details);
}

export function getLoanCurrencyCode(record: LoanCurrencySource | null | undefined): string {
  return getCurrencyCode(record?.currency_details);
}

export function formatLoanMoney(
  amount: number | string,
  record: LoanCurrencySource | null | undefined,
): string {
  const symbol = getLoanCurrencySymbol(record);
  const code = getLoanCurrencyCode(record);
  return `${symbol}${formatDisplayMoney(amount, code)}`;
}

export { FALLBACK_BASE_CODE, FALLBACK_BASE_SYMBOL };
