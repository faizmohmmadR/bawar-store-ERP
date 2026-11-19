/** Default cash-book method for every currency (AFN/USD/KDR/…). */
export const DEFAULT_PAYMENT_METHOD = 'cash' as const;

export type PaymentMethod = 'cash' | 'bank' | 'sarafi';

export const CASH_GL_ACCOUNT_CODE = '1000';
export const BANK_GL_ACCOUNT_CODE = '1050';
export const SARAFI_GL_ACCOUNT_CODE = '1060';

type CashBookAccount = {
  id?: number | string;
  code?: string;
};

/** Prefer cash (1000) for the selected currency, then bank, then sarafi. */
export function pickDefaultCashBookAccount(
  accounts: CashBookAccount[] | null | undefined,
): CashBookAccount | null {
  if (!accounts?.length) return null;
  const byCode = (code: string) => accounts.find((account) => String(account.code) === code);
  return (
    byCode(CASH_GL_ACCOUNT_CODE) ??
    byCode(BANK_GL_ACCOUNT_CODE) ??
    byCode(SARAFI_GL_ACCOUNT_CODE) ??
    accounts[0] ??
    null
  );
}
