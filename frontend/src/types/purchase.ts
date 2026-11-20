export type PurchaseItem = {
  id?: number;
  product: number;
  packaging: number;
  quantity: number | string;
  conversion_factor?: number | string;
  base_quantity?: number | string;
  measured_base_quantity?: number | string | null;
  price_per_unit: number | string;
  total_price?: number | string;
  total_price_base?: number | string;
  discount_amount?: number | string;
  lot_number?: string | null;
  expiry_date?: string | null;
  manufacturing_date?: string | null;
  notes?: string | null;
  product_details?: {
    id: number;
    name: string;
    sku?: string | null;
    barcode?: string | null;
    base_uom?: number;
    packagings?: Array<{
      id: number;
      name: string;
      qty_in_base: number | string;
      for_purchase?: boolean;
      for_sale?: boolean;
      is_base?: boolean;
      is_variable_weight?: boolean;
      barcode?: string | null;
    }>;
  } | null;
  packaging_details?: {
    id: number;
    name: string;
    qty_in_base: number | string;
    is_variable_weight?: boolean;
  } | null;
};

export type Purchase = {
  id: number;
  invoice_number?: string;
  bill_number?: string | null;
  vendor: number;
  vendor_name?: string;
  warehouse: number;
  warehouse_name?: string;
  purchase_date: string;
  status: 'draft' | 'pending' | 'received' | 'cancelled' | string;
  transaction_type?: 'paid' | 'free';
  currency: number;
  currency_details?: { code?: string; symbol?: string };
  currency_name?: string;
  total_amount: number | string;
  total_amount_base?: number | string;
  paid_amount?: number | string;
  paid_amount_base?: number | string;
  remaining_amount?: number | string;
  exchange_rate?: number | string;
  notes?: string | null;
  items?: PurchaseItem[];
  final_total?: number | string;
};
