export interface Employee {
  id: string;
  full_name: string;
  email?: string | null;
  phone: string;
  tazkira_number?: string;
  tazkira_copy?: string | null;
  date_joined?: string;
  is_active: boolean;
  address?: string;
  salary: number;
  salary_type?: 'monthly' | 'daily' | 'other';
  currency?: string;
  currency_details?: {
    id: string;
    name: string;
    code: string;
    symbol?: string;
  };
  notes?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  contract_duration_days?: number | null;
  contract_duration_months?: number | null;
  contract_duration_years?: number | null;
  payment_summary?: {
    salary: number;
    monthly_salary?: number;
    paid_salary: number;
    paid_advance: number;
    total_paid: number;
    salary_remaining: number;
    total_remaining: number;
    /** Signed period balance (+ owed, − overpaid). */
    balance?: number;
    /** monthly salary + overtime − absence − food */
    net_salary?: number;
    elapsed_months?: number;
    elapsed_days?: number | null;
    daily_rate?: number | null;
    accrued_salary?: number | null;
    total_payable?: number | null;
    lifetime_paid?: number;
    lifetime_remaining?: number | null;
    accrual_available?: boolean;
    total_bonus?: number;
    total_overtime?: number;
    total_absence_deductions?: number;
    total_food_deductions?: number;
    total_deductions?: number;
    absence_days?: number;
    overtime_count?: number;
    absence_count?: number;
    currency?: {
      id: string;
      name: string;
      code: string;
      symbol?: string;
    } | null;
    month?: string | null;
    year?: number | null;
    period_calendar?: string;
  };
  user?: number | null;
  user_details?: {
    id: number;
    username: string;
    email: string;
    first_name?: string;
    last_name?: string;
    role?: string;
    is_active?: boolean;
  } | null;
  created_at?: string;
  updated_at?: string;
}

export interface EmployeeFormData {
  full_name: string;
  email: string;
  phone: string;
  tazkira_number?: string;
  tazkira_copy?: File | null;
  is_active: boolean;
  address?: string;
  salary: number;
  currency?: string;
  notes?: string;
  contract_start_date?: string;
  contract_end_date?: string;
}
