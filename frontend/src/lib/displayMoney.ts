/**
 * Shared list/report money display rules:
 * - AFN: round up away from zero, no decimals
 * - USD / other foreign: exactly one decimal (xxx.x)
 */

export function isAfnMoneyCode(currency?: string | null): boolean {
  const code = String(currency || '').trim().toUpperCase();
  return !code || code === 'AFN';
}

export function roundDisplayMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
): number {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  if (Math.abs(safe) < 1e-12) return 0;
  if (isAfnMoneyCode(currency)) {
    return Math.sign(safe) * Math.ceil(Math.abs(safe) - 1e-12);
  }
  return Math.round(safe * 10) / 10;
}

const afnMoneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const foreignMoneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatDisplayMoney(
  amount: number | string | null | undefined,
  currency?: string | null,
): string {
  const rounded = roundDisplayMoney(amount, currency);
  if (isAfnMoneyCode(currency)) {
    return afnMoneyFormatter.format(rounded);
  }
  return foreignMoneyFormatter.format(rounded);
}
