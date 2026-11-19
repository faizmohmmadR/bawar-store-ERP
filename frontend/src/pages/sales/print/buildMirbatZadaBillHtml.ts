import { saleDisplayQuantity, saleDisplayUnit, saleDisplayPrice } from '@/lib/saleDisplay';
import { getStoredCalendarSystem } from '@/contexts/CalendarPreferenceContext';
import { formatAppDate } from '@/lib/calendarDate';
import { formatOrderNumeric } from '@/lib/orderNumeric';
import {
  PRINT_PRODUCT_LIST_CSS,
  escapeHtml,
  renderPrintProductRow,
} from '@/lib/printBillShared';
import type { CalendarSystem } from '@/contexts/CalendarPreferenceContext';
import type { Sale, SaleItem } from '@/types/sale';

/** Bill UI is always Pashto (matches the Mirbat Zada paper bill). */
export type MirbatZadaBillLabels = {
  billTitle: string;
  date: string;
  customerName: string;
  address: string;
  quantity: string;
  item: string;
  unitPrice: string;
  total: string;
  received: string;
  remaining: string;
  note: string;
  signature: string;
  type: string;
  qtyHeader: string;
  companyTitle: string;
  companySubtitle: string;
  invoiceNo: string;
};

const toNum = (val: unknown): number => parseFloat(String(val ?? '0')) || 0;

function productFromItem(item: SaleItem) {
  return (
    item.product_details ||
    item.stock_details?.product ||
    (typeof item.product === 'object' ? item.product : null) ||
    null
  );
}

function itemQty(item: SaleItem): number {
  return saleDisplayQuantity(item);
}

function itemUnitLabel(item: Pick<SaleItem, 'unit' | 'sale_source'>): string {
  const unit = saleDisplayUnit(item).toLowerCase();
  const labels: Record<string, string> = {
    kg: 'کیلوگرام',
    carton: 'کارتن',
    bottle: 'بوتل',
    dana: 'بوتل',
    plastic: 'پلاستیک',
    piece: 'ټوټه',
  };
  return labels[unit] || unit;
}

function itemQtyLabel(item: SaleItem): string {
  return `${formatOrderNumeric(itemQty(item))} ${itemUnitLabel(item)}`;
}

function itemName(item: SaleItem): string {
  const product = productFromItem(item) as { name?: string } | null;
  return product?.name || '—';
}

function itemImage(item: SaleItem): string | null {
  const product = productFromItem(item) as { image?: string | null } | null;
  return product?.image || null;
}

/** Fixed Pashto labels for the sales bill (always, regardless of UI language). */
export function getMirbatZadaBillLabels(
  t: (key: string, fallback?: string) => string,
): MirbatZadaBillLabels {
  return {
    billTitle: 'د میربت زاده د خرڅلاو بیل',
    date: 'نېټه',
    customerName: 'د پیرودونکي نوم',
    address: 'ادرس یا موقعیت',
    quantity: 'تعداد',
    item: 'جنس',
    unitPrice: 'في نرخ',
    total: 'جمله',
    received: 'رسیدګي',
    remaining: 'باقي',
    note: 'نوټ',
    signature: 'لاسلیک / ټاپه',
    type: 'نوعیت',
    qtyHeader: 'تعداد',
    companyTitle: t('core.app.title', 'د میربت زاده د پاکوونکو موادو شرکت'),
    companySubtitle: t('core.app.subtitle', 'ERP سیسټم'),
    invoiceNo: 'د بیل شمېره',
  };
}

