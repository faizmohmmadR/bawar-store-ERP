import type { CurrencyDetails } from '@/lib/currencies';

export interface Payroll {
  id: number;
  employee: number;
  payroll_type: 'salary' | 'advance';
  salary_type?: 'monthly' | 'daily' | 'other';
  working_days?: number;
  deduction_days?: number;
  employee_details?: { fullname?: string; phone?: string; salary_type?: 'monthly' | 'daily' | 'other' };
  currency_details?: CurrencyDetails;
  month: string;
  period_calendar?: 'gregorian' | 'jalali' | 'hijri';
  year: number;
  amount: number;
  basic_salary: number;
  bonus: number;
  overtime: number;
  salary_deduction?: number;
  gross_amount?: number | null;
  deductions: number;
  net_salary: number;
  currency: number;
  payment_method?: 'cash' | 'bank' | 'sarafi' | 'goods';
  payment_date: string;
  reference_number?: string | null;
  notes?: string | null;
  manual_net?: boolean;
  source_sale?: number | null;
}
