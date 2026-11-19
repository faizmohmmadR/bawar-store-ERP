import { BaseEntity, Currency } from './common';
import { Product } from './products';
import { Vendor } from './vendor';

export interface InventoryBatch extends BaseEntity {
  batch_number: string;
  product: number | Product;
  product_details?: Product;
  supplier?: number | Vendor | null;
  supplier_details?: Vendor;
  warehouse?: number | null;
  warehouse_details?: {
    id: number;
    name: string;
    code: string;
    is_main: boolean;
  };
  condition?: 'good' | 'damaged' | 'waste';
  cartons_received: number;
  pieces_received: number;
  remaining_pieces: number;
  cartons_remaining?: number;
  loose_pieces?: number;
  unit_cost: number;
  unit_cost_per_carton?: number;
  currency: number | Currency;
  currency_details?: Currency;
  expire_date?: string | null;
  manufacturing_date?: string | null;
  status?: 'active' | 'expired' | 'empty' | 'damaged' | 'returned';
  stock_id?: number | null;
  days_until_expiry?: number | null;
  is_expired?: boolean;
  is_near_expiry?: boolean;
  notes?: string | null;
}

export interface SaleBatchAllocation extends BaseEntity {
  sale: number;
  sale_details?: {
    id: number;
    invoice_number: string;
    sale_date: string;
  };
  sale_item: number;
  sale_item_details?: {
    id: number;
    product?: string;
  };
  inventory_batch: number;
  batch_details?: {
    id: number;
    batch_number: string;
    product?: string;
    expire_date?: string | null;
  };
  quantity: number;
}

export interface StockAdjustment extends BaseEntity {
  inventory_batch: number;
  batch_details?: {
    id: number;
    batch_number: string;
    product?: string;
  };
  adjustment_type: 'expired' | 'damaged' | 'lost' | 'manual_correction' | 'returned' | 'transfer';
  quantity_before: number;
  quantity_after: number;
  quantity_change: number;
  reason?: string | null;
  reference_number?: string | null;
  adjusted_by?: number | null;
  adjusted_by_details?: {
    id: number;
    username: string;
    full_name?: string;
  };
  adjustment_date: string;
}

export interface InventorySummary {
  product_id: number;
  product_name: string;
  product_barcode?: string;
  total_pieces: number;
  total_batches: number;
  total_value: number;
}

export interface ExpiryReport {
  summary: {
    already_expired_count: number;
    already_expired_pieces: number;
    near_7_days_count: number;
    near_7_days_pieces: number;
    near_30_days_count: number;
    near_30_days_pieces: number;
    near_90_days_count: number;
    near_90_days_pieces: number;
  };
  batches: {
    already_expired: InventoryBatch[];
    near_7_days: InventoryBatch[];
    near_30_days: InventoryBatch[];
    near_90_days: InventoryBatch[];
    future: InventoryBatch[];
  };
}
