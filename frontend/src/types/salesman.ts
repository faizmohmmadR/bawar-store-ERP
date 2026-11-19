export interface Salesman {
  id: string | number;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active?: boolean;
  total_commission?: number;
  commission_paid?: number;
  commission_balance?: number;
  sales_count?: number;
}

export interface SalesmanFormData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active?: boolean;
}
