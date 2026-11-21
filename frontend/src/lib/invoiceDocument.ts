import { saleDisplayQuantity, saleDisplayPrice } from '@/lib/saleDisplay';
import { getStoredCalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { getFontStacks } from '@/lib/fonts';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import { formatAppDate, formatAppDateTime } from '@/lib/calendarDate';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import type { Language } from '@/i18n';
import type { Sale } from '@/types/sale';

export type InvoiceLabels = {
  invoice: string;
  invoiceNumber: string;
  date: string;
  billTo: string;
  plateNumber: string;
  currency: string;
  product: string;
  liters: string;
  pricePerLiter: string;
  lineTotal: string;
  subtotal: string;
  discount: string;
  total: string;
  grandTotal: string;
  paid: string;
  balance: string;
  notes: string;
  thankYou: string;
  generatedNote: string;
  paymentSummary: string;
};

export type InvoiceDocumentData = {
  sale: Sale;
  appTitle: string;
  appSubtitle: string;
  language: string;
  direction: 'rtl' | 'ltr';
  labels: InvoiceLabels;
  calendar?: CalendarSystem;
};

const toNum = (val: unknown): number => parseFloat(String(val ?? '0')) || 0;

export const getInvoiceComputed = (sale: Sale) => {
  const items = sale.sales_items || sale.items || [];
  const discount = toNum(sale.discount_amount);
  const total = toNum(sale.total_amount);
  const subtotal = total + discount;
  const finalTotal = toNum(sale.final_total || sale.total_amount);
  const paid = sale.vendor ? toNum(sale.vendor_credit?.applied) : toNum(sale.paid_amount);
  const remaining = sale.vendor ? toNum(sale.vendor_credit?.remaining) : finalTotal - paid;
  const currencyCode = sale.currency_details?.code || sale.currency_details?.symbol || '';

  return { items, discount, total, subtotal, finalTotal, paid, remaining, currencyCode };
};

export const INVOICE_PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  .invoice-root {
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --soft: #f8fafc;
    --brand: #0E4EC9;
    --brand-gold: #1A63F0;
    --accent: #6FE800;
    color: var(--ink);
    background: #fff;
    font-size: 11pt;
    line-height: 1.5;
  }

  .invoice-sheet {
    max-width: 210mm;
    margin: 0 auto;
    padding: 14mm 16mm;
  }

  .invoice-accent-bar {
    height: 3px;
    background: linear-gradient(90deg, #000000 0%, #0E4EC9 55%, #6FE800 100%);
    border-radius: 999px;
    margin-bottom: 10mm;
  }

  .invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 10mm;
  }

  .invoice-brand {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .invoice-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: transparent;
    border: none;
  }

  .invoice-logo img {
    width: auto;
    height: 48px;
    max-width: 140px;
    object-fit: contain;
  }

  .invoice-logo-fallback {
    font-size: 20px;
    font-weight: 700;
    color: var(--accent);
  }

  .invoice-company h1 {
    font-size: 15pt;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .invoice-company p {
    margin-top: 2px;
    font-size: 9pt;
    color: var(--muted);
  }

  .invoice-meta {
    text-align: end;
    flex-shrink: 0;
  }

  .invoice-meta h2 {
    font-size: 22pt;
    font-weight: 300;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }

  .invoice-meta-grid {
    display: grid;
    gap: 4px;
    font-size: 9.5pt;
  }

  .invoice-meta-row {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .invoice-meta-row .label {
    color: var(--muted);
    min-width: 72px;
    text-align: end;
  }

  .invoice-meta-row .value {
    font-weight: 600;
    min-width: 120px;
    text-align: end;
  }

  .invoice-status {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 8pt;
    font-weight: 600;
    text-transform: capitalize;
    background: #EBF7EB;
    color: #0E4EC9;
    border: 1px solid #0E4EC955;
  }

  .invoice-status.cancelled {
    background: #fef2f2;
    color: #b91c1c;
    border-color: #fecaca;
  }

  .invoice-status.draft {
    background: #f8fafc;
    color: #475569;
    border-color: #e2e8f0;
  }

  .invoice-parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 8mm;
    padding-bottom: 8mm;
    border-bottom: 1px solid var(--line);
  }

  .invoice-panel-title {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .invoice-customer-name {
    font-size: 12pt;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .invoice-customer-line {
    font-size: 9.5pt;
    color: var(--muted);
    margin-top: 3px;
  }

  .invoice-plate {
    display: inline-flex;
    align-items: center;
    padding: 8px 14px;
    border: 1.5px solid var(--line);
    border-radius: 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    background: var(--soft);
  }

  .invoice-table-wrap {
    margin-bottom: 8mm;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }

  .invoice-table {
    width: 100%;
    border-collapse: collapse;
  }

  .invoice-table thead th {
    background: var(--soft);
    color: var(--muted);
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
    text-align: start;
  }

  .invoice-table thead th.num,
  .invoice-table tbody td.num {
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .invoice-table thead th.center,
  .invoice-table tbody td.center {
    text-align: center;
  }

  .invoice-table tbody td {
    padding: 11px 12px;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
    font-size: 10pt;
  }

  .invoice-table tbody tr:last-child td {
    border-bottom: none;
  }

  .invoice-item-name {
    font-weight: 600;
  }

  .invoice-item-sub {
    margin-top: 2px;
    font-size: 8.5pt;
    color: var(--muted);
  }

  .invoice-bottom {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 20px;
    align-items: start;
    margin-bottom: 8mm;
  }

  .invoice-payment-card {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 14px 16px;
    background: var(--soft);
  }

  .invoice-payment-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 5px 0;
    font-size: 10pt;
  }

  .invoice-payment-row .label { color: var(--muted); }
  .invoice-payment-row.paid .value { color: #0E4EC9; font-weight: 600; }
  .invoice-payment-row.balance .value { color: #c2410c; font-weight: 700; }

  .invoice-totals {
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }

  .invoice-total-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 14px;
    font-size: 10pt;
    border-bottom: 1px solid var(--line);
  }

  .invoice-total-row .label { color: var(--muted); }
  .invoice-total-row .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .invoice-total-row.discount .value { color: #b91c1c; }

  .invoice-grand-total {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 14px;
    background: var(--accent);
    color: #fff;
    font-size: 11pt;
    font-weight: 700;
  }

  .invoice-grand-total .value {
    font-variant-numeric: tabular-nums;
  }

  .invoice-notes {
    margin-bottom: 8mm;
    padding: 12px 14px;
    border: 1px dashed var(--line);
    border-radius: 10px;
    background: #fff;
  }

  .invoice-notes p {
    margin-top: 4px;
    font-size: 10pt;
    color: #334155;
    white-space: pre-wrap;
  }

  .invoice-footer {
    padding-top: 8mm;
    border-top: 1px solid var(--line);
    text-align: center;
  }

  .invoice-footer h3 {
    font-size: 11pt;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .invoice-footer p {
    font-size: 8.5pt;
    color: var(--muted);
  }

  .invoice-footer .generated {
    margin-top: 8px;
    font-size: 8pt;
    color: #94a3b8;
  }

  @media print {
    @page { size: A4; margin: 10mm; }

    body {
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .invoice-sheet {
      max-width: none;
      padding: 0;
    }

    .invoice-grand-total {
      background: #1e293b !important;
      color: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .invoice-status {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;

const formatDate = (
  value?: string,
  language: Language | string = 'en',
  calendar: CalendarSystem = getStoredCalendarSystem(),
) =>
  formatAppDate(value, calendar, {
    language: (language as Language) || 'en',
  });

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const statusClass = (status?: string) => {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'draft') return 'draft';
  return '';
};

export const buildInvoiceHtml = ({
  sale,
  appTitle,
  appSubtitle,
  language,
  direction,
  labels,
  calendar = getStoredCalendarSystem(),
}: InvoiceDocumentData): string => {
  const vendorLabels = language === 'fa'
    ? { billTo: 'فروشنده', paid: 'کسر شده از بل‌های خرید', balance: 'اعتبار باقی‌مانده', invoice: sale.vendor_transaction === 'purchase_return' ? 'برگشت خرید' : 'فروش به فروشنده' }
    : language === 'ps'
      ? { billTo: 'پلورونکی', paid: 'له بیلونو کم شوی', balance: 'پاتې اعتبار', invoice: sale.vendor_transaction === 'purchase_return' ? 'د پېرود بېرته ستنول' : 'پلورونکي ته پلور' }
      : { billTo: 'Vendor', paid: 'Applied to purchases', balance: 'Remaining vendor credit', invoice: sale.vendor_transaction === 'purchase_return' ? 'Purchase return' : 'Sale to vendor' };
  const displayLabels = sale.vendor ? { ...labels, ...vendorLabels } : labels;
  const printFont = getFontStacks(language).body;
  const { items, discount, subtotal, finalTotal, paid, remaining, currencyCode } =
    getInvoiceComputed(sale);

  const customer = sale.vendor_details
    || sale.customer_details
    || (sale.employee_details
      ? { name: sale.employee_details.full_name, phone: sale.employee_details.phone }
      : null);
  const customerName = customer?.name || '—';

  const rowsHtml = items
    .map((item, index) => {
      const liters = saleDisplayQuantity(item);
      const price = saleDisplayPrice(item);
      const lineTotal = liters * price;
      const productName = escapeHtml(String(item.product_details?.name || item.product || '—'));
      const color = escapeHtml(String(item.stock_details?.color || ''));

      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td>
            <div class="invoice-item-name">${productName}</div>
            ${color ? `<div class="invoice-item-sub">${color}</div>` : ''}
          </td>
          <td class="num">${formatOrderNumeric(liters)}</td>
          <td class="num">${formatOrderNumeric(price)}</td>
          <td class="num"><strong>${formatOrderNumeric(lineTotal)}</strong></td>
        </tr>
      `;
    })
    .join('');

  const discountRow =
    discount > 0
      ? `
        <div class="invoice-total-row discount">
          <span class="label">${escapeHtml(displayLabels.discount)} (${sale.discount_percentage || 0}%)</span>
          <span class="value">-${formatOrderNumeric(discount)} ${escapeHtml(currencyCode)}</span>
        </div>
      `
      : '';

  const plateBlock = sale.plate_number
    ? `
      <div>
        <div class="invoice-panel-title">${escapeHtml(displayLabels.plateNumber)}</div>
        <div class="invoice-plate">${escapeHtml(sale.plate_number)}</div>
      </div>
    `
    : `
      <div>
        <div class="invoice-panel-title">${escapeHtml(displayLabels.paymentSummary)}</div>
        <div class="invoice-payment-row">
          <span class="label">${escapeHtml(displayLabels.currency)}</span>
          <span class="value">${escapeHtml(currencyCode || '—')}</span>
        </div>
      </div>
    `;

  const notesBlock = sale.notes
    ? `
      <section class="invoice-notes">
        <div class="invoice-panel-title">${escapeHtml(displayLabels.notes)}</div>
        <p>${escapeHtml(sale.notes)}</p>
      </section>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(language)}" dir="${direction}">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(displayLabels.invoice)} ${escapeHtml(sale.invoice_number || '')}</title>
  <style>
    body { font-family: ${printFont}, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${INVOICE_PRINT_CSS}
  </style>
</head>
<body>
  <div class="invoice-root">
    <div class="invoice-sheet">
      <div class="invoice-accent-bar"></div>

      <header class="invoice-header">
        <div class="invoice-brand">
          <div class="invoice-logo">
            <img src="/logo/logo.png" alt="Logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="invoice-logo-fallback" style="display:none;">${escapeHtml(appTitle.charAt(0))}</div>
          </div>
          <div class="invoice-company">
            <h1>${escapeHtml(appTitle)}</h1>
            <p>${escapeHtml(appSubtitle)}</p>
          </div>
        </div>
        <div class="invoice-meta">
          <h2>${escapeHtml(displayLabels.invoice)}</h2>
          <div class="invoice-meta-grid">
            <div class="invoice-meta-row">
              <span class="label">${escapeHtml(displayLabels.invoiceNumber)}</span>
              <span class="value">${escapeHtml(sale.invoice_number || '—')}</span>
            </div>
            <div class="invoice-meta-row">
              <span class="label">${escapeHtml(displayLabels.date)}</span>
              <span class="value">${escapeHtml(formatDate(sale.sale_date, language, calendar))}</span>
            </div>
            <div class="invoice-meta-row">
              <span class="label"></span>
              <span class="value"><span class="invoice-status ${statusClass(sale.status)}">${escapeHtml(sale.status || '')}</span></span>
            </div>
          </div>
        </div>
      </header>

      <section class="invoice-parties">
        <div>
          <div class="invoice-panel-title">${escapeHtml(displayLabels.billTo)}</div>
          <div class="invoice-customer-name">${escapeHtml(customerName)}</div>
          ${customer?.phone ? `<div class="invoice-customer-line">${escapeHtml(customer.phone)}</div>` : ''}
          ${customer?.email ? `<div class="invoice-customer-line">${escapeHtml(customer.email)}</div>` : ''}
          ${customer?.address ? `<div class="invoice-customer-line">${escapeHtml(customer.address)}</div>` : ''}
        </div>
        ${plateBlock}
      </section>

      <section class="invoice-table-wrap">
        <table class="invoice-table">
          <thead>
            <tr>
              <th class="center" style="width:40px">#</th>
              <th>${escapeHtml(displayLabels.product)}</th>
              <th class="num">${escapeHtml(displayLabels.liters)}</th>
              <th class="num">${escapeHtml(displayLabels.pricePerLiter)}</th>
              <th class="num">${escapeHtml(displayLabels.lineTotal)}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </section>

      <section class="invoice-bottom">
        <div class="invoice-payment-card">
          <div class="invoice-panel-title">${escapeHtml(displayLabels.paymentSummary)}</div>
          <div class="invoice-payment-row">
            <span class="label">${escapeHtml(displayLabels.grandTotal)}</span>
            <span class="value">${formatOrderNumeric(finalTotal)} ${escapeHtml(currencyCode)}</span>
          </div>
          <div class="invoice-payment-row paid">
            <span class="label">${escapeHtml(displayLabels.paid)}</span>
            <span class="value">${formatOrderNumeric(paid)} ${escapeHtml(currencyCode)}</span>
          </div>
          <div class="invoice-payment-row balance">
            <span class="label">${escapeHtml(displayLabels.balance)}</span>
            <span class="value">${formatOrderNumeric(remaining)} ${escapeHtml(currencyCode)}</span>
          </div>
        </div>

        <div class="invoice-totals">
          <div class="invoice-total-row">
            <span class="label">${escapeHtml(displayLabels.subtotal)}</span>
            <span class="value">${formatOrderNumeric(subtotal)} ${escapeHtml(currencyCode)}</span>
          </div>
          ${discountRow}
          <div class="invoice-grand-total">
            <span>${escapeHtml(displayLabels.grandTotal)}</span>
            <span class="value">${formatOrderNumeric(finalTotal)} ${escapeHtml(currencyCode)}</span>
          </div>
        </div>
      </section>

      ${notesBlock}

      <footer class="invoice-footer">
        <h3>${escapeHtml(displayLabels.thankYou)}</h3>
        <p>${escapeHtml(displayLabels.generatedNote)}</p>
        <p class="generated">${escapeHtml(
          formatAppDateTime(new Date(), calendar, (language as Language) || 'en'),
        )}</p>
      </footer>
    </div>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); window.close(); }, 300);
    };
  </script>
</body>
</html>`;
};

export const getInvoiceLabels = (
  t: (key: string, fallback?: string) => string,
): InvoiceLabels => ({
  invoice: t('sales.printInvoice', 'Invoice'),
  invoiceNumber: t('sales.invoiceNumber', 'Invoice #'),
  date: t('sales.saleDate', 'Date'),
  billTo: t('sales.customer', 'Bill To'),
  plateNumber: t('sales.plateNumber', 'Plate Number'),
  currency: t('sales.currency', 'Currency'),
  product: t('sales.product', 'Product'),
  liters: t('sales.quantity', 'Quantity'),
  pricePerLiter: t('sales.pricePerUnit', 'Price / unit'),
  lineTotal: t('sales.total', 'Total'),
  subtotal: t('sales.subtotal', 'Subtotal'),
  discount: t('sales.discount', 'Discount'),
  total: t('sales.totalAmount', 'Total'),
  grandTotal: t('sales.grandTotal', 'Grand Total'),
  paid: t('sales.paid', 'Paid'),
  balance: t('sales.due', 'Balance'),
  notes: t('sales.notes', 'Notes'),
  thankYou: t('sales.invoiceThankYou', 'Thank you for your business'),
  generatedNote: t(
    'sales.invoiceGeneratedNote',
    'This is a computer-generated invoice and does not require a signature.',
  ),
  paymentSummary: t('sales.paymentSummary', 'Payment Summary'),
});
