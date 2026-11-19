import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packingStockCosts } from './packingStockCosts';

test('stock preview allocates value once using actual used package quantities', () => {
  const costs = packingStockCosts(1000, 100, [
    { componentType: 'bottle', quantity: 102, total: 100 },
    { componentType: 'carton', quantity: 7, total: 70 },
    { componentType: 'plastic', quantity: 5, total: 30 },
  ]);
  assert.deepEqual(costs, [
    { type: 'bottle', afn: 9 }, { type: 'carton', afn: 10 }, { type: 'plastic', afn: 6 },
  ]);
  assert.equal(costs[0].afn! * 100 + costs[1].afn! * 7 + costs[2].afn! * 5, 1000);
});

test('missing quantities have no invented unit cost', () => {
  assert.deepEqual(packingStockCosts(0, 0, []), [
    { type: 'bottle', afn: null }, { type: 'carton', afn: null }, { type: 'plastic', afn: null },
  ]);
});

test('full filled packages include liquid and every material in each unit view', async () => {
  const { packingFullUnitCosts } = await import('./packingStockCosts');
  assert.deepEqual(packingFullUnitCosts(1000, 100, [
    { componentType: 'bottle', quantity: 102 },
    { componentType: 'carton', quantity: 10 },
    { componentType: 'plastic', quantity: 20 },
  ]), [{ type: 'bottle', afn: 10 }, { type: 'carton', afn: 100 }, { type: 'plastic', afn: 50 }]);
});

test('optional plastic has no invented full package cost', async () => {
  const { packingFullUnitCosts } = await import('./packingStockCosts');
  assert.deepEqual(packingFullUnitCosts(1000, 100, [{ componentType: 'carton', quantity: 10 }]),
    [{ type: 'bottle', afn: 10 }, { type: 'carton', afn: 100 }, { type: 'plastic', afn: null }]);
});

test('returned-only full costs include carried bottle value and new carton cost', async () => {
  const { packingFullUnitCosts } = await import('./packingStockCosts');
  assert.deepEqual(packingFullUnitCosts(66, 6, [{ componentType: 'returned_carton', quantity: 2 }]),
    [{ type: 'bottle', afn: 11 }, { type: 'carton', afn: 33 }, { type: 'plastic', afn: null }]);
});

test('plastic capacity suggests rounded-up whole pieces without matching bottle weight', async () => {
  const { expectedPackingComponentQuantities } = await import('./packaging');
  const result = expectedPackingComponentQuantities({ quantityLiters: 8,
    bottleCapacityLiters: 1, bottlesPerPlastic: 3 });
  assert.equal(result.quantities.plastic, 3);
});

test('manual filled count supports suggestions with no bottle material', async () => {
  const { expectedPackingComponentQuantities } = await import('./packaging');
  const count = 3;
  const result = expectedPackingComponentQuantities({ quantityLiters: 8,
    bottleCapacityLiters: 8 / count, bottlesPerPlastic: 3 });
  assert.equal(result.bottleCount, count);
  assert.equal(result.wholeBottleCount, true);
  assert.equal(result.quantities.plastic, 1);
});
