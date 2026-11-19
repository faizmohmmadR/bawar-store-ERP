import type { Language } from '@/i18n';

export interface FontStacks {
  body: string;
  heading: string;
}

/** Single source of truth for UI typography per language. */
export const FONT_STACKS: Record<Language, FontStacks> = {
  en: {
    body: "'Inter', 'Nunito Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    heading: "'Montserrat', 'Inter', system-ui, sans-serif",
  },
  fa: {
    body: "'Vazirmatn', Tahoma, 'Segoe UI', sans-serif",
    heading: "'Vazirmatn', Tahoma, 'Segoe UI', sans-serif",
  },
  ps: {
    body: "'Noto Sans Arabic', Tahoma, 'Segoe UI', sans-serif",
    heading: "'Noto Sans Arabic', Tahoma, 'Segoe UI', sans-serif",
  },
};

/** Root font size per language — scales all rem-based UI text. */
export const FONT_BASE_SIZES: Record<Language, string> = {
  en: '18px',
  fa: '19px',
  ps: '20px',
};

export const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&family=Nunito+Sans:wght@400;500;600&family=Vazirmatn:wght@400;500;600;700&display=swap';

export function getFontStacks(language: Language): FontStacks {
  return FONT_STACKS[language] ?? FONT_STACKS.en;
}

export function getFontBaseSize(language: Language): string {
  return FONT_BASE_SIZES[language] ?? FONT_BASE_SIZES.en;
}

export function applyDocumentFonts(language: Language): void {
  if (typeof document === 'undefined') return;

  const stacks = getFontStacks(language);
  const root = document.documentElement;

  root.style.setProperty('--font-body', stacks.body);
  root.style.setProperty('--font-heading', stacks.heading);
  root.style.setProperty('--font-size-root', getFontBaseSize(language));
}
