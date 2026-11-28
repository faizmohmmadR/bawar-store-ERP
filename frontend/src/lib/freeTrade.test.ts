import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaleFormSchema, defaultSaleFormValues, defaultSaleItemForType, saleFormToAddPayload } from './saleFormSchemas';
import { createRawMaterialPurchaseFormSchema, defaultRawMaterialPurchaseFormValues, rawMaterialPurchaseFormToAddPayload } from './rawMaterialPurchaseFormSchemas';
const t = (key: string, fallback?: string) => fallback || key;
for (const source of ['stock', 'tank', 'raw_material'] as const) {
  test(`free ${source} sale needs quantity but no price`, () => {
    const data = defaultSaleFormValues();
    data.customer = '1'; data.transaction_type = 'free'; data.sale_type = source;
    const item = defaultSaleItemForType(source);
    Object.assign(item, { stock: source === 'stock' ? '1' : '', storage_tank: source === 'tank' ? '1' : '',
      raw_material_stock: source === 'raw_material' ? '1' : '', unit: source === 'stock' ? 'bottle' : 'kg',
      raw_material_unit: 'kg', piece_amount: 3, kilogram_amount: 3, liter_amount: 3, density_kg_per_liter: 1 });
    data.items = [item];
    const schema = createSaleFormSchema(t);
    assert.equal(schema.safeParse(data).success, true, JSON.stringify(schema.safeParse(data)));
    assert.equal(schema.safeParse({ ...data, transaction_type: 'paid' }).success, false);
    data.items[0].sell_price = 50;
    const payload = saleFormToAddPayload(data);
    assert.equal(payload.transaction_type, 'free');
    assert.equal(payload.total_amount, 0);
    assert.equal(payload.sales_items[0].sell_price, 0);
    assert.equal(payload.sales_items[0].quantity, 3);
  });
}
test('free purchase accepts zero price and payload discards supplied prices', () => {
  const data = defaultRawMaterialPurchaseFormValues();
  data.vendor = '1'; data.transaction_type = 'free';
  Object.assign(data.items[0], { raw_material: '1', quantity: 3, price_per_unit: 0 });
  const schema = createRawMaterialPurchaseFormSchema(t);
  assert.equal(schema.safeParse(data).success, true, JSON.stringify(schema.safeParse(data)));
  assert.equal(schema.safeParse({ ...data, transaction_type: 'paid' }).success, false);
  data.items[0].price_per_unit = 50;
  const payload = rawMaterialPurchaseFormToAddPayload(data);
  assert.equal(payload.total_amount, 0);
  assert.equal(payload.purchase_items[0].price_per_unit, 0);
  assert.equal(payload.purchase_items[0].quantity, 3);
});

for (const operation of ['sale', 'purchase_return'] as const) {
  test(`raw material ${operation} selects a vendor without a customer`, () => {
    const data = defaultSaleFormValues();
    Object.assign(data, { party_type: 'vendor', vendor: '7', vendor_transaction: operation, customer: '', sale_type: 'raw_material' });
    const item = defaultSaleItemForType('raw_material');
    Object.assign(item, { raw_material_stock: '2', unit: 'piece', piece_amount: 4, sell_price: 5 });
    data.items = [item];
    const schema = createSaleFormSchema(t);
    assert.equal(schema.safeParse(data).success, true, JSON.stringify(schema.safeParse(data)));
    const payload = saleFormToAddPayload(data);
    assert.equal(payload.customer, null);
    assert.equal(payload.vendor, 7);
    assert.equal(payload.vendor_transaction, operation);
    assert.equal(payload.sales_items[0].quantity, 4);
    assert.equal(schema.safeParse({ ...data, vendor: '' }).success, false);
    assert.equal(schema.safeParse({ ...data, sale_type: 'stock' }).success, false);
    if (operation === 'purchase_return') assert.equal(schema.safeParse({ ...data, transaction_type: 'free' }).success, false);
  });
}

test('kg-stock piece sales preserve the selected piece unit and price basis', () => {
  const data = defaultSaleFormValues(); data.customer = '1'; data.sale_type = 'raw_material';
  const item = defaultSaleItemForType('raw_material');
  Object.assign(item, { raw_material_stock: '1', raw_material_unit: 'kg', unit: 'piece', piece_amount: 3, sell_price: 20 });
  data.items = [item];
  assert.equal(createSaleFormSchema(t).safeParse(data).success, true);
  const payload = saleFormToAddPayload(data);
  assert.equal(payload.sales_items[0].unit, 'piece');
  assert.equal(payload.sales_items[0].quantity, 3);
  assert.equal(payload.total_amount, 60);
});
test('piece-stock kg sales require a saved conversion and send only kg quantity', () => {
  const data = defaultSaleFormValues(); data.customer = '1'; data.sale_type = 'raw_material';
  const item = defaultSaleItemForType('raw_material');
  Object.assign(item, { raw_material_stock: '1', raw_material_unit: 'piece', unit: 'kg', kilogram_amount: 2, sell_price: 20, piece_count: 0 });
  data.items = [item];
  assert.equal(createSaleFormSchema(t).safeParse(data).success, false);
  data.items[0].raw_weight_per_piece_kg = 0.4;
  assert.equal(createSaleFormSchema(t).safeParse(data).success, true);
  const payload = saleFormToAddPayload(data);
  assert.equal(payload.sales_items[0].unit, 'kg');
  assert.equal(payload.sales_items[0].quantity, 2);
  assert.equal(payload.sales_items[0].piece_count, 0);
  assert.equal(payload.total_amount, 40);
});

test('USD sales submit USD unit prices and a total calculated from those prices', () => {
  const data = defaultSaleFormValues();
  data.customer = '1';
  data.currency = '2';
  data.sale_type = 'raw_material';
  data.discount = 10;
  const item = defaultSaleItemForType('raw_material');
  Object.assign(item, {
    raw_material_stock: '1',
    unit: 'piece',
    piece_amount: 3,
    sell_price: 250,
  });
  data.items = [item];

  const payload = saleFormToAddPayload(data, { afnPerUsd: 100 });
  assert.equal(payload.sales_items[0].sell_price, 2.5);
  assert.equal(payload.total_amount, 6.75);
});
