export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Make product media URLs load inside the print iframe (API origin, not the Vite origin). */
export function absoluteMediaUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  const api = String(import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
  const origin = api || window.location.origin;
  if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
  return `${origin}/${trimmed}`;
}

export function renderPrintProductRow(opts: {
  name: string;
  qtyLabel: string;
  imageUrl?: string | null;
}): string {
  const name = opts.name || '—';
  const qty = opts.qtyLabel || '';
  const img = absoluteMediaUrl(opts.imageUrl);
  const letter = escapeHtml((name.trim().charAt(0) || '?').toUpperCase());
  const thumb = img
    ? `<img class="prod-img" src="${escapeHtml(img)}" alt="" />`
    : `<span class="prod-fallback">${letter}</span>`;

  return `
    <div class="prod-row sold">
      <div class="prod-thumb">${thumb}</div>
      <div class="prod-name">${escapeHtml(name)}</div>
      <div class="qty-oval">${escapeHtml(qty)}</div>
    </div>`;
}

export const PRINT_PRODUCT_LIST_CSS = `
    .col-heads {
      display: grid;
      grid-template-columns: 42px 1fr 80px;
      gap: 10px;
      align-items: center;
      font-size: 12px;
      font-weight: 700;
      color: #333;
      margin-bottom: 8px;
      padding: 0 4px 6px;
      border-bottom: 1px solid #e5e5e5;
    }
    .col-heads .head-type { text-align: start; }
    .col-heads .head-qty { text-align: center; }
    .prod-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .prod-row {
      --row-h: 42px;
      display: grid;
      grid-template-columns: 42px 1fr 80px;
      gap: 10px;
      align-items: center;
    }
    .prod-thumb {
      width: 42px;
      height: var(--row-h);
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid #d4d4d4;
      background: #f4f4f5;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .prod-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #fff;
    }
    .prod-fallback {
      font-size: 14px;
      font-weight: 800;
      color: #1f5c24;
    }
    .prod-name {
      font-size: 12.5px;
      font-weight: 700;
      color: #1a1a1a;
      line-height: 1.25;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .prod-row.sold .qty-oval {
      background: #ecfdf5;
      border-color: #16a34a;
      color: #14532d;
    }
    .qty-oval {
      width: 76px;
      min-height: var(--row-h);
      height: auto;
      border: 1.5px solid #46B048;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      background: #fff;
      color: #111;
      justify-self: center;
      box-sizing: border-box;
      text-align: center;
      padding: 4px 6px;
      line-height: 1.15;
    }
`;
