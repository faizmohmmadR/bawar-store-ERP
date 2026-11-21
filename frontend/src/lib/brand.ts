/** BAWAR Super Store brand constants — matched to logo.png */
export const BRAND = {
  name: 'BAWAR Super Store',
  shortName: 'BAWAR',
  sidebarTitle: 'BAWAR',
  tagline: 'Super Store Management System',
  subtitle: 'Retail ERP',
  description:
    'Comprehensive super store management for inventory, sales, purchases, and retail operations',
  location: 'Afghanistan',
  /** Canonical logo path (public/logo/logo.png) */
  logo: '/logo/logo.png',
  facebook: '',
  website: '',
  colors: {
    black: '#000000',
    white: '#FFFFFF',
    /** Electric blue from the B mark — primary UI */
    primary: '#0E4EC9',
    primaryBright: '#1A63F0',
    primaryDark: '#0A3A96',
    primarySoft: '#E8F0FE',
    /** Neon lime from motion strokes — accents / success only */
    lime: '#6FE800',
    limeSoft: '#F2FFE6',
    /** @deprecated use lime — kept for older call sites */
    secondary: '#6FE800',
    secondarySoft: '#F2FFE6',
    navy: '#050B16',
  },
  hsl: {
    primary: '217 87% 42%',
    primaryDark: '217 88% 32%',
    primaryHover: '217 87% 36%',
    primarySoft: '217 90% 95%',
    lime: '90 100% 45%',
  },
} as const;

export const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND.colors.primary} 0%, ${BRAND.colors.lime} 100%)`;
export const BRAND_HERO_GRADIENT = `linear-gradient(135deg, ${BRAND.colors.navy} 0%, ${BRAND.colors.primary} 55%, ${BRAND.colors.lime} 100%)`;
