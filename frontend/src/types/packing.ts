export type PackingComponentType = 'bottle' | 'cap' | 'cap_label' | 'label' | 'plastic' | 'carton' | 'carton_plastic';
export type PackingMaterialType = PackingComponentType | 'bottle_with_cap' | 'label_double';

export interface PackingRawMaterialPurchaseOption {
    id: number;
    invoice_number: string;
    bill_number: string;
    purchase_date: string;
    available_quantity: string;
    unit_cost_afn: string;
}

export interface PackingComponentStockOption {
    stock_unit_cost_afn?: string | null;
    raw_material: number;
    raw_material_name: string;
    category?: number | null;
    category_name?: string | null;
    material_type: PackingMaterialType;
    unit: string;
    capacity_liters?: string | null;
    capacity_kg?: string | null;
    capacity_display_unit?: 'ml' | 'L' | null;
    bottles_per_carton?: number | null;
    bottles_per_plastic?: number | null;
    available_quantity: string;
    unit_cost_afn: string;
    purchase_lots: PackingRawMaterialPurchaseOption[];
}

export interface PackingTankOption {
    usd_to_afn_rate?: string | null;
    id: number;
    name: string;
    available_liters: string;
    available_kg: string;
    capacity_liters: string;
    liquid_cost_per_liter_afn: string;
    density_kg_per_liter?: string | null;
}

export interface PackingRunComponent {
    id: number;
    component_type: PackingComponentType | 'returned_carton';
    component_label: string;
    stock: number | null;
    raw_material_stock: number | null;
    raw_material: number | null;
    purchase_item: number | null;
    product_name: string;
    quantity_pieces: string;
    unit_cost_afn: string;
    total_cost_afn: string;
    inventory_allocations: Array<{
        inventory_batch?: number;
        batch_number?: string;
        purchase_item?: number;
        invoice_number?: string;
        purchase_date?: string;
        quantity?: string;
        quantity_pieces?: string;
        unit_cost_afn: string;
        total_cost_afn: string;
    }>;
}

export interface PackingRun {
    usd_to_afn_rate?: string | null;
    id: number;
    packing_number: string;
    storage_tank: number | null;
    storage_tank_name: string | null;
    packing_return?: number | null;
    returned_cost_afn?: string;
    returned_bottle_count?: number;
    product: number | null;
    product_name: string;
    finished_stock: number | null;
    quantity_liters: string;
    quantity_kg: string;
    bottle_volume_liters: string;
    bottle_count: number;
    liquid_cost_afn: string;
    packaging_cost_afn: string;
    total_cost_afn: string;
    cost_per_bottle_afn: string;
    full_unit_costs?: Array<{
        section: 'new' | 'returned' | 'combined'; total_cost_afn: string;
        bottle_count: string; carton_count: string; plastic_count: string;
        cost_per_bottle_afn: string | null; cost_per_carton_afn: string | null; cost_per_plastic_afn: string | null;
    }>;
    notes: string;
    components: PackingRunComponent[];
    outputs?: Array<{ id: number; component_type: PackingComponentType | 'returned_carton' | 'returned_bottle'; stock: number; inventory_batch: number; product?: number; raw_material: number | null; product_name: string; quantity_pieces: string; unit_cost_afn: string; total_cost_afn: string }>;
    created_at: string;
    updated_at: string;
}

export interface PackingReturn {
    usd_to_afn_rate?: string | null;
    id: number;
    stock: number;
    product_name: string;
    bottle_count: number;
    remaining_bottle_count: number;
    packed_bottle_count: number;
    first_returned_at: string | null;
    last_returned_at: string | null;
    return_events: Array<{ id: number; returned_at: string; bottle_count: number; inventory_moved: boolean; unit_cost_afn: string; notes: string; event_type?: 'return' | 'correction'; quantity_change?: number; previous_total?: number; corrected_total?: number }>;
    inventory_moved: boolean;
    is_available: boolean;
    unit_cost_afn: string;
    stock_value_afn: string;
    bottle_volume_liters: string;
    bottle_weight_kg: string;
    expire_date: string | null;
    created_at: string;
    notes: string;
    packing_runs: Array<{ id: number; packing_number: string; bottle_count: number }>;
}
