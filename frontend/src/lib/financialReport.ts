import type { FinancialOverviewData } from '@/components/reports/FinancialOverview';

export interface BaseSummaryResponse {
  currency: string;
  currency_symbol?: string;
  base_currency?: { id: number; code: string; symbol: string; name?: string };
  summary?: FinancialOverviewData['summary'];
  cash_in_breakdown?: FinancialOverviewData['cash_in_breakdown'];
  cash_out_breakdown?: FinancialOverviewData['cash_out_breakdown'];
  expense_breakdown?: FinancialOverviewData['expense_breakdown'];
  loan_breakdown?: Array<{ type: string; amount: number; count: number }>;
  period?: { start_date: string; end_date: string };
}

export interface ByCurrencyResponse {
  by_currency: FinancialOverviewData['by_currency'];
  currency_codes?: string[];
  currency_count?: number;
  period?: { start_date: string; end_date: string };
}

export function mapBaseSummaryToOverview(data: BaseSummaryResponse): FinancialOverviewData {
  return {
    currency: data.currency,
    currency_symbol: data.currency_symbol,
    base_currency: data.base_currency,
    summary: data.summary,
    by_currency: {},
    cash_in_breakdown: data.cash_in_breakdown,
    cash_out_breakdown: data.cash_out_breakdown,
    expense_breakdown: data.expense_breakdown,
  };
}

export function mapByCurrencyToOverview(data: ByCurrencyResponse): FinancialOverviewData {
  return {
    currency: 'ALL',
    by_currency: data.by_currency || {},
    currency_codes: data.currency_codes,
  };
}