export function buildMirbatZadaBillHtml(opts: {
  sale: Sale;
  labels: MirbatZadaBillLabels;
  calendar?: CalendarSystem;
  logoUrl?: string;
}): string {
  const {
    sale,
    labels,
    calendar = getStoredCalendarSystem(),
    logoUrl = `${window.location.origin}/logo.jpeg`,
  } = opts;

  const displayLabels = sale.vendor ? { ...labels,
    billTitle: sale.vendor_transaction === 'purchase_return' ? 'د پېرود بېرته ستنول' : 'پلورونکي ته د پلور بیل',
    customerName: 'د پلورونکي نوم', received: 'له بیلونو کم شوی', remaining: 'پاتې اعتبار',
  } : labels;
  const items = (sale.sales_items || sale.items || []).filter((item) => itemQty(item) > 0);
  const finalTotal = toNum(sale.final_total || sale.total_amount);
  const paid = sale.vendor ? toNum(sale.vendor_credit?.applied) : toNum(sale.paid_amount);
  const remaining = sale.vendor ? toNum(sale.vendor_credit?.remaining) : Math.max(0, finalTotal - paid);
  const currency = sale.currency_details?.code || sale.currency_details?.symbol || '';
  const money = (n: number) =>
    `${formatOrderNumeric(n)}${currency ? ` ${currency}` : ''}`;

  const dateStr = formatAppDate(sale.sale_date, calendar, {
    language: 'ps',
  });

  const customer = sale.vendor_details
    || sale.customer_details
    || (sale.employee_details
      ? { name: sale.employee_details.full_name, phone: sale.employee_details.phone }
      : null);
  const customerName = customer?.name || '—';
  const addressParts = [customer?.address, customer?.phone].filter(Boolean);
  const address = addressParts.length ? addressParts.join(' · ') : '—';

  const quantitiesByUnit = new Map<string, number>();
  items.forEach((item) => {
    const unit = saleDisplayUnit(item).toLowerCase();
    quantitiesByUnit.set(unit, (quantitiesByUnit.get(unit) || 0) + itemQty(item));
  });
  const totalQty = Array.from(quantitiesByUnit, ([unit, quantity]) => {
    const label = itemUnitLabel({ unit });
    return `${formatOrderNumeric(quantity)} ${label}`;
  }).join('، ');
  const soldNames = items.map((item) => `${itemName(item)} (${itemQtyLabel(item)})`);
  const itemSummary = soldNames.length ? soldNames.join('، ') : '—';

  const unitPriceLabel =
    items.length === 1 ? money(saleDisplayPrice(items[0])) : items.length > 1 ? '—' : money(0);

  const productCards = items
    .map((item) =>
      renderPrintProductRow({
        name: itemName(item),
        qtyLabel: itemQtyLabel(item),
        imageUrl: itemImage(item),
      }),
    )
    .join('');

  const field = (label: string, value: string) => `
    <div class="field">
      <span class="field-label">${escapeHtml(label)}</span>
      <span class="field-dots"></span>
      <span class="field-value">${escapeHtml(value)}</span>
    </div>`;

  return `<!DOCTYPE html>
<html lang="ps">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(displayLabels.billTitle)} — ${escapeHtml(sale.invoice_number || '')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Noto Naskh Arabic', 'Segoe UI', Tahoma, Arial, sans-serif;
      color: #1a1a1a;
      background: #fff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 10mm 12mm 8mm;
      display: flex;
      flex-direction: column;
      direction: ltr;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      margin-bottom: 8px;
      direction: rtl;
    }
    .logo {
      width: 128px;
      height: 128px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .company { text-align: center; min-width: 0; }
    .company-title {
      font-size: 22px;
      font-weight: 800;
      color: #1f5c24;
      line-height: 1.35;
    }
    .company-sub {
      font-size: 13px;
      font-weight: 600;
      color: #555;
      margin-top: 3px;
    }
    .invoice-ref {
      margin-top: 5px;
      font-size: 12px;
      color: #666;
    }

    .rule {
      height: 4px;
      background: linear-gradient(90deg, #46B048 0%, #46B048 72%, #B78D2E 72%, #B78D2E 100%);
      margin: 8px 0 12px;
      border-radius: 2px;
    }
    .rule.thin { height: 3px; margin: 12px 0 8px; }

    .body {
      display: grid;
      grid-template-columns: 0.95fr 1.05fr;
      gap: 40px;
      column-gap: 48px;
      flex: 1;
      align-items: start;
    }
    .col-products {
      direction: ltr;
      text-align: left;
      padding-inline-end: 16px;
      border-inline-end: 1px dashed #d4d4d4;
    }
    .col-info {
      direction: rtl;
      text-align: right;
      padding-inline-start: 8px;
    }
    ${PRINT_PRODUCT_LIST_CSS}

    .bill-title {
      text-align: center;
      font-size: 15px;
      font-weight: 800;
      color: #1f5c24;
      margin-bottom: 14px;
      line-height: 1.4;
    }
    .field {
      display: flex;
      flex-direction: row;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 11px;
      font-size: 12.5px;
      direction: rtl;
    }
    .field-label {
      white-space: nowrap;
      font-weight: 700;
      color: #222;
    }
    .field-dots {
      flex: 1;
      border-bottom: 1px dotted #999;
      min-width: 24px;
      transform: translateY(-3px);
    }
    .field-value {
      font-weight: 600;
      max-width: 58%;
      text-align: left;
      unicode-bidi: plaintext;
    }
    .note-box {
      margin-top: 14px;
      border: 1px solid #cfcfcf;
      border-radius: 6px;
      min-height: 220px;
      padding: 12px 14px;
      background: #fafafa;
      direction: rtl;
      text-align: right;
    }
    .note-label { font-size: 13px; font-weight: 700; color: #444; margin-bottom: 8px; }
    .note-body { font-size: 12px; color: #333; white-space: pre-wrap; line-height: 1.5; }
    .signature {
      margin-top: 28px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      direction: rtl;
    }
    .signature-line {
      display: inline-block;
      min-width: 160px;
      border-bottom: 1px dotted #777;
      margin-left: 8px;
    }

    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 11px;
      font-weight: 600;
      color: #333;
      direction: rtl;
    }
    .footer-brand { color: #1f5c24; }
    .footer-inv { color: #666; }

    @media print {
      @page { size: A4; margin: 8mm; }
      body { margin: 0; }
      .sheet { width: auto; min-height: auto; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <header class="header">
      <img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo" onerror="this.style.display='none'" />
      <div class="company">
        <div class="company-title">${escapeHtml(displayLabels.companyTitle)}</div>
        <div class="company-sub">${escapeHtml(displayLabels.companySubtitle)}</div>
        <div class="invoice-ref">${escapeHtml(displayLabels.invoiceNo)}: ${escapeHtml(sale.invoice_number || '—')}</div>
      </div>
    </header>
    <div class="rule"></div>

    <div class="body">
      <section class="col-products">
        <div class="col-heads">
          <span></span>
          <span class="head-type">${escapeHtml(displayLabels.type)}</span>
          <span class="head-qty">${escapeHtml(displayLabels.qtyHeader)}</span>
        </div>
        <div class="prod-list">
          ${productCards}
        </div>
      </section>

      <section class="col-info">
        <div class="bill-title">${escapeHtml(displayLabels.billTitle)}</div>
        ${field(displayLabels.date, dateStr)}
        ${field(displayLabels.customerName, customerName)}
        ${field(displayLabels.address, address)}
        ${field(displayLabels.quantity, totalQty || '—')}
        ${field(displayLabels.item, itemSummary)}
        ${field(displayLabels.unitPrice, unitPriceLabel)}
        ${field(displayLabels.total, money(finalTotal))}
        ${field(displayLabels.received, money(paid))}
        ${field(displayLabels.remaining, money(remaining))}
        <div class="note-box">
          <div class="note-label">${escapeHtml(displayLabels.note)}</div>
          <div class="note-body">${escapeHtml(sale.notes || '')}</div>
        </div>
        <div class="signature">
          <span class="signature-line"></span>
          ${escapeHtml(displayLabels.signature)}
        </div>
      </section>
    </div>

    <div class="rule thin"></div>
    <footer class="footer">
      <span class="footer-brand">${escapeHtml(displayLabels.companyTitle)}</span>
      <span class="footer-inv">${escapeHtml(sale.invoice_number || '')}</span>
    </footer>
  </div>
</body>
</html>`;
}
