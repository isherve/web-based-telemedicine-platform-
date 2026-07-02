import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import en from '../i18n/en.json';
import rw from '../i18n/rw.json';
import type { Language } from '../data/types';

type Dict = Record<string, string>;
const dictionaries: Record<Language, Dict> = { en, rw };
const LOCALE_KEY = 'gara.locale';

interface LocaleContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggle: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(
    () => (localStorage.getItem(LOCALE_KEY) as Language) || 'en'
  );

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LOCALE_KEY, lang);
  }, []);

  const toggle = useCallback(() => {
    setLanguage(language === 'en' ? 'rw' : 'en');
  }, [language, setLanguage]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = dictionaries[language][key] ?? dictionaries.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return str;
    },
    [language]
  );

  const value = useMemo(
    () => ({ language, setLanguage, toggle, t }),
    [language, setLanguage, toggle, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
