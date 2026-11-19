import api from '@/api/client';
import { cartonsFromPieces, remainderPieces } from '@/lib/packaging';

export type StockOption = {
  id: number | string;
  piece_amount?: string | number;
  condition?: string;
  available_quantity?: string | number;
  product_details?: { id?: number; name?: string; barcode?: string; raw_material?: number | null; material_type?: string | null; bottles_per_carton?: number; density_kg_per_liter?: string | number; bottle_capacity_kg?: string | number | null; bottle_capacity_liters?: string | number | null };
};

export function stockPieces(stock: StockOption): number {
  return parseFloat(String(stock.available_quantity ?? stock.piece_amount ?? 0));
}

/** Full cartons available (floor of pieces ÷ 8). */
export function stockAvailableCartons(stock: StockOption): number {
  return (stock.product_details?.raw_material || stock.product_details?.material_type) ? stockPieces(stock) : cartonsFromPieces(stockPieces(stock), stock.product_details?.bottles_per_carton);
}

async function fetchStocks(
  params: Record<string, string>,
  token?: string | null,
): Promise<StockOption[]> {
  const { data } = await api.get('stocks/', {
    params: { page_size: '100', ...params },
    ...(token ? { headers: { Authorization: `Token ${token}` } } : {}),
  });
  const stocks: StockOption[] = Array.isArray(data) ? data : data?.results || [];
  return stocks.filter((s) => stockPieces(s) > 0);
}

/** Fetch stock rows for a product (lots available to sell). Prefer Autocomplete queryParams.product. */
export async function fetchStocksByProduct(
  productId: string,
  token?: string | null,
): Promise<StockOption[]> {
  if (!productId) return [];
  return fetchStocks({ product: productId }, token);
}

export function stockOptionLabel(stock: StockOption): string {
  const name = stock.product_details?.name || 'Product';
  const pieces = stockPieces(stock);
  const type = stock.product_details?.material_type;
  if (stock.product_details?.raw_material || stock.product_details?.material_type) {
    const unit = type === 'carton' ? 'carton' : type === 'plastic' ? 'plastic' : 'bottle';
    return `${name} (${pieces} ${unit})`;
  }
  const cartons = cartonsFromPieces(pieces, stock.product_details?.bottles_per_carton);
  const loose = remainderPieces(pieces, stock.product_details?.bottles_per_carton);
  if (loose > 0) {
    return `${name} (${cartons} carton + ${loose} pieces)`;
  }
  return `${name} (${cartons} carton / ${pieces} pieces)`;
}

/** Localized stock label for sale forms: product + available carton & pieces. */
export function stockAvailabilityLabel(
  stock: StockOption,
  labels: { carton: string; piece: string; bottle?: string; plastic?: string; available?: string },
): string {
  const name = stock.product_details?.name || 'Product';
  const pieces = stockPieces(stock);
  if (stock.product_details?.raw_material || stock.product_details?.material_type) {
    const type = stock.product_details.material_type;
    const unit = type === 'carton' ? labels.carton : type === 'plastic' ? (labels.plastic || labels.piece) : (labels.bottle || labels.piece);
    const qty = `${pieces} ${unit}`;
    return labels.available ? `${name} — ${labels.available}: ${qty}` : `${name} (${qty})`;
  }
  const cartons = cartonsFromPieces(pieces, stock.product_details?.bottles_per_carton);
  const loose = remainderPieces(pieces, stock.product_details?.bottles_per_carton);
  const qty =
    loose > 0
      ? `${cartons} ${labels.carton} + ${loose} ${labels.piece}`
      : `${cartons} ${labels.carton} · ${pieces} ${labels.piece}`;
  return labels.available ? `${name} — ${labels.available}: ${qty}` : `${name} (${qty})`;
}
