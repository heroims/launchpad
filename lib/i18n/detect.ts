import type { Locale } from "./messages";

export function detectLocale(): Locale {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem("launchpad.locale");
      if (stored === "zh" || stored === "en") return stored;
    }
  } catch {}
  try {
    if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
      if (navigator.language.startsWith("zh")) return "zh";
    }
  } catch {}
  return "en";
}

export type { Locale };
