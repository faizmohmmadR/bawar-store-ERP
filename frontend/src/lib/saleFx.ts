import api from '@/api/client';

const USD_ID = 2;

export function isUsdCurrency(currencyId: string | number | null | undefined): boolean {
  return Number(currencyId) === USD_ID;
}

/** Lookup AFN-per-USD rate nearest to the sale date. Returns 1 for AFN. */
export async function fetchAfnPerUsdRate(
  currencyId: string | number | null | undefined,
  saleDate?: string | null,
): Promise<number> {
  if (!isUsdCurrency(currencyId)) return 1;

  const dateParam =
    saleDate && saleDate.length === 10
      ? `${saleDate}T12:00:00`
      : saleDate || undefined;

  const { data } = await api.get<{ rate?: number | string; error?: string }>(
    '/exchange-rates/lookup/',
    {
      params: {
        currency: USD_ID,
        ...(dateParam ? { date: dateParam } : {}),
      },
    },
  );

  const rate = Number(data?.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'No USD exchange rate found for this sale date.',
    );
  }
  return rate;
}

export function afnToUsd(
  afnAmount: number,
  afnPerUsd: number,
  decimalPlaces = 2,
): number {
  if (!afnPerUsd || afnPerUsd <= 0) return afnAmount;
  return Number((afnAmount / afnPerUsd).toFixed(decimalPlaces));
}

export function usdToAfn(usdAmount: number, afnPerUsd: number): number | null {
  if (!Number.isFinite(usdAmount) || !Number.isFinite(afnPerUsd) || afnPerUsd <= 0) {
    return null;
  }
  return Number((usdAmount * afnPerUsd).toFixed(4));
}
