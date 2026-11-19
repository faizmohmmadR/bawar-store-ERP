export interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active?: boolean;
  status?: 'active' | 'inactive';
  finance?: {
    [currency: string]: {
      total_amount: number;
      paid_amount: number;
      remained_amount: number;
    };
    overall: {
      currency: string;
      total_amount: number;
      paid_amount: number;
      remained_amount: number;
    };
  };
  total_purchases?: number;
  total_payments?: number;
  remaining_balance?: number;
  credit_limit?: number;
}

export interface VendorFormData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active?: boolean;
}
