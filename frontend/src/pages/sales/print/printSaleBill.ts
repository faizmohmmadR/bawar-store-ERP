import api from '@/api/client';
import { printHtmlInHiddenIframe } from '@/lib/printHtml';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import type { Sale } from '@/types/sale';
import { buildMirbatZadaBillHtml, getMirbatZadaBillLabels } from './buildMirbatZadaBillHtml';

export type PrintSaleBillOptions = {
  /** Full sale with line items. If omitted, `saleId` is fetched. */
  sale?: Sale;
  saleId?: string | number;
  language: string;
  direction: 'rtl' | 'ltr';
  calendar?: CalendarSystem;
  t: (key: string, fallback?: string) => string;
};

async function resolveSale(opts: PrintSaleBillOptions): Promise<Sale> {
  if (opts.sale?.sales_items?.length || opts.sale?.items?.length) {
    return opts.sale;
  }
  const id = opts.saleId ?? opts.sale?.id;
  if (id == null) {
    throw new Error('Sale id is required to print');
  }
  const { data } = await api.get<Sale>(`/sales/${id}/`);
  return data;
}

/**
 * Print a Mirbat Zada sales bill directly (no navigation / popup window).
 * Bill language is always Pashto; layout matches the paper bill.
 */
export async function printSaleBill(opts: PrintSaleBillOptions): Promise<void> {
  const sale = await resolveSale(opts);
  const labels = getMirbatZadaBillLabels(opts.t);
  const html = buildMirbatZadaBillHtml({
    sale,
    labels,
    calendar: opts.calendar,
  });
  printHtmlInHiddenIframe(html);
}

export { getMirbatZadaBillLabels, buildMirbatZadaBillHtml } from './buildMirbatZadaBillHtml';
