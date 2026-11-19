export interface Product {
  id: string;
  name: string;
  raw_material?: number | null;
  material_type?: string | null;
  barcode: string | null;
  description: string | null;
  image?: string | null;
  bottle_capacity_liters?: string | number | null;
  bottle_capacity_kg?: string | number | null;
  carton_capacity_liters?: string | number | null;
  bottles_per_carton?: number;
  density_kg_per_liter: string | number;
}

export interface ProductResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Product[];
}
