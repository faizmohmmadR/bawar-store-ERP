export interface StorageTankLeak {
  id: number;
  storage_tank: number;
  storage_tank_name?: string;
  damaged_record?: number | null;
  damaged_number?: string | null;
  quantity_kg: string | number;
  quantity_liters?: string | number;
  density_kg_per_liter?: string | number;
  unit_cost_afn?: string | number;
  total_cost_afn?: string | number;
  notes?: string;
  recorded_at: string;
  created_at?: string;
  updated_at?: string;
}
