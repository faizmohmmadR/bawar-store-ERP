import { formatDecimalDisplay } from './decimalDisplay';
import { FALLBACK_BASE_CODE } from '@/lib/currencies';

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

const reportForeignMoneyFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Section-report money: AFN → whole afghanis; USD/others → up to 2 decimals. */
export function formatReportMoney(num: number, currency?: string): string {
  const amount = Number(num);
  const safe = Number.isFinite(amount) ? amount : 0;
  const code = (currency || '').toUpperCase();
  if (code === 'AFN' || !code) {
    return formatNumber(Math.round(safe));
  }
  return reportForeignMoneyFormatter.format(Math.round(safe * 100) / 100);
}

export function formatLiterAmount(amount: number): string {
  return `${formatDecimalDisplay(amount, 3)}L`;
}

export function formatTonAmount(amount: number): string {
  return `${formatDecimalDisplay(amount, 3)}T`;
}

const priceFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Round displayed monetary amounts only; keep calculation and input precision. */
export function formatPrice(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0);
  return priceFormatter.format(Number.isFinite(amount) ? amount : 0);
}
