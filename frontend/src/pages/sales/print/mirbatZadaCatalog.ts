/** Color chips for MirbatZada bill print — keyed by barcode suffix / product name hints. */
export type MirbatZadaProductColor = {
  barcode: string;
  label: string;
  /** Short name printed on the bottle face */
  shortName: string;
  hex: string;
};

export const MIRBAT_ZADA_PRODUCT_COLORS: MirbatZadaProductColor[] = [
  { barcode: 'MIRBAT_ZADA-CLASSIC', label: 'Black', shortName: 'Black', hex: '#1a1a1a' },
  { barcode: 'MIRBAT_ZADA-JUICED', label: 'Purple', shortName: 'Purple', hex: '#6b21a8' },
  { barcode: 'MIRBAT_ZADA-EXOTIC', label: 'Orange', shortName: 'Orange', hex: '#ea580c' },
  { barcode: 'MIRBAT_ZADA-MAX-EXTREME', label: 'Blue', shortName: 'Blue', hex: '#1e3a8a' },
  { barcode: 'MIRBAT_ZADA-COOL', label: 'Teal', shortName: 'Teal', hex: '#0d9488' },
  { barcode: 'MIRBAT_ZADA-WILD', label: 'Violet', shortName: 'Violet', hex: '#7c3aed' },
  { barcode: 'MIRBAT_ZADA-SWEET', label: 'Lime', shortName: 'Lime', hex: '#65a30d' },
  { barcode: 'MIRBAT_ZADA-SPORT', label: 'Red', shortName: 'Red', hex: '#dc2626' },
  { barcode: 'MIRBAT_ZADA-PINA-COLADA', label: 'Yellow', shortName: 'Yellow', hex: '#ca8a04' },
  { barcode: 'MIRBAT_ZADA-FRESH-LEMON-LIME', label: 'Teal', shortName: 'Fresh', hex: '#0d9488' },
  { barcode: 'MIRBAT_ZADA-FRESH-ORANGE', label: 'Orange', shortName: 'Fresh Orange', hex: '#ea580c' },
  { barcode: 'MIRBAT_ZADA-FRESH-MANGO', label: 'Red', shortName: 'Fresh Red', hex: '#dc2626' },
  { barcode: 'MIRBAT_ZADA-FRESH-RASPBERRY', label: 'Purple', shortName: 'Fresh Purple', hex: '#7e22ce' },
  { barcode: 'MIRBAT_ZADA-MOHITO', label: 'Green', shortName: 'Moxito', hex: '#15803d' },
  { barcode: 'MIRBAT_ZADA-FRESH-POMEGRANATE', label: 'Pink', shortName: 'Pomegranate', hex: '#be123c' },
];

const COLOR_BY_BARCODE = Object.fromEntries(
  MIRBAT_ZADA_PRODUCT_COLORS.map((c) => [c.barcode, c]),
);

/** Readable text on a solid bottle color (white or near-black). */
export function contrastTextOn(hex: string): string {
  const raw = hex.replace('#', '');
  if (raw.length !== 6) return '#ffffff';
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.55 ? '#111111' : '#ffffff';
}

export function resolveProductColor(opts: {
  barcode?: string | null;
  name?: string | null;
  description?: string | null;
}): MirbatZadaProductColor {
  const barcode = (opts.barcode || '').trim().toUpperCase();
  if (barcode && COLOR_BY_BARCODE[barcode]) {
    return COLOR_BY_BARCODE[barcode];
  }

  const hay = `${opts.name || ''} ${opts.description || ''}`.toLowerCase();
  for (const entry of MIRBAT_ZADA_PRODUCT_COLORS) {
    if (
      hay.includes(entry.label.toLowerCase()) ||
      hay.includes(entry.shortName.toLowerCase())
    ) {
      return entry;
    }
  }

  return {
    barcode: barcode || 'UNKNOWN',
    label: '—',
    shortName: 'BAWAR',
    hex: '#6FE800',
  };
}
