export type ProductPackaging = {
  id: number;
  name: string;
  qty_in_base: number | string;
  is_base?: boolean;
  for_purchase?: boolean;
  for_sale?: boolean;
  for_stock?: boolean;
  is_default_purchase?: boolean;
  is_default_sale?: boolean;
  is_active?: boolean;
  barcode?: string | null;
  is_variable_weight?: boolean;
  uom?: number | null;
};

export interface Product {
  id: number | string;
  name: string;
  sku?: string | null;
  barcode: string | null;
  description: string | null;
  image?: string | null;
  image_url?: string | null;
  base_uom?: number | null;
  base_uom_details?: {
    id?: number;
    code?: string | null;
    name?: string | null;
    symbol?: string | null;
  } | null;
  category?: number | null;
  brand?: string | null;
  packagings?: ProductPackaging[];
  average_cost?: number | string;
  min_stock_level?: number | string;
  reorder_level?: number | string;
  track_inventory?: boolean;
  track_batch?: boolean;
  track_expiry?: boolean;
  is_active?: boolean;
}

export interface ProductResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Product[];
}
