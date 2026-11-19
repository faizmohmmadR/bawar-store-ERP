import { BRAND } from '@/lib/brand';
import { printHtmlInHiddenIframe } from '@/lib/printHtml';

export type EquipmentLabelData = {
  serial_number?: string | null;
  name?: string | null;
};

/** Print one equipment serial label. */
export function printEquipmentSerialLabel(item: EquipmentLabelData) {
  printEquipmentSerialLabels([item]);
}

/** Print one or many equipment labels on A4 (2-up grid, cut & stick). */
export function printEquipmentSerialLabels(items: EquipmentLabelData[]) {
  const printable = items.filter((item) => (item.serial_number || '').trim());
  if (!printable.length) return;

  const cards = printable.map((item) => buildLabelCard(item)).join('');
  const title =
    printable.length === 1
      ? `Equipment ${(printable[0].serial_number || '').trim()}`
      : `Equipment labels (${printable.length})`;
  const sheetClass = printable.length === 1 ? 'sheet sheet-single' : 'sheet';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6mm 6mm;
      align-content: start;
    }
    .sheet-single {
      grid-template-columns: 90mm;
    }
    .label {
      width: 100%;
      border: 1.5pt solid #111;
      border-radius: 2.5mm;
      padding: 3.5mm 4mm 3mm;
      background: #fff;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .label-top {
      border-bottom: 1pt solid #ddd;
      padding-bottom: 2.5mm;
      margin-bottom: 2.5mm;
    }
    .brand {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 1.5mm;
    }
    .serial {
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: 0.04em;
      line-height: 1.1;
      word-break: break-all;
      margin-bottom: 1.2mm;
    }
    .name {
      font-size: 10pt;
      font-weight: 600;
      line-height: 1.25;
    }
    .barcode-block {
      border-top: 1pt dashed #bbb;
      padding-top: 2mm;
      text-align: center;
    }
    .barcode-block svg {
      display: block;
      width: 100%;
      height: 10mm;
      margin: 0 auto 1.2mm;
    }
    .barcode-text {
      font-family: "Courier New", Courier, monospace;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    @media print {
      .label {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="${sheetClass}">
    ${cards}
  </div>
</body>
</html>`;

  printHtmlInHiddenIframe(html);
}

function buildLabelCard(item: EquipmentLabelData): string {
  const serial = (item.serial_number || '').trim();
  const name = (item.name || '').trim() || '—';
  const barcodeSvg = buildSimpleBarcodeSvg(serial);

  return `
  <div class="label">
    <div class="label-top">
      <div class="brand">${escapeHtml(BRAND.shortName.toUpperCase())} · EQUIPMENT</div>
      <div class="serial">${escapeHtml(serial)}</div>
      <div class="name">${escapeHtml(name)}</div>
    </div>
    <div class="barcode-block">
      ${barcodeSvg}
      <div class="barcode-text">${escapeHtml(serial)}</div>
    </div>
  </div>`;
}

/** Lightweight Code-39-style bars so the serial is machine-scannable on many readers. */
function buildSimpleBarcodeSvg(value: string): string {
  const pattern = encodeCode39(value);
  const module = 1.2;
  let x = 0;
  const bars: string[] = [];
  for (const ch of pattern) {
    const width = ch === 'n' || ch === 'N' ? module : module * 2.4;
    const isBar = ch === 'n' || ch === 'w';
    if (isBar) {
      bars.push(
        `<rect x="${x.toFixed(2)}" y="0" width="${width.toFixed(2)}" height="40" fill="#111"/>`,
      );
    }
    x += width;
  }
  const total = Math.max(x, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total.toFixed(2)} 40" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(value)}">${bars.join('')}</svg>`;
}

function encodeCode39(raw: string): string {
  // n/w = narrow/wide bar; N/W = narrow/wide space. * = start/stop.
  const map: Record<string, string> = {
    '0': 'nnnwwnwnn',
    '1': 'wnnwnnnnw',
    '2': 'nnwwnnnnw',
    '3': 'wnwwnnnnn',
    '4': 'nnnwwnnnw',
    '5': 'wnnwwnnnn',
    '6': 'nnwwwnnnn',
    '7': 'nnnwnnwnw',
    '8': 'wnnwnnwnn',
    '9': 'nnwwnnwnn',
    A: 'wnnnnwnnw',
    B: 'nnwnnwnnw',
    C: 'wnwnnwnnn',
    D: 'nnnnwwnnw',
    E: 'wnnnwwnnn',
    F: 'nnwnwwnnn',
    G: 'nnnnnwwnw',
    H: 'wnnnnwwnn',
    I: 'nnwnnwwnn',
    J: 'nnnnwwwnn',
    K: 'wnnnnnnww',
    L: 'nnwnnnnww',
    M: 'wnwnnnnwn',
    N: 'nnnnwnnww',
    O: 'wnnnwnnwn',
    P: 'nnwnwnnwn',
    Q: 'nnnnnnwww',
    R: 'wnnnnnwwn',
    S: 'nnwnnnwwn',
    T: 'nnnnwnwwn',
    U: 'wwnnnnnnw',
    V: 'nwwnnnnnw',
    W: 'wwwnnnnnn',
    X: 'nwnnwnnnw',
    Y: 'wwnnwnnnn',
    Z: 'nwwnwnnnn',
    '-': 'nwnnnnwnw',
    '.': 'wwnnnnwnn',
    ' ': 'nwwnnnwnn',
    '*': 'nwnnwnwnn',
  };

  const normalized = `*${raw.toUpperCase().replace(/[^0-9A-Z\-\. ]/g, '-') }*`;
  const parts: string[] = [];
  for (const ch of normalized) {
    const code = map[ch] || map['-'];
    // Interleave bars/spaces: pattern chars alternate starting with bar
    let out = '';
    for (let i = 0; i < code.length; i += 1) {
      const wide = code[i] === 'w';
      out += i % 2 === 0 ? (wide ? 'w' : 'n') : wide ? 'W' : 'N';
    }
    parts.push(out);
  }
  return parts.join('N'); // narrow gap between characters
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
