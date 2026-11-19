import { formatStoredDate, formatStoredDateTime } from '@/lib/calendarDate';
import type { Language } from '@/i18n';
import { BRAND } from '@/lib/brand';
import { GOOGLE_FONTS_URL, getFontStacks } from '@/lib/fonts';
import { formatListFinanceLine } from '@/lib/listTableFormat';
import { printHtmlInHiddenIframe } from '@/lib/printHtml';
import api from '@/api/client';

export type VendorPrintRow = {
  id: number | string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  finance?: Record<string, {
    total_debit: number;
    total_credit: number;
    balance: number;
    currency?: string;
  }> | null;
};

export type VendorPrintLabels = {
  title: string;
  documentRef: string;
  printedOn: string;
  count: string;
  dateFrom?: string;
  dateTo?: string;
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

export type PrintVendorsReportOptions = {
  vendors: VendorPrintRow[];
  labels: VendorPrintLabels;
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
  finance: VendorPrintRow['finance'],
  field: 'total_debit' | 'total_credit' | 'balance',
): string {
  const text = formatListFinanceLine(finance, field);
  return escapeHtml(text === '—' ? '—' : text);
}

function buildVendorRow(vendor: VendorPrintRow, index: number): string {
  return `
    <tr>
      <td class="col-no">${index + 1}</td>
      <td class="col-name">${fmt(vendor.name)}</td>
      <td class="col-phone">${fmt(vendor.phone)}</td>
      <td class="col-email">${fmt(vendor.email)}</td>
      <td class="col-address">${fmt(vendor.address)}</td>
      <td class="col-amount">${financeCell(vendor.finance, 'total_debit')}</td>
      <td class="col-amount">${financeCell(vendor.finance, 'total_credit')}</td>
      <td class="col-amount amount-balance">${financeCell(vendor.finance, 'balance')}</td>
    </tr>`;
}

function resolveLogoUrl(logoUrl?: string): string {
  if (logoUrl) return logoUrl;
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${BRAND.logo}`;
  }
  return BRAND.logo;
}

function formatMetaDate(value?: string): string {
  if (!value) return '—';
  return escapeHtml(formatStoredDate(value));
}

export function buildVendorsReportHtml(opts: PrintVendorsReportOptions): string {
  const {
    vendors,
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
  const rows = vendors.length
    ? vendors.map((v, i) => buildVendorRow(v, i)).join('')
    : `<tr><td colspan="8" class="empty">${escapeHtml(labels.noData)}</td></tr>`;

  const printedDate = formatStoredDateTime(printedAt, language);

  const docRef = `${printedAt.getFullYear()}${String(printedAt.getMonth() + 1).padStart(2, '0')}${String(printedAt.getDate()).padStart(2, '0')}-${vendors.length}`;

  const dateMetaRows =
    dateFrom || dateTo
      ? `
            <tr><td>${escapeHtml(labels.dateFrom || 'From')}</td><td>${formatMetaDate(dateFrom)}</td></tr>
            <tr><td>${escapeHtml(labels.dateTo || 'To')}</td><td>${formatMetaDate(dateTo)}</td></tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="${language}" dir="${direction}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(labels.title)}</title>
  <link rel="stylesheet" href="${GOOGLE_FONTS_URL}" />
  <style>
    @page { size: A4 landscape; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #fff; color: #111;
      font-family: ${fonts.body}; font-size: 9pt; line-height: 1.35;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .letterhead { border: 1pt solid #ccc; border-radius: 2mm; overflow: hidden; margin-bottom: 5mm; }
    .letterhead-top {
      display: flex; justify-content: space-between; gap: 6mm; padding: 4mm 5mm;
      background: linear-gradient(to bottom, #fafafa 0%, #fff 100%);
    }
    .letterhead-brand { display: flex; align-items: center; gap: 4mm; flex: 1; }
    .logo-wrap {
      width: 18mm; height: 18mm; border: 0.5pt solid #ddd; border-radius: 2mm;
      display: flex; align-items: center; justify-content: center; background: #fff;
    }
    .logo-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .company-text h1 { margin: 0; font-family: ${fonts.heading}; font-size: 13pt; font-weight: 700; }
    .company-text .location { margin: 1mm 0 0; font-size: 8pt; color: #666; }
    .company-text .doc-title {
      margin: 2.5mm 0 0; font-size: 11pt; font-weight: 700; color: ${BRAND.colors.primary};
      text-transform: uppercase;
    }
    .letterhead-meta {
      min-width: 62mm;
      border-${direction === 'rtl' ? 'right' : 'left'}: 1pt solid #e5e5e5;
      padding-${direction === 'rtl' ? 'right' : 'left'}: 5mm;
    }
    .meta-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    .meta-table td { padding: 1.2mm 0; }
    .meta-table td:first-child { color: #555; font-weight: 600; width: 38%; }
    .letterhead-bar {
      height: 3pt;
      background: linear-gradient(90deg, ${BRAND.colors.primary} 0%, ${BRAND.colors.secondary} 100%);
    }
    table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    table.data th {
      background: ${BRAND.colors.primarySoft}; font-weight: 700; font-size: 7.5pt;
      text-transform: uppercase; padding: 2.4mm 2mm; border: 0.5pt solid #bbb;
    }
    table.data td { padding: 2.2mm 2mm; border: 0.5pt solid #ddd; vertical-align: top; }
    tbody tr:nth-child(even) td { background: #f9fafb; }
    .col-no { width: 4%; text-align: center; }
    .col-name { width: 18%; font-weight: 600; }
    .col-phone { width: 11%; }
    .col-email { width: 14%; font-size: 8pt; }
    .col-address { width: 16%; font-size: 8pt; }
    .col-amount {
      width: 10%; text-align: ${direction === 'rtl' ? 'left' : 'right'};
      font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap;
    }
    .amount-balance { color: #b91c1c; }
    .empty { text-align: center; padding: 8mm; color: #666; }
    .footer {
      margin-top: 4mm; padding-top: 2mm; border-top: 0.5pt solid #ddd;
      font-size: 7.5pt; color: #888; display: flex; justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="report">
    <div class="letterhead">
      <div class="letterhead-top">
        <div class="letterhead-brand">
          <div class="logo-wrap"><img src="${logo}" alt="${escapeHtml(BRAND.shortName)}" /></div>
          <div class="company-text">
            <h1>${escapeHtml(BRAND.name)}</h1>
            <p class="location">${escapeHtml(BRAND.location)}</p>
            <p class="doc-title">${escapeHtml(labels.title)}</p>
          </div>
        </div>
        <div class="letterhead-meta">
          <table class="meta-table">
            <tr><td>${escapeHtml(labels.documentRef)}</td><td>${escapeHtml(docRef)}</td></tr>
            <tr><td>${escapeHtml(labels.printedOn)}</td><td>${escapeHtml(printedDate)}</td></tr>
            <tr><td>${escapeHtml(labels.count)}</td><td>${vendors.length}</td></tr>
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

export function printVendorsReport(opts: PrintVendorsReportOptions): void {
  printHtmlInHiddenIframe(buildVendorsReportHtml(opts));
}

export async function fetchVendorsForPrint(
  ids: Array<string | number>,
  cached: Record<string, VendorPrintRow>,
  params?: { date_from?: string; date_to?: string },
): Promise<VendorPrintRow[]> {
  const uniqueIds = [...new Set(ids.map(String))];
  const results: VendorPrintRow[] = [];

  await Promise.all(
    uniqueIds.map(async (id) => {
      const cachedRow = cached[id];
      if (cachedRow?.finance && !params?.date_from && !params?.date_to) {
        results.push(cachedRow);
        return;
      }
      if (cachedRow?.finance && (params?.date_from || params?.date_to)) {
        // Prefer list-cached row already filtered by the same dates.
        results.push(cachedRow);
        return;
      }
      const response = await api.get(`/vendors/${id}/`, { params });
      results.push(response.data);
    }),
  );

  const order = new Map(uniqueIds.map((id, index) => [id, index]));
  return results.sort(
    (a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0),
  );
}
