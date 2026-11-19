import type { PackingComponentType } from '@/types/packing';

/** Preview the existing server allocation to the three independent stock outputs. */
export function packingStockCosts(totalCost: number, filledBottleCount: number, components: Array<{
  componentType: PackingComponentType; quantity: number; total: number;
}>) {
  const carton = components.find(row => row.componentType === 'carton');
  const plastic = components.find(row => row.componentType === 'plastic');
  const bottleValue = totalCost - (carton?.total || 0) - (plastic?.total || 0);
  return [
    { type: 'bottle' as const, afn: filledBottleCount > 0 ? bottleValue / filledBottleCount : null },
    { type: 'carton' as const, afn: carton && carton.quantity > 0 ? carton.total / carton.quantity : null },
    { type: 'plastic' as const, afn: plastic && plastic.quantity > 0 ? plastic.total / plastic.quantity : null },
  ];
}

/** Full filled-package cost: the section total expressed per output unit. */
export function packingFullUnitCosts(totalCost: number, filledBottleCount: number, components: Array<{
  componentType: string; quantity: number;
}>) {
  const count = (type: string) => components.filter(row => row.componentType === type)
    .reduce((sum, row) => sum + row.quantity, 0);
  const cartons = count('carton') + count('returned_carton');
  const plastics = count('plastic');
  return [
    { type: 'bottle' as const, afn: filledBottleCount > 0 ? totalCost / filledBottleCount : null },
    { type: 'carton' as const, afn: cartons > 0 ? totalCost / cartons : null },
    { type: 'plastic' as const, afn: plastics > 0 ? totalCost / plastics : null },
  ];
}
