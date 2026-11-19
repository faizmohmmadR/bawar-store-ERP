import type { ProductionStorageTransfer } from './storage-tank';

export type RawMaterialProcessStatus = 'in_process' | 'completed' | 'moved_to_storage';

export interface RawMaterialProcessPurchaseSource {
    source?: 'stock';
    purchase_item?: number;
    purchase_invoice_number?: string;
    supplier_bill_number?: string | null;
    purchase_date?: string;
    quantity: string;
    piece_count: number;
    unit_cost_afn: string;
    total_cost_afn: string;
}

export interface RawMaterialProcessItem {
    id: number;
    raw_material: number;
    raw_material_details: {
        id: number;
        name: string;
        unit: string;
        material_type: string;
    };
    quantity: string;
    piece_count: number;
    material_cost_afn: string;
    purchase_sources: RawMaterialProcessPurchaseSource[];
}

export interface RawMaterialProcess {
    usd_to_afn_rate?: string | null;
    id: number;
    process_number: string;
    product_name: string;
    product?: number | null;
    density_kg_per_liter: string;
    process_date: string;
    status: RawMaterialProcessStatus;
    output_quantity_liters: string;
    output_quantity_kg: string;
    output_from_inputs: boolean;
    materials_quantity_kg: string;
    chemistry_quantity_kg: string;
    total_input_quantity_kg: string;
    water_quantity_liters: string;
    water_quantity_kg: string;
    extra_expense: string;
    expense_currency: number;
    expense_currency_details?: {
        id: number;
        code: string;
        name: string;
        symbol: string;
    } | null;
    material_cost_afn: string;
    extra_expense_afn: string;
    total_cost_afn: string;
    cost_per_liter_afn: string;
    cost_per_kg_afn: string;
    storage_transfers: ProductionStorageTransfer[];
    notes: string | null;
    items: RawMaterialProcessItem[];
    created_at: string;
    updated_at: string;
}

export interface RawMaterialProcessPurchaseLot {
    id: number;
    purchase_id: number;
    invoice_number: string;
    bill_number: string;
    purchase_date: string;
    currency: number;
    currency_details: {
        code: string;
        symbol: string;
    } | null;
    price_per_unit: string;
    price_per_unit_base: string;
    available_quantity: string;
    available_piece_count: number;
}

export interface RawMaterialProcessMaterialOption {
  stock_unit_cost_afn?: string;
    raw_material: number;
    raw_material_details: {
        id: number;
        name: string;
        unit: string;
        material_type?: string;
    };
    raw_material_name?: string;
    available_quantity: string;
    available_piece_count: number;
    purchase_lots: RawMaterialProcessPurchaseLot[];
}
