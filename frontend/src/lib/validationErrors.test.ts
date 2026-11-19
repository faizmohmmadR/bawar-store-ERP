import assert from 'node:assert/strict';
import test from 'node:test';
import { collectFormIssues, collectApiIssues, formatValidationIssues } from './validationErrors';
import { saleApiIssues, saleErrorLabel, setSaleApiErrors } from './saleValidation';
import { createSaleFormSchema, defaultSaleFormValues, defaultSaleItemForType } from './saleFormSchemas';
const t = (key: string, fallback?: string) => fallback || key;

test('required messages identify fields and retain errors on separate rows', () => {
  const errors = { vendor: { type: 'required', message: 'Required' }, items: [undefined, { sell_price: { message: 'Required' } }, { sell_price: { message: 'Required' } }] };
  const result = formatValidationIssues(collectFormIssues(errors), 'Invalid', path => saleErrorLabel(path, t));
  assert.match(result, /Vendor: Required/);
  assert.match(result, /Sale items · #2 · Price: Required/);
  assert.match(result, /Sale items · #3 · Price: Required/);
});
test('form collector ignores circular element refs and handles root errors', () => {
  const ref: Record<string, unknown> = {}; ref.current = ref;
  const issues = collectFormIssues({ items: { root: { message: 'Add items', ref } }, root: { server: { message: 'Period is closed' } } });
  assert.equal(issues.length, 2);
  assert.equal(saleErrorLabel('root.server', t), '');
});
test('nested API errors retain row and field without object stringification', () => {
  const issues = collectApiIssues({ sales_items: { 1: { sell_price: ['Enter positive price'], quantity: ['Not enough stock'] } }, non_field_errors: ['Transaction blocked'] });
  assert.deepEqual(issues.map(issue => issue.path), ['sales_items.1.sell_price', 'sales_items.1.quantity', 'non_field_errors']);
  assert.doesNotMatch(formatValidationIssues(issues, 'Invalid'), /object Object/);
});
test('server row indexes map through blank picker rows and selected quantity units', () => {
  const blank = defaultSaleItemForType('raw_material');
  const piece = { ...blank, raw_material_stock: '2', unit: 'piece' as const };
  const kg = { ...blank, raw_material_stock: '2', unit: 'kg' as const };
  const issues = saleApiIssues({ response: { data: { sales_items: [{}, { quantity: ['Not enough stock'] }] } } }, [blank, piece, blank, kg]);
  assert.deepEqual(issues, [{ path: 'items.3.kilogram_amount', message: 'Not enough stock' }]);
  const calls: { path: string; message: string }[] = [];
  setSaleApiErrors(issues, (path, error) => { calls.push({ path, message: String(error.message) }); });
  assert.equal(calls[0].path, 'items.3.kilogram_amount');
});
test('vendor raw sale does not require hidden customer or unrelated stock controls', () => {
  const data = defaultSaleFormValues();
  Object.assign(data, { party_type: 'vendor', vendor: '3', sale_type: 'raw_material' });
  const item = defaultSaleItemForType('raw_material');
  Object.assign(item, { raw_material_stock: '2', unit: 'piece', piece_amount: 2, sell_price: 5 });
  data.items = [item];
  const input = JSON.parse(JSON.stringify(data));
  delete input.customer; delete input.items[0].stock; delete input.items[0].storage_tank; delete input.items[0].carton_amount;
  assert.equal(createSaleFormSchema(t).safeParse(input).success, true);
  input.vendor = '';
  const invalid = createSaleFormSchema(t).safeParse(input);
  assert.equal(invalid.success, false);
  if (!invalid.success) assert.match(invalid.error.issues.find(issue => issue.path[0] === 'vendor')?.message || '', /Select a vendor/);
});
