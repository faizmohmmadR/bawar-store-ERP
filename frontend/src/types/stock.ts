import { BaseEntity, Currency } from './common';
import { InventoryBatch } from './inventory';

export interface Stock {
  on_hand_quantity?: string;
  available_quantity?: string;
  average_unit_cost_afn?: string;
  last_unit_cost_afn?: string;
  stock_value_afn?: string;
  min_unit_cost_afn?: string;
  max_unit_cost_afn?: string;
  batch_count?: number;
  price_layer_count?: number;
    usd_to_afn_rate?: string | null;
  id: number;
  product: number;
  product_details?: {
    id: number;
    name: string;
    raw_material?: number | null;
    material_type?: string | null;
    raw_material_details?: {
      id: number;
      name: string;
      material_type: string;
      unit: string;
      capacity_liters?: string | number | null;
      capacity_kg?: string | number | null;
      capacity_display_unit?: 'ml' | 'L' | null;
      bottles_per_carton?: number | null;
      bottles_per_plastic?: number | null;
    } | null;
    barcode?: string;
    bottle_capacity_liters?: string | number | null;
    bottle_capacity_kg?: string | number | null;
    carton_capacity_liters?: string | number | null;
    bottles_per_carton?: number;
  };
  condition?: 'good' | 'damaged' | 'waste';
  piece_amount?: number;
  carton_amount?: number;
  loose_pieces?: number;
  buy_price: number;
  /** Buy price per carton, derived using the product's bottles per carton. */
  buy_price_per_carton?: number;
  currency: number;
  currency_details?: {
    id: number;
    name: string;
    code: string;
    symbol?: string;
  };
  branch?: number;
  branch_details?: {
    id: number;
    name: string;
    code: string;
  };
  expire_date?: string | null;
  days_until_expiry?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Batches that contribute to this stock entry */
  batches?: InventoryBatch[];
}