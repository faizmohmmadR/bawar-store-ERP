import { getStoredCalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { buildInvoiceHtml, getInvoiceLabels, type InvoiceLabels } from '@/lib/invoiceDocument';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { Sale } from '@/types/sale';

interface PrintInvoiceOptions {
  sale: Sale;
  language: string;
  direction: 'rtl' | 'ltr';
  appTitle: string;
  appSubtitle: string;
  labels?: InvoiceLabels;
  calendar?: CalendarSystem;
  t?: (key: string, fallback?: string) => string;
}

export const printInvoice = ({
  sale,
  language,
  direction,
  appTitle,
  appSubtitle,
  labels,
  calendar = getStoredCalendarSystem(),
  t,
}: PrintInvoiceOptions) => {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('Please allow popups to print the invoice');
    return;
  }

  const resolvedLabels = labels || getInvoiceLabels(t || ((_, fallback) => fallback || ''));

  const html = buildInvoiceHtml({
    sale,
    appTitle,
    appSubtitle,
    language,
    direction,
    labels: resolvedLabels,
    calendar,
  });

  printWindow.document.write(html);
  printWindow.document.close();
};
