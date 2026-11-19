import { Currency } from './common';

export interface Payment {
  id: number;
  content_type: string;
  object_id: number;
  general_payment?: number | null;
  vendor_goods_source?: { id: number; invoice_number: string };
  is_advance?: boolean;
  is_credit_application?: boolean;
  payment_type: 'sale' | 'purchase';
  payment_method?: 'cash' | 'bank' | 'sarafi' | 'intermediary_credit';
  intermediary_vendor?: number | { id: number; name: string };
  intermediary_vendor_details?: { id: number; name: string; phone?: string; email?: string };
  intermediary_loan?: number;
  payment_date: string;
  amount: number;
  currency: number | Currency;
  reference_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  currency_details?: CurrencyDetails;
  related_object_details?: RelatedObjectDetails;
  documents?: import('@/lib/attachments').AttachedDocument[];
}

export interface CurrencyDetails {
  id: number;
  code: string;
  name: string;
  symbol: string;
}

export interface RelatedObjectDetails {
  type: 'sale' | 'purchase';
  id: number;
  invoice_number: string;
  customer_name?: string;
  vendor_name?: string;
}

export interface GeneralPayment {
  id: number;
  payment_type: 'sale' | 'purchase';
  customer: number | null;
  vendor: number | null;
  party_name: string;
  currency: number;
  currency_details: CurrencyDetails;
  amount: string;
  amount_base: string;
  payment_date: string;
  payment_method: 'cash' | 'bank' | 'sarafi';
  reference_number: string | null;
  notes: string | null;
  allocations: Payment[];
  available_credit: string;
}

export interface PaymentBalance {
  total_due: string;
  bills: { id: number; invoice_number: string; date: string; remaining: string }[];
}
