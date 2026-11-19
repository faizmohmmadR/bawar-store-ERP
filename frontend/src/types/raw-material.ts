export interface RawMaterial {
  id: number;
  name: string;
  category?: number | null;
  category_name?: string | null;
  material_type: 'bottle' | 'bottle_with_cap' | 'cap' | 'cap_label' | 'label' | 'label_double' | 'plastic' | 'carton' | 'carton_plastic' | 'chemistry' | 'boiler' | 'other';
  description: string | null;
  unit: string;
  /** Bottle volume in liters; for plastic/carton = matching bottle size. */
  capacity_liters?: string | null;
  weight_per_piece_kg?: string | null;
  capacity_kg?: string | null;
  /** UI unit used when entering capacity (ml or L). */
  capacity_display_unit?: 'ml' | 'L' | null;
  /** Carton only: bottles that fit in one carton. */
  bottles_per_carton?: number | null;
  /** Plastic only: bottles that fit in one plastic package. */
  bottles_per_plastic?: number | null;
  created_at: string;
  updated_at: string;
}

export interface RawMaterialPurchaseItem {
  id: number;
  raw_material: number;
  raw_material_name: string;
  quantity: string;
  piece_count: number;
  price_per_unit: string;
  price_per_unit_base: string;
  total_price: string;
  total_price_base: string;
  notes: string | null;
  raw_material_details?: Pick<RawMaterial, 'id' | 'name' | 'category' | 'category_name' | 'unit' | 'material_type' | 'capacity_liters' | 'capacity_kg' | 'weight_per_piece_kg' | 'capacity_display_unit' | 'bottles_per_carton' | 'bottles_per_plastic'>;
}

export interface RawMaterialPurchase {
  transaction_type?: 'paid' | 'free';
  id: number;
  vendor: number;
  vendor_name: string;
  invoice_number: string;
  bill_number: string | null;
  purchase_date: string;
  status: 'draft' | 'pending' | 'received' | 'cancelled';
  currency: number;
  currency_name: string;
  total_amount: string;
  paid_amount: string;
  total_amount_base: string;
  exchange_rate: string;
  subtotal_amount: string;
  final_total: string;
  notes: string | null;
  items: RawMaterialPurchaseItem[];
  created_at: string;
  updated_at: string;
}

export interface RawMaterialStockCostLayer {
  id: number;
  purchase_id: number;
  invoice_number: string;
  bill_number: string;
  purchase_date: string;
  currency: number;
  quantity: string;
  piece_count: number;
  price_per_unit: string;
  price_per_unit_base: string;
  total_price: string;
  total_price_base: string;
}

export interface RawMaterialStock {
  average_unit_cost_afn?: string;
  price_is_sample?: boolean;
    usd_to_afn_rate?: string | null;
  id: number;
  raw_material: number;
  raw_material_name: string;
  quantity: string;
  piece_count: number;
  last_purchase_price: string;
  last_purchase_date: string | null;
  cost_layers: RawMaterialStockCostLayer[];
  raw_material_details?: Pick<RawMaterial, 'id' | 'name' | 'category' | 'category_name' | 'unit' | 'material_type' | 'capacity_liters' | 'capacity_kg' | 'weight_per_piece_kg' | 'capacity_display_unit' | 'bottles_per_carton' | 'bottles_per_plastic'>;
}
