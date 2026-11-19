export type SalesmanCommissionPayment = {
  id: number;
  salesman: number;
  salesman_details?: {
    id: number;
    name?: string;
    phone?: string | null;
  };
  payment_date: string;
  payment_method: 'cash' | 'bank' | 'sarafi';
  amount: number | string;
  amount_base?: number | string;
  currency: number;
  currency_details?: { id?: number; code?: string; symbol?: string };
  exchange_rate?: number | string;
  reference_number?: string | null;
  notes?: string | null;
};

export type SalesmanUnitBreakdownRow = {
  unit: string;
  quantity: number;
  commission_total: number;
  commission_per_unit_avg: number;
  line_count: number;
};

export type SalesmanUnitBreakdown = {
  rows: SalesmanUnitBreakdownRow[];
  total_quantity: number;
  total_commission: number;
};

export type SalesmanCommissionSummary = {
  salesman_id: number;
  total_commission: number;
  commission_earned: number;
  commission_paid: number;
  commission_balance: number;
  lifetime_commission_balance?: number;
  sales_count: number;
  unit_breakdown?: SalesmanUnitBreakdown;
  recent_commissions: Array<{
    sale_id: number;
    invoice_number: string;
    sale_date: string;
    product_name: string;
    commission_amount: string;
    commission_total?: string;
    sell_price: string;
    quantity: string;
    unit: string;
  }>;
};

export type SalesmanStatementEntry = {
  id: string;
  entry_type: 'sale' | 'payment';
  date: string;
  sale_id: number | null;
  invoice_number: string;
  commission_amount: string;
  payment_amount: string;
  customer_name?: string;
  sale_total?: string;
  sale_currency?: number;
  sale_status?: string;
  payment_id?: number;
  payment_method?: string;
  reference_number?: string;
  notes: string;
};

export type SalesmanCommissionStatement = {
  salesman_id: number;
  entries: SalesmanStatementEntry[];
  total_commission: string;
  commission_earned: string;
  commission_paid: string;
  commission_balance: string;
  opening_balance: string;
  lifetime_commission_balance: string;
  sales_count: number;
};
