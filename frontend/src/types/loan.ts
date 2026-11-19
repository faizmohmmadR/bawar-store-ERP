export interface Loan {
  id: string;
  loaner_type: 'customer' | 'vendor';
  customer?: string;
  vendor?: string;
  customer_details?: {
    id: string;
    username: string;
    name: string;
    phone?: string;
    email?: string;
  };
  vendor_details?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
  };
  loaner_name?: string;
  loaner_type_display?: string;
  amount: number;
  amount_paid: number;
  balance_due: number;
  loan_type: 'loan_in' | 'loan_out';
  loan_type_display?: string;
  payment_method?: 'cash' | 'bank' | 'sarafi';
  source_payment?: string | null;
  currency: string;
  currency_details?: {
    id: number;
    code: string;
    name: string;
    symbol?: string;
  };
  loan_date: string;
  bill_number?: string;
  bill_file?: string;
  notes?: string;
  is_paid: boolean;
  is_opening_balance?: boolean;
  payments?: LoanPayment[];
  loan_scenario?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LoanFormData {
  loaner_type: 'customer' | 'vendor';
  customer?: string;
  vendor?: string;
  amount: number;
  loan_type: 'loan_in' | 'loan_out';
  currency: string;
  loan_date: string;
  bill_number?: string;
  bill_file?: File;
  notes?: string;
  is_opening_balance?: boolean;
  amount_paid?: number;
  is_paid?: boolean;
}

export interface LoanPayment {
  loaner_name?: string;
  currency_details?: { id?: number; code?: string; symbol?: string };
  loan_type?: 'loan_in' | 'loan_out';
  id: string;
  loan: string;
  amount: number;
  payment_date: string;
  reference_number?: string;
  bill_number?: string;
  bill_file?: string;
  payment_method?: 'cash' | 'bank' | 'sarafi';
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LoanPaymentFormData {
  loan: string;
  amount: number;
  payment_date: string;
  reference_number?: string;
  bill_number?: string;
  bill_file?: File;
  payment_method?: 'cash' | 'bank' | 'sarafi';
  notes?: string;
}

export interface LoanSummary {
  total_loan_in: number;
  total_loan_out: number;
  unpaid_loan_in: number;
  unpaid_loan_out: number;
  net_balance: number;
  total_loans: number;
  unpaid_loans: number;
}
