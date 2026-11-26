export type PackagingBreakdownRow = {
  packaging_id: number | null;
  name: string;
  qty_in_base: number | string;
  count: number | string;
};

export type InventoryBalance = {
  id: number;
  product: number;
  warehouse: number;
  warehouse_name?: string;
  lot?: number | null;
  lot_number?: string | null;
  expiry_date?: string | null;
  days_to_expiry?: number | null;
  is_expired?: boolean;
  purchase_invoice?: string | null;
  purchase_id?: number | null;
  purchase_item_id?: number | null;
  /** Present on aggregated stock-list rows (number of lot/balance lines combined). */
  lot_count?: number;
  quantity_on_hand: number | string;
  quantity_reserved?: number | string;
  quantity_available?: number | string;
  average_cost?: number | string;
  packaging_breakdown?: PackagingBreakdownRow[];
  lots?: InventoryBalance[];
  product_details?: {
    id: number;
    name: string;
    sku?: string | null;
    barcode?: string | null;
    base_uom?: number | null;
    base_uom_details?: {
      id?: number;
      code?: string | null;
      name?: string | null;
      symbol?: string | null;
    } | null;
    packagings?: Array<{
      id: number;
      name: string;
      qty_in_base: number | string;
      is_base?: boolean;
      for_stock?: boolean;
    }>;
    min_stock_level?: number | string;
    reorder_level?: number | string;
    track_inventory?: boolean;
    track_expiry?: boolean;
    is_active?: boolean;
  } | null;
};

export type StockMovement = {
  id: number;
  product: number;
  product_name?: string;
  warehouse: number;
  warehouse_name?: string;
  packaging?: number | null;
  packaging_name?: string | null;
  lot?: number | null;
  lot_number?: string | null;
  expiry_date?: string | null;
  movement_type: string;
  base_quantity: number | string;
  transaction_quantity?: number | string;
  conversion_factor?: number | string;
  unit_cost?: number | string;
  occurred_at?: string;
  notes?: string | null;
};
