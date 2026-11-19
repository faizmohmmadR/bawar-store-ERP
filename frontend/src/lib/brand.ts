/** Mirbat Zada Detergent Production Co. brand constants */
export const BRAND = {
  name: 'Mirbat Zada Detergent Production Co.',
  shortName: 'MBZ',
  sidebarTitle: 'Mirbat Zada',
  tagline: 'MBZ — Cleaner Future',
  subtitle: 'Detergent Production',
  description: 'Detergent production ERP for Mirbat Zada',
  location: 'Afghanistan',
  logo: '/logo.jpeg',
  facebook: '',
  website: '',
  colors: {
    black: '#111111',
    white: '#FFFFFF',
    /** Brand color 1st — orange */
    primary: '#F59E1A',
    /** Brand color 2nd — blue */
    secondary: '#1F76D1',
    /** Soft washes derived from brand colors */
    primarySoft: '#FFF4DF',
    secondarySoft: '#EAF3FF',
  },
  /** HSL channels for CSS variables (space-separated, no hsl()) */
  hsl: {
    primary: '38 92% 53%',
    primaryDark: '32 84% 39%',
    primaryHover: '35 92% 48%',
    primarySoft: '38 100% 94%',
    accent: '212 71% 47%',
    accentSoft: '212 73% 95%',
  },
} as const;

export const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND.colors.primary} 0%, ${BRAND.colors.secondary} 100%)`;
export const BRAND_HERO_GRADIENT = `linear-gradient(135deg, ${BRAND.colors.black} 0%, ${BRAND.colors.secondary} 50%, ${BRAND.colors.primary} 100%)`;
