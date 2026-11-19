export type DamagedComponentType = 'label' | 'plastic' | 'carton' | 'liquid';

export type DamagedMaterialItem = {
  id?: number;
  component_type: DamagedComponentType;
  raw_material?: number | string | null;
  raw_material_name?: string;
  material_type?: string;
  product?: number | string | null;
  product_name?: string;
  quantity_pieces: number | string;
  unit?: string;
  unit_price_afn?: number | string;
  total_cost_afn?: number | string;
};

export type DamagedMaterialRecord = {
  id: number | string;
  damaged_number: string;
  record_date: string;
  notes?: string | null;
  total_cost_afn: number | string;
  source?: 'manual' | 'stock_bottle' | 'tank_leak';
  items: DamagedMaterialItem[];
  tank_leak_id?: number | null;
  storage_tank_id?: number | null;
  storage_tank_name?: string | null;
  tank_leak_quantity_kg?: number | string | null;
  tank_available_kg?: number | string | null;
  created_at?: string;
  updated_at?: string;
};

export type DamagedMaterialFormRow = {
  raw_material: string;
  quantity_pieces: string;
  unit_price_afn: string;
};

export type DamagedMaterialFormValues = {
  record_date: string;
  notes: string;
  label: DamagedMaterialFormRow;
  plastic: DamagedMaterialFormRow;
  carton: DamagedMaterialFormRow;
};
