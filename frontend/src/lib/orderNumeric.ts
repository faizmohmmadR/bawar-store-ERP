import { formatDecimalDisplay } from './decimalDisplay';

/** Decimal precision for sales & purchase quantity, price, and amount fields. */
export const ORDER_NUMERIC_DECIMALS = 4;

/** Return money fields still use 2 decimals in the API model. */
export const RETURN_AMOUNT_DECIMALS = 2;

export const ORDER_NUMERIC_STEP = '0.0001';

export const RETURN_AMOUNT_STEP = '0.01';

/**
 * Round to at most ORDER_NUMERIC_DECIMALS decimal places.
 * Uses string formatting to avoid JSON float noise (e.g. 0.30000000000000004).
 */
export function roundOrderNumeric(value: number): number {
  const fixed = (Number(value) || 0).toFixed(ORDER_NUMERIC_DECIMALS);
  return Number(fixed);
}

export function roundReturnAmount(value: number): number {
  const fixed = (Number(value) || 0).toFixed(RETURN_AMOUNT_DECIMALS);
  return Number(fixed);
}

export function formatOrderNumeric(value: number): string {
  return formatDecimalDisplay(value, ORDER_NUMERIC_DECIMALS);
}

export function formatReturnAmount(value: number): string {
  return formatDecimalDisplay(value, RETURN_AMOUNT_DECIMALS);
}

/** Round a line total from two order numeric operands. */
export function roundOrderLineTotal(quantity: number, unitPrice: number): number {
  return roundOrderNumeric((Number(quantity) || 0) * (Number(unitPrice) || 0));
}
