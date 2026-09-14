"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  defaultLocale,
  parseLocale,
  persistLocale,
  type Locale,
} from "./config";
import { dictionaries } from "./messages";
import {
  translate,
  type MessageKey,
  type TranslateFn,
  type TranslateVars,
} from "./translate";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
};

const I18nContext = createContext<I18nValue | null>(null);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    parseLocale(initialLocale),
  );

  const setLocale = useCallback((next: Locale) => {
    const locale = parseLocale(next);
    setLocaleState(locale);
    persistLocale(locale);
  }, []);

  const t = useCallback<TranslateFn>(
    (key: MessageKey, vars?: TranslateVars) =>
      translate(dictionaries[locale], key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LocaleProvider");
  }
  return ctx;
}

export { defaultLocale };
