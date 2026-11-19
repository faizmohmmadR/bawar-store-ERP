export interface StorageTank {
    liquid_cost_per_liter_afn?: string;
    liquid_cost_per_kg_afn?: string;
    liquid_cost_per_kg_usd?: string | null;
    usd_to_afn_rate?: string | null;
    id: number;
    name: string;
    capacity_liters: string;
    capacity_kg: string;
    current_kg: string;
    available_kg: string;
    density_kg_per_liter: string;
    configured_density_kg_per_liter?: string;
    effective_density_kg_per_liter?: string;
    product?: number | null;
    current_liters: string;
    available_liters: string;
    created_at: string;
    updated_at: string;
    production_transfers?: StorageTankTransferHistory[];
}

export interface StorageTankTransferHistory {
    id: number;
    process_number: string;
    production_name: string;
    process_date: string;
    quantity_liters: string;
    quantity_kg: string;
    created_at: string;
}

export interface ProductionStorageTransfer {
    id: number;
    storage_tank: number;
    storage_tank_name: string;
    quantity_liters: string;
    quantity_kg: string;
    created_at: string;
}