"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { messages, type Locale } from "./messages";
import { detectLocale } from "./detect";

type I18nCtxValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
};

const I18nCtx = createContext<I18nCtxValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const detected = detectLocale();
    setLocaleState(detected);
    document.documentElement.lang = detected;
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem("launchpad.locale", l);
      document.cookie = `launchpad.locale=${l}; path=/; max-age=604800`;
      document.documentElement.lang = l;
    } catch {}
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      let msg = messages[locale]?.[key];
      if (!msg) return key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          msg = msg.replace(`{${k}}`, v);
        }
      }
      return msg;
    },
    [locale]
  );

  return <I18nCtx.Provider value={{ locale, setLocale, t }}>{children}</I18nCtx.Provider>;
}

export function useI18n(): I18nCtxValue {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export type { Locale };
