import { BaseEntity, Currency } from './common';
import { Customer } from './customer';
import { Product } from './products';
import { InventoryBatch } from './inventory';

export type SaleSource = 'stock' | 'tank' | 'raw_material';
export type SaleUnit = 'carton' | 'bottle' | 'plastic' | 'dana' | 'liter' | 'kg' | 'piece' | string;

export interface Sale extends BaseEntity {
  transaction_type?: 'paid' | 'free';
  vendor?: string | number | null;
  vendor_transaction?: 'sale' | 'purchase_return';
  vendor_details?: Customer;
  vendor_credit?: { applied: number; remaining: number; allocations: { purchase_id: number; amount: string; invoice_number: string }[] };
  final_total?: number | string;
  customer: string | number | null;
  customer_details?: Customer;
  employee?: string | number | null;
  employee_details?: {
    id: string | number;
    full_name: string;
    phone?: string;
    salary_type?: string;
  } | null;
  salary_settlement_id?: number | null;
  invoice_number: string;
  bill_no?: string | null;
  sale_date: string;
  status: 'draft' | 'confirmed' | 'shipped' | 'delivered' | 'invoiced' | 'cancelled';
  currency: string | number;
  currency_details?: Currency;
  total_amount: number | string;
  total_amount_base?: number | string;
  paid_amount: number | string;
  paid_amount_base?: number | string;
  exchange_rate?: number | string;
  discount_amount: number | string;
  discount_percentage?: number | string;
  plate_number?: string;
  notes?: string;
  items?: SaleItem[];
  sales_items?: SaleItem[];
  documents?: import('@/lib/attachments').AttachedDocument[];
}

export interface SaleItem extends BaseEntity {
  sales?: string | number;
  sale_source?: SaleSource;
  stock?: string | number | null;
  storage_tank?: string | number | null;
  raw_material_stock?: string | number | null;
  piece_count?: number;
  stock_details?: {
    id: string | number;
    product?: Product;
    product_details?: Product;
    bottles_per_carton?: number;
    piece_amount?: number;
    sell_price?: number;
    currency?: string | number;
  };
  storage_tank_details?: {
    id: string | number;
    name: string;
    product_name?: string;
    current_liters?: string | number;
    liquid_cost_per_liter_afn?: string | number;
    capacity_liters?: string | number;
    current_kg?: string | number;
    density_kg_per_liter?: string | number;
  };
  raw_material_stock_details?: {
    id: string | number;
    raw_material?: string | number;
    name?: string;
    material_type?: string;
    unit?: string;
    quantity?: string | number;
    piece_count?: number;
    weight_per_piece_kg?: string | number | null;
    last_purchase_price?: string | number;
  };
  product_details?: Product & { is_tank_fill?: boolean; is_raw_material?: boolean; name?: string; material_type?: string; unit?: string };
  product?: string;
  unit?: SaleUnit;
  quantity?: number;
  carton_amount?: number;
  liter_amount?: number;
  kilogram_amount?: number;
  sell_price: number;
  unit_cost?: number;
  /** Batch allocations for this sale item */
  batch_allocations?: InventoryBatch[];
}

export interface SaleFormData {
  customer: string | number;
  currency: string | number;
  sale_date: string;
  discount_amount?: number;
  plate_number?: string;
  notes?: string;
  paid_amount?: number;
  total_amount?: number;
  sales_items: {
    id?: string | number;
    sale_source?: SaleSource;
    stock?: string | number;
    storage_tank?: string | number;
    liter_amount: number;
    sell_price: number;
  }[];
}
