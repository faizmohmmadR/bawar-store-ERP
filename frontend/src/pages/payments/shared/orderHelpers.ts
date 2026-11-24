import { getStaticCurrencyById } from '@/components/forms/CurrencySelect';
import { formatCurrencyAmount, resolveCurrencyId } from '@/lib/currencies';
import { PaymentModuleType } from './paymentConfig';

export type OrderRecord = {
  id: number;
  invoice_number?: string;
  total_amount?: number | string;
  final_total?: number | string;
  paid_amount?: number | string;
  remaining_amount?: number | string;
  /** API may send FK id or (rarely) an embedded object. */
  currency?: number | string | { id: number; code?: string; symbol?: string };
  currency_details?: { id: number; code?: string; symbol?: string };
  customer_details?: {
    id?: number;
    name?: string;
  };
  vendor_details?: { id?: number; name?: string };
  preferred_intermediary?: { id: number; name?: string } | null;
};

export function getOrderTotal(order: OrderRecord): number {
  return Number(order.final_total ?? order.total_amount ?? 0);
}

export function getOrderPaid(order: OrderRecord): number {
  return Number(order.paid_amount ?? 0);
}

export function getOrderRemaining(order: OrderRecord): number {
  if (order.remaining_amount != null && order.remaining_amount !== '') {
    return Math.max(0, Number(order.remaining_amount));
  }
  return Math.max(0, getOrderTotal(order) - getOrderPaid(order));
}

export function getOrderCurrency(order: OrderRecord) {
  if (order.currency_details?.id != null) {
    return order.currency_details;
  }
  if (order.currency != null && typeof order.currency === 'object' && order.currency.id != null) {
    return order.currency;
  }
  const id = resolveCurrencyId(order);
  return id ? getStaticCurrencyById(id) || { id: Number(id) } : null;
}

/** Currency form value (id string) from a bill — works when API only sends numeric currency. */
export function getOrderCurrencyId(order: OrderRecord): string {
  return resolveCurrencyId(order);
}

export function getPartyName(order: OrderRecord, type: PaymentModuleType = 'sale'): string {
  if (type === 'purchase') {
    return order.vendor_details?.name || '-';
  }
  return order.customer_details?.name || order.vendor_details?.name || 'Walk-in';
}

export function formatMoney(
  amount: number,
  currency?: { symbol?: string; code?: string } | null,
): string {
  return formatCurrencyAmount(amount, currency, { showCode: true });
}

export function getOrderOptionLabel(order: OrderRecord, type: PaymentModuleType): string {
  const invoice = order.invoice_number || `#${order.id}`;
  const party = getPartyName(order, type);
  const currency = getOrderCurrency(order);
  const remaining = getOrderRemaining(order);
  return `${invoice} — ${party} — ${formatMoney(remaining, currency)} due`;
}
