import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionMassSummary, productionIngredientAvailability } from './productionInput';
import type { RawMaterialProcessMaterialOption } from '@/types/raw-material-process';
const stock = [{ raw_material: 1, raw_material_details: { id: 1, name: 'Chemistry', unit: 'kg', material_type: 'chemistry' }, available_quantity: '5', available_piece_count: 4, purchase_lots: [{id: 10, available_quantity: '.25', available_piece_count: 1}, {id: 11, available_quantity: '4.75', available_piece_count: 3}] }] as RawMaterialProcessMaterialOption[];
const ingredient = { raw_material: '1', quantity: '500', quantity_unit: 'g', piece_count: '0' };
test('grams and kilograms sum with water into a single mixture mass', () => {
  assert.deepEqual(productionMassSummary([ingredient], '9.5', stock), {materials:.5, chemistry:.5, other:0, water:9.5, total:10});
});
test('pooled stock availability ignores legacy purchase selectors', () => {
  assert.equal(productionIngredientAvailability(ingredient, stock).insufficient, false);
  const selected = productionIngredientAvailability(ingredient, stock);
  assert.equal(selected.available, 5);
  assert.equal(selected.insufficient, false);
  assert.equal(productionIngredientAvailability({...ingredient, quantity:'5000'}, stock).insufficient, false);
  assert.equal(productionIngredientAvailability({...ingredient, quantity:'5000.1'}, stock).insufficient, true);
});
test('package limits and unknown stock are validated independently', () => {
  assert.equal(productionIngredientAvailability({...ingredient, piece_count:'5'}, stock).insufficientPieces, true);
  assert.equal(productionIngredientAvailability(ingredient, []).insufficient, true);
});

test('mixture rounding matches API half-up for fractional gram inputs', () => {
  const summary = productionMassSummary([{...ingredient, quantity:'.15'}], '.0001', stock);
  assert.equal(summary.materials, .0002);
  assert.equal(summary.total, .0003);
});

test('multiple selected purchase quantities and package counts are combined', () => {
  const result = productionIngredientAvailability({...ingredient, quantity:'5000', piece_count:'4'}, stock);
  assert.equal(result.available, 5);
  assert.equal(result.availablePieces, 4);
  assert.equal(result.insufficient, false);
  assert.equal(result.insufficientPieces, false);
});

test('stock without purchases or packages remains available for automatic production', () => {
  const directStock = [{ ...stock[0], available_quantity: '10', available_piece_count: 0, purchase_lots: [] }];
  const result = productionIngredientAvailability({ ...ingredient, quantity: '1000', piece_count: '0' }, directStock);
  assert.equal(result.available, 10);
  assert.equal(result.insufficient, false);
  assert.equal(result.insufficientPieces, false);
});
