import { formatStoredDate, formatStoredDateTime } from '@/lib/calendarDate';
import type { Language } from '@/i18n';
import { BRAND } from '@/lib/brand';
import { GOOGLE_FONTS_URL, getFontStacks } from '@/lib/fonts';
import { formatListFinanceLine } from '@/lib/listTableFormat';
import { printHtmlInHiddenIframe } from '@/lib/printHtml';
import api from '@/api/client';

export type CustomerPrintRow = {
  id: number | string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  is_active?: boolean;
  finance?: Record<string, {
    total_debit: number;
    total_credit: number;
    balance: number;
    currency?: string;
  }> | null;
};

export type CustomerPrintLabels = {
  title: string;
  documentRef: string;
  printedOn: string;
  count: string;
  colNo: string;
  colName: string;
  colPhone: string;
  colEmail: string;
  colAddress: string;
  colTotal: string;
  colPaid: string;
  colBalance: string;
  noData: string;
};

export type PrintCustomersReportOptions = {
  customers: CustomerPrintRow[];
  labels: CustomerPrintLabels & { dateFrom?: string; dateTo?: string };
  language?: Language;
  direction?: 'ltr' | 'rtl';
  printedAt?: Date;
  logoUrl?: string;
  dateFrom?: string;
  dateTo?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(value: string | null | undefined, fallback = '—'): string {
  const trimmed = (value || '').trim();
  return trimmed ? escapeHtml(trimmed) : fallback;
}

function financeCell(
  finance: CustomerPrintRow['finance'],
  field: 'total_debit' | 'total_credit' | 'balance',
): string {
  const text = formatListFinanceLine(finance, field);
  return escapeHtml(text === '—' ? '—' : text);
}

function balanceToneClass(finance: CustomerPrintRow['finance']): string {
  if (!finance) return 'amount-balance';
  const overall = finance.overall;
  if (overall) {
    return overall.balance < 0 ? 'amount-negative' : 'amount-balance';
  }
  const codes = Object.keys(finance).filter((key) => key !== 'overall');
  if (codes.length === 1) {
    return finance[codes[0]].balance < 0 ? 'amount-negative' : 'amount-balance';
  }
  return 'amount-balance';
}

function buildCustomerRow(customer: CustomerPrintRow, index: number): string {
  const balanceClass = balanceToneClass(customer.finance);

  return `
    <tr>
      <td class="col-no">${index + 1}</td>
      <td class="col-name">${fmt(customer.name)}</td>
      <td class="col-phone">${fmt(customer.phone)}</td>
      <td class="col-email">${fmt(customer.email)}</td>
      <td class="col-address">${fmt(customer.address)}</td>
      <td class="col-amount">${financeCell(customer.finance, 'total_debit')}</td>
      <td class="col-amount">${financeCell(customer.finance, 'total_credit')}</td>
      <td class="col-amount ${balanceClass}">${financeCell(customer.finance, 'balance')}</td>
    </tr>`;
}

function resolveLogoUrl(logoUrl?: string): string {
  if (logoUrl) return logoUrl;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${BRAND.logo}`;
  }
  return BRAND.logo;
}

export function buildCustomersReportHtml(opts: PrintCustomersReportOptions): string {
  const {
    customers,
    labels,
    language = 'en',
    direction = 'ltr',
    printedAt = new Date(),
    logoUrl,
    dateFrom,
    dateTo,
  } = opts;

  const fonts = getFontStacks(language);
  const logo = escapeHtml(resolveLogoUrl(logoUrl));
  const rows = customers.length
    ? customers.map((c, i) => buildCustomerRow(c, i)).join('')
    : `<tr><td colspan="8" class="empty">${escapeHtml(labels.noData)}</td></tr>`;

  const printedDate = formatStoredDateTime(printedAt, language);

  const docRef = `${printedAt.getFullYear()}${String(printedAt.getMonth() + 1).padStart(2, '0')}${String(printedAt.getDate()).padStart(2, '0')}-${customers.length}`;

  const dateMetaRows =
    dateFrom || dateTo
      ? `
            <tr><td>${escapeHtml(labels.dateFrom || 'From')}</td><td>${escapeHtml(formatStoredDate(dateFrom, language))}</td></tr>
            <tr><td>${escapeHtml(labels.dateTo || 'To')}</td><td>${escapeHtml(formatStoredDate(dateTo, language))}</td></tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="${language}" dir="${direction}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(labels.title)}</title>
  <link rel="stylesheet" href="${GOOGLE_FONTS_URL}" />
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm 12mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: ${fonts.body};
      font-size: 9pt;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report { width: 100%; }
    .letterhead {
      border: 1pt solid #ccc;
      border-radius: 2mm;
      overflow: hidden;
      margin-bottom: 5mm;
    }
    .letterhead-top {
      display: flex;
      align-items: stretch;
      justify-content: space-between;
      gap: 6mm;
      padding: 4mm 5mm;
      background: linear-gradient(to bottom, #fafafa 0%, #fff 100%);
    }
    .letterhead-brand {
      display: flex;
      align-items: center;
      gap: 4mm;
      flex: 1;
      min-width: 0;
    }
    .logo-wrap {
      flex-shrink: 0;
      width: 18mm;
      height: 18mm;
      border: 0.5pt solid #ddd;
      border-radius: 2mm;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .logo-wrap img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .company-text h1 {
      margin: 0;
      font-family: ${fonts.heading};
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: #111;
      line-height: 1.2;
    }
    .company-text .location {
      margin: 1mm 0 0;
      font-size: 8pt;
      color: #666;
    }
    .company-text .doc-title {
      margin: 2.5mm 0 0;
      font-size: 11pt;
      font-weight: 700;
      color: ${BRAND.colors.primary};
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .letterhead-meta {
      flex-shrink: 0;
      min-width: 62mm;
      border-${direction === 'rtl' ? 'right' : 'left'}: 1pt solid #e5e5e5;
      padding-${direction === 'rtl' ? 'right' : 'left'}: 5mm;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
    }
    .meta-table td {
      padding: 1.2mm 0;
      vertical-align: top;
    }
    .meta-table td:first-child {
      color: #555;
      font-weight: 600;
      white-space: nowrap;
      padding-${direction === 'rtl' ? 'left' : 'right'}: 3mm;
      width: 38%;
    }
    .meta-table td:last-child {
      color: #111;
      font-weight: 500;
    }
    .letterhead-bar {
      height: 3pt;
      background: linear-gradient(90deg, ${BRAND.colors.primary} 0%, ${BRAND.colors.secondary} 100%);
    }
    table.data {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    table.data th {
      background: ${BRAND.colors.primarySoft};
      color: #111;
      font-weight: 700;
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2.4mm 2mm;
      border: 0.5pt solid #bbb;
      vertical-align: bottom;
    }
    table.data td {
      padding: 2.2mm 2mm;
      border: 0.5pt solid #ddd;
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }
    tbody tr:nth-child(even) td { background: #f9fafb; }
    .col-no { width: 4%; text-align: center; }
    .col-name { width: 18%; font-weight: 600; }
    .col-phone { width: 11%; }
    .col-email { width: 14%; font-size: 8pt; }
    .col-address { width: 16%; font-size: 8pt; }
    .col-amount {
      width: 10%;
      text-align: ${direction === 'rtl' ? 'left' : 'right'};
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      white-space: nowrap;
      font-size: 8.5pt;
    }
    .amount-balance { color: #b91c1c; }
    .amount-negative { color: #1d4ed8; }
    .empty { text-align: center; padding: 8mm; color: #666; }
    .footer {
      margin-top: 4mm;
      padding-top: 2mm;
      border-top: 0.5pt solid #ddd;
      font-size: 7.5pt;
      color: #888;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    @media print {
      table.data thead th { background: ${BRAND.colors.primarySoft} !important; }
      .letterhead-bar { background: ${BRAND.colors.primary} !important; }
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="letterhead">
      <div class="letterhead-top">
        <div class="letterhead-brand">
          <div class="logo-wrap">
            <img src="${logo}" alt="${escapeHtml(BRAND.shortName)}" />
          </div>
          <div class="company-text">
            <h1>${escapeHtml(BRAND.name)}</h1>
            <p class="location">${escapeHtml(BRAND.location)}</p>
            <p class="doc-title">${escapeHtml(labels.title)}</p>
          </div>
        </div>
        <div class="letterhead-meta">
          <table class="meta-table">
            <tr>
              <td>${escapeHtml(labels.documentRef)}</td>
              <td>${escapeHtml(docRef)}</td>
            </tr>
            <tr>
            </tr>
            <tr>
              <td>${escapeHtml(labels.printedOn)}</td>
              <td>${escapeHtml(printedDate)}</td>
            </tr>
            <tr>
              <td>${escapeHtml(labels.count)}</td>
              <td>${customers.length}</td>
            </tr>
            ${dateMetaRows}
          </table>
        </div>
      </div>
      <div class="letterhead-bar"></div>
    </div>

    <table class="data">
      <thead>
        <tr>
          <th class="col-no">${escapeHtml(labels.colNo)}</th>
          <th class="col-name">${escapeHtml(labels.colName)}</th>
          <th class="col-phone">${escapeHtml(labels.colPhone)}</th>
          <th class="col-email">${escapeHtml(labels.colEmail)}</th>
          <th class="col-address">${escapeHtml(labels.colAddress)}</th>
          <th class="col-amount">${escapeHtml(labels.colTotal)}</th>
          <th class="col-amount">${escapeHtml(labels.colPaid)}</th>
          <th class="col-amount">${escapeHtml(labels.colBalance)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="footer">
      <span>${escapeHtml(BRAND.name)}</span>
      <span>${escapeHtml(labels.title)} · ${escapeHtml(docRef)}</span>
    </div>
  </div>
</body>
</html>`;
}

export function printCustomersReport(opts: PrintCustomersReportOptions): void {
  const html = buildCustomersReportHtml(opts);
  printHtmlInHiddenIframe(html);
}

/** Fetch full customer rows (with finance) for selected ids, using cache when possible. */
export async function fetchCustomersForPrint(
  ids: Array<string | number>,
  cached: Record<string, CustomerPrintRow>,
  params?: { date_from?: string; date_to?: string },
): Promise<CustomerPrintRow[]> {
  const uniqueIds = [...new Set(ids.map(String))];
  const results: CustomerPrintRow[] = [];

  await Promise.all(
    uniqueIds.map(async (id) => {
      const cachedRow = cached[id];
      if (cachedRow?.finance) {
        results.push(cachedRow);
        return;
      }
      const response = await api.get(`/customers/${id}/`, { params });
      results.push(response.data);
    }),
  );

  const order = new Map(uniqueIds.map((id, index) => [id, index]));
  return results.sort(
    (a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0),
  );
}
