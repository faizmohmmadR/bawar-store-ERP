export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active?: boolean;
  finance?: {
    [currency: string]: {
      total_debit: number;
      total_credit: number;
      balance: number;
    };
    overall?: {
      currency: string;
      total_debit: number;
      total_credit: number;
      balance: number;
    };
  };
  total_sales?: number;
  total_payments?: number;
  remaining_balance?: number;
}

export interface CustomerFormData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active?: boolean;
}
