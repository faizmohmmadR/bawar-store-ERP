import { convertMass } from './massUnits';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saleDisplayQuantity, saleDisplayPrice, saleDisplayUnit } from './saleDisplay';
import { defaultSaleItemForType, defaultSaleFormValues, saleToFormValues, saleFormToAddPayload } from './saleFormSchemas';
import type { Sale } from '@/types/sale';

test('new tank sales default to kilograms and submit canonical kg quantities', () => {
  const item = { ...defaultSaleItemForType('tank'), storage_tank: '1', kilogram_amount: 2.5, density_kg_per_liter: 2, sell_price: 100 };
  assert.equal(item.unit, 'kg');
  const payload = saleFormToAddPayload({ ...defaultSaleFormValues(), customer: '1', sale_type: 'tank', items: [item] });
  const line = (payload.sales_items as Record<string, unknown>[])[0];
  assert.equal(line.unit, 'kg');
  assert.equal(line.quantity, 2.5);
});

test('historical tank display preserves total money using saved mass rather than current density', () => {
  const item = { sale_source: 'tank', unit: 'liter', quantity: 5, kilogram_amount: 10, sell_price: 100, storage_tank_details: { density_kg_per_liter: 3 } };
  assert.equal(saleDisplayUnit(item), 'kg');
  assert.equal(saleDisplayQuantity(item), 10);
  assert.equal(saleDisplayPrice(item), 50);
  assert.equal(saleDisplayQuantity(item) * saleDisplayPrice(item), 500);
});

test('editing a historical tank sale converts quantity, price and commission consistently', () => {
  const sale = { customer: 1, currency: 1, exchange_rate: 1, sale_date: '2026-10-18T12:00:00Z', items: [{ id: 1, sale_source: 'tank', unit: 'liter', storage_tank: 1, quantity: 5, liter_amount: 5, kilogram_amount: 10, sell_price: 100, commission_amount: 4, storage_tank_details: { density_kg_per_liter: 3 } }] } as unknown as Sale;
  const form = saleToFormValues(sale);
  assert.equal(form.items[0].unit, 'kg');
  assert.equal(form.items[0].kilogram_amount, 10);
  assert.equal(form.items[0].sell_price, 50);
  assert.equal(form.items[0].commission_amount, 2);
});

test('kg/gram conversion is exact, supports local digits and preserves extra precision for validation', () => {
  assert.equal(convertMass('۲۵۰٫۵', 'g', 'kg'), '0.2505');
  assert.equal(convertMass('0.2505', 'kg', 'g'), '250.5');
  assert.equal(convertMass('2.55', 'g', 'kg'), '0.00255');
  assert.equal(convertMass('0.00255', 'kg', 'g'), '2.55');
  assert.equal(convertMass('1', 'kg', 'g'), '1000');
  assert.equal(convertMass('', 'g', 'kg'), '');
});
