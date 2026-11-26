import { formatDecimalDisplay } from './decimalDisplay';
import { formatDisplayMoney } from './displayMoney';
import { FALLBACK_BASE_CODE } from '@/lib/currencies';

export {
  formatDisplayMoney,
  isAfnMoneyCode,
  roundDisplayMoney,
} from './displayMoney';

export function formatCurrency(amount: number, currency: string = FALLBACK_BASE_CODE): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

/** Section-report money: AFN whole (ceil); USD/others one decimal. */
export function formatReportMoney(num: number, currency?: string): string {
  return formatDisplayMoney(num, currency);
}

export function formatLiterAmount(amount: number): string {
  return `${formatDecimalDisplay(amount, 3)}L`;
}

export function formatTonAmount(amount: number): string {
  return `${formatDecimalDisplay(amount, 3)}T`;
}

/**
 * Generic price display (defaults to AFN rules).
 * Pass currency when the amount is USD / foreign.
 */
export function formatPrice(
  value: string | number | null | undefined,
  currency?: string | null,
): string {
  return formatDisplayMoney(value, currency ?? 'AFN');
}
