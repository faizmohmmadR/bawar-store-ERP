import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pricePerPieceFromCarton } from './packaging';
import { normalizeWesternDigits, numericDraftMatches, getNumericInputMode } from './numericInput';

test('Dari, Pashto and Arabic digits normalize to English decimal numbers', () => {
  for (const input of ['۱۲۳٫۴۵', '١٢٣٫٤٥', '۱۲۳.۴۵', '۱۲۳,۴۵', '123.45']) {
    assert.equal(normalizeWesternDigits(input), '123.45');
  }
  assert.equal(normalizeWesternDigits('-۱۲٫۵'), '-12.5');
  assert.equal(normalizeWesternDigits('۱٬۲۳۴٫۵۰'), '1234.50');
  assert.equal(normalizeWesternDigits('1,234.50'), '1234.50');
  assert.equal(normalizeWesternDigits('\u200f۱۲٫۵\u061c'), '12.5');
});

test('numeric parents preserve decimal points, zero fractions and intermediate entry', () => {
  for (const [value, draft] of [[12, '12.'], [12.3, '12.30'], [0, '0.'], [0, '.'], [0, '-'], [0, '']] as const) {
    assert.equal(numericDraftMatches(value, draft), true);
  }
  assert.equal(numericDraftMatches(25, '12.'), false);
  assert.equal(numericDraftMatches('', '12.'), false);
  assert.equal(numericDraftMatches(0, '12x'), false);
});

test('amounts use decimal keyboards and whole counts use numeric keyboards', () => {
  for (const step of [undefined, 'any', '0.01', 0.0001]) assert.equal(getNumericInputMode(step), 'decimal');
  assert.equal(getNumericInputMode(1), 'numeric');
});

test('forms hiding zero preserve fractional entry', () => {
  for (const draft of ['0', '0.', '0.0', '0.00', '.']) assert.equal(numericDraftMatches('', draft), true);
  for (const draft of ['0.001', '0.0012', '0.125']) {
    assert.equal(numericDraftMatches(Number(draft), draft), true);
    assert.equal(numericDraftMatches('', draft), false);
  }
});

test('stock carton prices convert to API precision without floating point noise', () => {
  assert.equal(pricePerPieceFromCarton(0.1, 8), 0.0125);
  assert.equal(pricePerPieceFromCarton(1, 3), 0.3333);
});


import { formatOrderNumeric, formatReturnAmount, roundOrderNumeric } from './orderNumeric';
import { formatCurrencyAmount } from './currencies';
import { formatDecimalDisplay } from './decimalDisplay';
import { formatPrice } from './formatNumber';

test('whole order quantities and amounts have no padded decimal places', () => {
  assert.equal(formatOrderNumeric(18), '18');
  assert.equal(formatOrderNumeric(2000), '2,000');
  assert.equal(formatOrderNumeric(0), '0');
  assert.equal(formatOrderNumeric(-2000), '-2,000');
});

test('fractional order amounts retain meaningful digits up to four places', () => {
  assert.equal(formatOrderNumeric(2000.5), '2,000.5');
  assert.equal(formatOrderNumeric(12.3400), '12.34');
  assert.equal(formatOrderNumeric(0.0001), '0.0001');
  assert.equal(formatOrderNumeric(12.34567), '12.3457');
  assert.equal(formatOrderNumeric(0.1 + 0.2), '0.3');
  assert.equal(roundOrderNumeric(12.34567), 12.3457);
});

test('currency and return formatters omit trailing zeros and retain symbols', () => {
  assert.equal(formatCurrencyAmount(2000, { symbol: '؋', code: 'AFN' }), '؋2,000');
  assert.equal(formatCurrencyAmount(12.1, { symbol: '؋', code: 'AFN' }), '؋13');
  assert.equal(formatCurrencyAmount('12.5000', { symbol: '$', code: 'USD' }, { showCode: true }), '$12.5 USD');
  assert.equal(formatCurrencyAmount(12, { symbol: '$', code: 'USD' }), '$12.0');
  assert.equal(formatReturnAmount(12.5), '12.5');
  assert.equal(formatReturnAmount(12), '12');
  assert.equal(formatPrice(12), '12');
  assert.equal(formatPrice(12.1), '13');
  assert.equal(formatPrice(12.5, 'USD'), '12.5');
  assert.equal(formatDecimalDisplay(NaN), '0');
  assert.equal(formatOrderNumeric(-0.00001), '0');
});
