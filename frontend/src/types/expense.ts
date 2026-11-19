export interface ExpenseCategory {
  id: number;
  name: string;
  description?: string;
}

export interface Expense {
  id: number;
  category: number;
  amount: number;
  expense_date: string;
  currency: number;
  receipt?: string;
  description?: string;
  user?: number;
  created_at?: string;
  updated_at?: string;
  category_details?: {
    id: number;
    name: string;
  };
  user_details?: {
    id: number;
    fullname: string;
    username: string;
    email: string;
  };
  currency_details?: {
    id: number;
    code: string;
    name: string;
    symbol: string;
  };
}