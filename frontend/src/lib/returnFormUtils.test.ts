import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapSaleItemToReturnLine, calculateReturnTotal } from './returnFormUtils';

for (const unit of ['bottle', 'plastic', 'carton']) {
  test(`${unit} stock returns preserve native quantity and selling value`, () => {
    const line = mapSaleItemToReturnLine({ id: 1, unit, quantity: 5, liter_amount: 5, sell_price: 120 });
    assert.equal(line.max_piece_amount, 5);
    assert.equal(calculateReturnTotal([{ ...line, piece_amount: 5, carton_amount: 0 }]), 600);
  });
}
test('legacy cartons retain actual product package ratio', () => {
  const line = mapSaleItemToReturnLine({ id: 2, unit: 'carton', quantity: 2, liter_amount: 24, sell_price: 1200 }, 12);
  assert.equal(line.max_piece_amount, 24);
  assert.equal(calculateReturnTotal([{ ...line, piece_amount: 24, carton_amount: 0 }], 12), 2400);
});
