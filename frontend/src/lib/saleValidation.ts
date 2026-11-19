import type { FieldPath, UseFormSetError } from 'react-hook-form';
import type { SaleFormValues } from './saleFormSchemas';
import { collectApiIssues, defaultErrorLabel, type ValidationIssue } from './validationErrors';

type Translate = (key: string, fallback?: string) => string;
export function saleErrorLabel(path: string, t: Translate): string {
  const parts = path.split('.').filter(part => !['root', 'server', 'detail', 'non_field_errors'].includes(part));
  const labels: Record<string, string> = {
    customer: t('sales.customer', 'Customer'),
    vendor: t('rawMaterialPurchases.vendor', 'Vendor'),
    employee: t('sales.employee', 'Employee'),
    currency: t('sales.currency', 'Currency'), sale_date: t('sales.saleDate', 'Sale date'),
    items: t('sales.saleItems', 'Sale items'), sales_items: t('sales.saleItems', 'Sale items'),
    raw_material_stock: t('sales.rawMaterial', 'Raw material'), stock: t('sales.product', 'Product'),
    storage_tank: t('sales.selectTank', 'Storage tank'), unit: t('rawMaterials.unit', 'Unit'),
    sell_price: t('sales.price', 'Price'), quantity: t('sales.quantity', 'Quantity'),
    piece_amount: t('sales.quantity', 'Quantity'), kilogram_amount: t('sales.quantity', 'Quantity') + ' (kg)',
    carton_amount: t('sales.quantity', 'Quantity'), liter_amount: t('sales.quantity', 'Quantity'),
    salesman: t('sales.salesman', 'Salesman'), commission_amount: t('sales.commissionPerUnitAfn', 'Commission / Unit (AFN)'),
    party_type: t('rawMaterialSales.partyType', 'Buyer'), transaction_type: t('common.transactionType', 'Type'),
    piece_count: t('rawMaterialPurchases.pieceCount', 'Piece count'), discount: t('sales.discount', 'Discount'),
  };
  return parts.map(part => /^\d+$/.test(part) ? `#${Number(part) + 1}` : labels[part] || part.replace(/_/g, ' ')).join(' · ');
}

export function saleApiIssues(error: unknown, submittedItems: SaleFormValues['items']): ValidationIssue[] {
  const payload = (error as { response?: { data?: unknown } })?.response?.data;
  const visibleIndexes = submittedItems.flatMap((item, index) => item.raw_material_stock ? [index] : []);
  return collectApiIssues(payload).map(issue => {
    const match = issue.path.match(/^(?:sales_items|items)\.(\d+)(?:\.(.*))?$/);
    if (!match) return issue;
    const index = visibleIndexes[Number(match[1])] ?? Number(match[1]);
    let field = match[2] || '';
    if (field === 'quantity') field = submittedItems[index]?.unit === 'kg' ? 'kilogram_amount' : 'piece_amount';
    return { path: `items.${index}${field ? '.' + field : ''}`, message: issue.message };
  });
}

export function setSaleApiErrors(issues: ValidationIssue[], setError: UseFormSetError<SaleFormValues>) {
  const headers = ['customer', 'vendor', 'employee', 'currency', 'sale_date', 'salesman', 'transaction_type', 'party_type', 'notes'];
  const global: string[] = [];
  for (const issue of issues) {
    if (headers.includes(issue.path) || /^items\.\d+\.(raw_material_stock|unit|sell_price|kilogram_amount|piece_amount|commission_amount)$/.test(issue.path)) {
      setError(issue.path as FieldPath<SaleFormValues>, { type: 'server', message: issue.message });
    } else global.push(defaultErrorLabel(issue.path) ? `${defaultErrorLabel(issue.path)}: ${issue.message}` : issue.message);
  }
  if (global.length) setError('root.server', { type: 'server', message: [...new Set(global)].join('\n') });
}

export function revealSaleErrors() {
  requestAnimationFrame(() => document.getElementById('sale-validation-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}
