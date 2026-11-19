import { convertMass } from './massUnits';
import type { RawMaterialProcessMaterialOption } from '@/types/raw-material-process';

export type ProductionIngredientInput = { raw_material: string; quantity: string; quantity_unit: string; piece_count: string };
const positiveNumber = (value: string) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
// Integer 0.0000001 kg units cover the smallest supported 0.0001 g input.
// Round half-up once, like the API Decimal calculation, after adding all inputs.
const kgUnits = (value: string, unit = 'kg'): bigint => {
  const kg = unit === 'g' ? convertMass(value, 'g', 'kg') : value;
  const match = /^(\d*)(?:\.(\d*))?$/.exec(kg);
  if (!match || (!match[1] && !match[2])) return 0n;
  return BigInt(match[1] || '0') * 10000000n + BigInt((match[2] || '').padEnd(7, '0').slice(0, 7));
};
const roundKg = (value: bigint) => Number((value + 500n) / 1000n) / 10000;

export function productionMassSummary(items: ProductionIngredientInput[], water: string, stock: RawMaterialProcessMaterialOption[]) {
  let materials = 0n;
  let chemistry = 0n;
  for (const item of items) {
    if (!item.raw_material || !['kg', 'g'].includes(item.quantity_unit)) continue;
    const kg = kgUnits(item.quantity, item.quantity_unit);
    materials += kg;
    if (stock.find(row => String(row.raw_material) === item.raw_material)?.raw_material_details.material_type === 'chemistry') chemistry += kg;
  }
  return { materials: roundKg(materials), chemistry: roundKg(chemistry), other: roundKg(materials - chemistry), water: roundKg(kgUnits(water)), total: roundKg(materials + kgUnits(water)) };
}

export function productionIngredientAvailability(item: ProductionIngredientInput, stock: RawMaterialProcessMaterialOption[]) {
  const material = stock.find(row => String(row.raw_material) === item.raw_material);
  const unit = material?.raw_material_details.unit || item.quantity_unit;
  let requested = positiveNumber(item.quantity);
  if (unit === 'kg' && item.quantity_unit === 'g') requested /= 1000;
  if (unit === 'g' && item.quantity_unit === 'kg') requested *= 1000;
  const available = Number(material?.available_quantity || 0);
  const availablePieces = Number(material?.available_piece_count || 0);
  return {
    unit, requested, available, availablePieces,
    insufficient: Boolean(item.raw_material) && requested > available + 1e-9,
    insufficientPieces: Boolean(item.raw_material) && positiveNumber(item.piece_count) > availablePieces,
    invalidMassUnit: Boolean(item.raw_material) && !['kg', 'g'].includes(unit),
  };
}
