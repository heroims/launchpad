"use client";

import { useI18n } from "./provider";

export function LocaleToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <button
      className="pill locale-toggle"
      onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
      title={locale === "zh" ? "Switch to English" : "切换到中文"}
    >
      {locale === "zh" ? "EN" : "中文"}
    </button>
  );
}
