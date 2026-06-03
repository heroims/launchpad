import { describe, expect, it, vi, afterEach } from "vitest";
import { detectLocale } from "@/lib/i18n/detect";

describe("detectLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 'en' when localStorage empty and navigator.language is en-US", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(detectLocale()).toBe("en");
  });

  it("returns 'zh' when localStorage empty and navigator.language starts with zh", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("navigator", { language: "zh-CN" });
    expect(detectLocale()).toBe("zh");
  });

  it("returns stored value from localStorage overriding navigator", () => {
    vi.stubGlobal("localStorage", { getItem: () => "en" });
    vi.stubGlobal("navigator", { language: "zh-CN" });
    expect(detectLocale()).toBe("en");
  });

  it("returns stored zh from localStorage when navigator is non-zh", () => {
    vi.stubGlobal("localStorage", { getItem: () => "zh" });
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(detectLocale()).toBe("zh");
  });

  it("defaults to 'en' on server (no localStorage, no navigator)", () => {
    vi.stubGlobal("localStorage", undefined);
    vi.stubGlobal("navigator", undefined);
    expect(detectLocale()).toBe("en");
  });
});
