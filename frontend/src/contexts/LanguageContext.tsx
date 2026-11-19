import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, Translations, getCurrentLanguage, saveLanguage, getTranslations, getLanguageDirection } from '@/i18n';
import { applyDocumentFonts } from '@/lib/fonts';

interface LanguageContextType {
  language: Language;
  translations: Translations;
  direction: 'ltr' | 'rtl';
  changeLanguage: (newLanguage: Language) => void;
  t: (
    key: string,
    defaultValue?: string | Record<string, string | number>,
  ) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(getCurrentLanguage());
  const [translations, setTranslations] = useState<Translations>(getTranslations(language));
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(getLanguageDirection(language));

  const changeLanguage = (newLanguage: Language) => {
    setLanguage(newLanguage);
    setTranslations(getTranslations(newLanguage));
    setDirection(getLanguageDirection(newLanguage));
    saveLanguage(newLanguage);
  };

  // Translation function with nested key support and default value
  const t = (
    key: string,
    defaultValue?: string | Record<string, string | number>,
  ): string => {
    const fallback = typeof defaultValue === 'string' ? defaultValue : undefined;
    const keys = key.split('.');
    let value: any = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return fallback || key;
      }
    }

    if (typeof value !== 'string') {
      return fallback || key;
    }
    if (!defaultValue || typeof defaultValue === 'string') {
      return value;
    }

    return value.replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) => (
      name in defaultValue ? String(defaultValue[name]) : placeholder
    ));
  };

  // Update document direction and fonts when language changes
  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = language === 'fa' ? 'fa-AF' : language;
    applyDocumentFonts(language);
  }, [direction, language]);

  const value: LanguageContextType = {
    language,
    translations,
    direction,
    changeLanguage,
    t
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};