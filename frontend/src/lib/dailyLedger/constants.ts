export const DAILY_LEDGER_SECTION_OPTIONS = [
  { value: 'all', labelKey: 'accounts.dailyLedgerAllSections' },
  { value: 'sales', labelKey: 'reports.sales' },
  { value: 'returns', labelKey: 'reports.returns' },
  { value: 'return_refunds', labelKey: 'accounts.dailyLedgerReturnRefunds' },
  { value: 'sales_payments', labelKey: 'accounts.dailyLedgerSalesPayments' },
  { value: 'purchases', labelKey: 'reports.purchases' },
  { value: 'purchase_payments', labelKey: 'accounts.dailyLedgerPurchasePayments' },
  { value: 'expenses', labelKey: 'reports.expenses' },
  { value: 'withdrawals', labelKey: 'accounts.dailyLedgerWithdrawals' },
  { value: 'payroll', labelKey: 'reports.payroll' },
  { value: 'advances', labelKey: 'reports.advances' },
  { value: 'commission_payments', labelKey: 'accounts.dailyLedgerCommissionPayments' },
  { value: 'loans_given', labelKey: 'reports.loansGiven' },
  { value: 'loans_received', labelKey: 'reports.loansReceived' },
  { value: 'loan_collections', labelKey: 'accounts.dailyLedgerLoanCollections' },
  { value: 'loan_repayments', labelKey: 'accounts.dailyLedgerLoanRepayments' },
  { value: 'equipment', labelKey: 'accounts.dailyLedgerEquipment' },
  { value: 'currency_exchanges', labelKey: 'accounts.dailyLedgerCurrencyExchanges' },
  { value: 'production', labelKey: 'accounts.dailyLedgerProduction' },
] as const;

export const DAILY_LEDGER_ENDPOINT = 'daily-ledger';

/** Business day-book (all money sections). Journal GL lines remain available via ?source=journal. */
export const DAILY_LEDGER_SOURCE = 'operational';

export type DailyLedgerPeriodMode = 'daily' | 'range';
