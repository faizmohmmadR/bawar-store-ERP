export interface CurrencyFinanceBucket {
  currency?: string;
  total_debit: number;
  total_credit: number;
  balance: number;
}

export type ContactFinance = Record<string, CurrencyFinanceBucket>;

export function getFinanceBucket(
  finance: ContactFinance | null | undefined,
  code: string,
): CurrencyFinanceBucket | undefined {
  if (!finance || !code) return undefined;
  return (
    finance[code]
    || finance[code.toUpperCase()]
    || finance[code.toLowerCase()]
  );
}

export function getFinanceCurrencyCodes(finance?: ContactFinance | null): string[] {
  if (!finance) return [];
  return Object.keys(finance)
    .filter((key) => key !== 'overall')
    .map((key) => key.toUpperCase())
    .sort();
}

export function filterFinanceByCurrency(
  finance: ContactFinance | null | undefined,
  currency: string | null | undefined,
): ContactFinance | null {
  if (!finance) return null;
  if (!currency || currency === 'all') return finance;
  const bucket = getFinanceBucket(finance, currency);
  if (!bucket) return {};
  const code = (bucket.currency || currency).toUpperCase();
  return { [code]: { ...bucket, currency: code } };
}

export function hasOutstandingBalance(finance?: ContactFinance | null): boolean {
  return getFinanceCurrencyCodes(finance).some(
    (code) => Math.abs(Number(getFinanceBucket(finance, code)?.balance || 0)) > 0.001,
  );
}

export function formatFinanceBalances(
  finance?: ContactFinance | null,
): { code: string; balance: number }[] {
  return getFinanceCurrencyCodes(finance).map((code) => ({
    code: (getFinanceBucket(finance, code)?.currency || code).toUpperCase(),
    balance: Number(getFinanceBucket(finance, code)?.balance || 0),
  }));
}
