import type { CurrencyDetails } from '@/lib/currencies';

export type GlReportRow = {
  gl_account_id: number | null;
  code: string;
  name: string;
  category: string;
  total_debit: number | string;
  total_credit: number | string;
  balance: number | string;
  amount?: number | string;
};

export type TrialBalanceResponse = {
  rows: GlReportRow[];
  totals: {
    total_debit: number | string;
    total_credit: number | string;
    difference: number | string;
    is_balanced: boolean;
  };
  mode?: 'native' | 'base';
  amount_kind?: string;
  amount_kind_label?: string;
  expects_balance?: boolean;
  balance_note?: string | null;
  currency?: number;
  currency_details?: CurrencyDetails | null;
  base_currency?: CurrencyDetails | null;
  period?: { start_date: string | null; end_date: string | null };
};

export type IncomeStatementResponse = {
  revenue: number | string;
  expenses: number | string;
  cogs?: number | string;
  gross_profit: number | string;
  net_income: number | string;
  revenue_accounts: GlReportRow[];
  cogs_accounts?: GlReportRow[];
  expense_accounts: GlReportRow[];
  mode?: 'native' | 'base';
  amount_kind?: string;
  amount_kind_label?: string;
  expects_balance?: boolean;
  balance_note?: string | null;
  totals?: {
    total_debit?: number | string;
    total_credit?: number | string;
    difference?: number | string;
    is_balanced?: boolean;
  };
  currency?: number;
  currency_details?: CurrencyDetails | null;
  base_currency?: CurrencyDetails | null;
  period?: { start_date: string | null; end_date: string | null };
};

export type BalanceSheetResponse = {
  assets: GlReportRow[];
  liabilities: GlReportRow[];
  equity_accounts: GlReportRow[];
  net_income: number | string;
  total_assets: number | string;
  total_liabilities: number | string;
  total_equity: number | string;
  total_liabilities_and_equity: number | string;
  is_balanced: boolean;
  difference: number | string;
  mode?: 'native' | 'base';
  amount_kind?: string;
  amount_kind_label?: string;
  expects_balance?: boolean;
  balance_note?: string | null;
  currency?: number;
  currency_details?: CurrencyDetails | null;
  base_currency?: CurrencyDetails | null;
  period?: { start_date: string | null; end_date: string | null };
};
