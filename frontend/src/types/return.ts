import { BaseEntity } from './common';

export interface Return extends BaseEntity {
  sales: string;
  sales_details?: {
    id: string;
    invoice_number: string;
    customer: string;
    total_amount: number;
  };
  return_number: string;
  return_date: string;
  reason?: string;
  currency: string;
  currency_details?: {
    id: string;
    code: string;
    name: string;
    symbol: string;
  };
  total_amount: number;
  refund_amount: number;
  notes?: string;
  return_items?: ReturnItem[];
}

export interface ReturnItem extends BaseEntity {
  return_order: string;
  sales_item: string;
  sales_item_details?: {
    id: string;
    product: string;
    liter_amount: number;
    sell_price: number;
  };
  product_details?: {
    id: string;
    name: string;
    barcode?: string;
  };
  liter_amount: number;
  return_price: number;
  return_amount: number;
}

export interface ReturnFormData {
  sales: string | number;
  return_number: string;
  return_date: string;
  reason?: string;
  currency: string | number;
  total_amount: number;
  refund_amount: number;
  notes?: string;
  return_items: {
    sales_item: string | number;
    carton_amount?: number;
    /** Derived pieces for API; not entered in UI */
    piece_amount?: number;
    return_price: number;
  }[];
}