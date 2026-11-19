import { formatStoredDateTime } from '@/lib/calendarDate';
export interface PrintTableColumn {
  title: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

export interface PrintTableFooterCell {
  text: string;
  colspan?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
}

export interface PrintTableOptions {
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  columns: PrintTableColumn[];
  rows: string[][];
  footerRows?: PrintTableFooterCell[][];
  landscape?: boolean;
  fontFamily?: string;
  logoUrl?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintDocument(options: PrintTableOptions): string {
  const { title, subtitle, metadata, columns, rows, footerRows, landscape = true, fontFamily, logoUrl } = options;
  const generatedAt = formatStoredDateTime(new Date());

  const metaHtml = metadata
    ? Object.entries(metadata)
        .map(
          ([key, value]) =>
            `<div class="meta-item"><span class="meta-label">${escapeHtml(key)}:</span> ${escapeHtml(value)}</div>`,
        )
        .join('')
    : '';

  const colgroup = columns
    .map((col) => `<col${col.width ? ` style="width:${col.width}"` : ''} />`)
    .join('');

  const thead = columns
    .map(
      (col) =>
        `<th style="text-align:${col.align || 'left'}">${escapeHtml(col.title)}</th>`,
    )
    .join('');

  const tbody = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, index) =>
              `<td style="text-align:${columns[index]?.align || 'left'}">${escapeHtml(cell)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');

  const tfoot = footerRows?.length
    ? `<tfoot>${footerRows
        .map(
          (footerRow) =>
            `<tr class="total-row">${footerRow
              .map(
                (cell) =>
                  `<td colspan="${cell.colspan || 1}" style="text-align:${cell.align || 'left'}"${
                    cell.bold ? ' class="bold"' : ''
                  }>${escapeHtml(cell.text)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('')}</tfoot>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: ${fontFamily ? fontFamily : 'Arial, Helvetica, sans-serif'};
      font-size: 11px;
      color: #111;
      margin: 0;
      padding: 16px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header { margin-bottom: 14px; border-bottom: 2px solid #222; padding-bottom: 10px; display: flex; align-items: center; gap: 12px; }
    .logo { height: 48px; width: 48px; object-fit: contain; }
    .header-content { flex: 1; }
    .title { font-size: 16px; font-weight: 700; margin: 0 0 4px; line-height: 1.2; }
    .subtitle { font-size: 12px; color: #444; margin: 0 0 8px; }
    .meta { display: flex; flex-wrap: wrap; gap: 8px 20px; font-size: 11px; }
    .meta-label { font-weight: 600; }
    .generated { margin-top: 6px; font-size: 10px; color: #666; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td {
      border: 1px solid #ccc;
      padding: 5px 6px;
      vertical-align: top;
      word-wrap: break-word;
    }
    th {
      background: #f3f4f6;
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    tbody tr:nth-child(even) { background: #fafafa; }
    tfoot td { background: #f3f4f6; font-weight: 600; border-top: 2px solid #999; }
    .bold { font-weight: 700; }
    @media print {
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" class="logo" />` : ''}
    <div class="header-content">
      <h1 class="title">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
      ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ''}
      <div class="generated">${escapeHtml(generatedAt)}</div>
    </div>
  </div>
  <table>
    <colgroup>${colgroup}</colgroup>
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
    ${tfoot}
  </table>
</body>
</html>`;
}

/** Print a table via a hidden iframe — no layout shift, clean browser print dialog. */
export function printTable(options: PrintTableOptions): void {
  const html = buildPrintDocument(options);
  const iframe = document.createElement('iframe');
  iframe.setAttribute(
    'style',
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden',
  );
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const doc = frameWindow?.document;
  if (!doc || !frameWindow) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  };

  frameWindow.onafterprint = cleanup;
  frameWindow.focus();
  frameWindow.print();

  // Fallback cleanup if onafterprint is not supported
  setTimeout(cleanup, 2000);
}
