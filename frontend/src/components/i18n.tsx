'use client';

import { createContext, useContext, useState } from 'react';
import { bn, type Message } from '@/lib/i18n-catalog';

type Locale = 'en' | 'bn';
const I18nContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
  locale: 'en',
  setLocale: () => {},
});

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  function setLocale(next: Locale) {
    document.cookie = `campus-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = next;
    updateLocale(next);
  }
  return <I18nContext.Provider value={{ locale, setLocale }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  return { ...context, t: (message: Message) => (context.locale === 'bn' ? bn[message] : message) };
}

export function LocaleSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <label className="locale-switch">
      <span>Language / ভাষা</span>{' '}
      <select
        aria-label="Language / ভাষা"
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        <option value="en">English</option>
        <option value="bn">বাংলা</option>
      </select>
    </label>
  );
}
