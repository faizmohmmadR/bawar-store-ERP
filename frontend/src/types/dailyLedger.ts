export type DailyLedgerDirection = 'in' | 'out' | 'neutral';

export interface DailyLedgerRow {
  id: string;
  section: string;
  section_label?: string;
  record_type: string;
  record_type_label: string;
  entry_date: string;
  reference_number?: string;
  description?: string;
  amount: number;
  amount_base: number;
  native_amount?: number;
  afn_equivalent?: number;
  exchange_rate?: string | null;
  account?: string;
  account_code?: string;
  account_name?: string;
  branch_name?: string;
  side?: 'debit' | 'credit';
  debit?: number;
  credit?: number;
  currency: string;
  contact_name?: string;
  status?: string;
  direction?: DailyLedgerDirection;
  source_path?: string;
  is_cash_in?: boolean;
  is_cash_out?: boolean;
}

export interface DailyLedgerSectionSummary {
  section: string;
  label: string;
  count: number;
  amount_base: number;
  is_cash_movement?: boolean;
}

export interface DailyLedgerCurrencySummary {
  currency: string;
  count: number;
  cash_in: number;
  cash_out: number;
}

export interface DailyLedgerTotals {
  record_count: number;
  cash_in_base: number;
  cash_out_base: number;
  net_cash_base: number;
  base_currency_code: string;
}

export interface DailyLedgerMeta {
  period?: { start_date?: string; end_date?: string };
  base_currency?: { code: string; symbol: string; name?: string };
  totals?: DailyLedgerTotals;
  sections?: DailyLedgerSectionSummary[];
  by_currency?: DailyLedgerCurrencySummary[];
  currency_filter?: string | null;
  section_filter?: string | null;
}

export interface DailyLedgerResponse {
  results?: DailyLedgerRow[];
  count?: number;
  meta?: DailyLedgerMeta;
}

export interface DailyLedgerFilters {
  date: string;
  section: string;
  search: string;
  page: number;
  pageSize: number;
}
