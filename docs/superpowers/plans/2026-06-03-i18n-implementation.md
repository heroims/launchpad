# i18n 中英文切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a locale toggle (zh/en) that switches all visible UI strings on the workbench and sign pages, plus client-side translation of API error codes.

**Architecture:** Lightweight DIY React Context (`I18nProvider`) with two flat translation dictionaries (`messages[zh|en]`). Layout inline `<script>` for the `lang` attribute; React provider reads `localStorage` → `navigator.language` at mount. API errors keep their server `code`; the client maps codes via `t("errors." + code)`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Vitest (Node env, no jsdom), no new npm deps.

---

### File map

| File | Action |
|---|---|
| `lib/i18n/messages.ts` | Create — translation dictionary |
| `lib/i18n/detect.ts` | Create — `detectLocale()` |
| `lib/i18n/provider.tsx` | Create — `I18nProvider` + `useI18n()` |
| `lib/i18n/LocaleToggle.tsx` | Create — topbar toggle |
| `tests/i18n-detect.test.ts` | Create — detect tests |
| `app/layout.tsx` | Modify — inline script for `<html lang>` |
| `lib/wallet/browser-wallet.ts` | Modify — `getWalletDetectionMessage` → code return |
| `lib/launch/workbench-flow.ts` | Modify — error helpers → code return; `redactFeeRecipientsForDisplay` accept `t` |
| `app/page.tsx` | Modify — wrap Provider + toggle + replace all strings + map error codes |
| `app/sign/[id]/page.tsx` | Modify — read cookie + inline `t()` |
| `AGENTS.md` | Modify — i18n notes |

---

### Task 1: `lib/i18n/messages.ts` — Translation dictionary

**Files:**
- Create: `lib/i18n/messages.ts`

- [ ] **Step 1: Create file**

```ts
export type Locale = "zh" | "en";

export const messages: Record<Locale, Record<string, string>> = {
  zh: {
    "header.title": "Solana 聚合发射工作台",
    "header.subtitle": "AI 生成草案，后端校验和构造 unsigned transaction，用户钱包最终签名。",
    "header.connectWallet": "连接 {label}",
    "header.disconnect": "断开",
    "header.redetectWallet": "重新检测钱包",
    "form.title": "Launch 输入",
    "form.walletAddress": "钱包地址",
    "form.walletPlaceholder": "连接钱包后自动填充，也可以手动输入",
    "form.mintPublicKey": "Mint Public Key",
    "form.mintPlaceholder": "生成本次 launch 的 mint keypair",
    "form.generateMint": "生成 Mint",
    "form.mintNote": "mint 私钥仅保存在当前浏览器 sessionStorage；后端只接收 public key。",
    "form.goal": "目标",
    "form.tokenName": "Token 名称",
    "form.symbol": "Symbol",
    "form.budgetSol": "预算 SOL",
    "form.firstBuyEnabled": "是否首买",
    "form.firstBuyCreateOnly": "只创建",
    "form.firstBuyCreateAndBuy": "创建并首买",
    "form.firstBuyAmountSol": "首买 SOL",
    "form.firstBuySlippageBps": "首买滑点 bps",
    "form.targetPlatform": "目标平台",
    "form.agentRecommend": "Agent 推荐",
    "form.description": "描述",
    "form.imageUri": "图片 URI",
    "form.generateDraft": "生成草案",
    "form.validateDraft": "校验草案",
    "form.buildTransaction": "构建待签交易",
    "form.skillPrepare": "Skill 一键准备",
    "form.footnote": "当前版本返回待签名交易 payload；浏览器钱包负责签名和发送，平台不托管私钥或代签。",
    "ai.title": "AI Provider 本地加密",
    "ai.provider": "Provider",
    "ai.baseUrl": "Base URL",
    "ai.model": "Model",
    "ai.apiKey": "API Key",
    "ai.encryptPassword": "本地加密密码",
    "ai.encryptSave": "本地加密保存",
    "ai.unlockSession": "解锁到本次会话",
    "ai.footnote": "密钥只存 localStorage 的 AES-GCM 密文；请求时临时发给 API，不写入数据库。",
    "result.title": "API 输出",
    "result.recommendationTitle": "推荐原因",
    "result.feeConfirmTitle": "签名前费用确认",
    "result.serviceFee": "服务费",
    "result.totalEstimated": "预估总额",
    "result.transactionCount": "交易数量",
    "result.signTitle": "待签交易",
    "result.signAndSend": "签名并发送",
    "result.signing": "正在请求钱包签名并发送...",
    "result.sent": "已发送 {count} 笔交易。",
    "result.noResult": "还没有请求结果。",
    "result.redacted": "已隐藏",
    "result.feeRecipientRedacted": "Fee recipient: 已隐藏",
    "wallet.connects": "{label} 已连接。",
    "wallet.disconnects": "钱包已断开。",
    "wallet.requiresConnection": "请先连接钱包再签名发送。",
    "wallet.requiresMintKey": "当前交易需要 mint keypair 签名，但本浏览器会话没有对应 mint 私钥。请重新生成 Mint 后再构造交易。",
    "wallet.notDetected": "没有检测到 Phantom/Solflare 钱包扩展。请使用已安装钱包扩展的浏览器打开，或安装后点击重新检测。",
    "wallet.noSignSend": "{label} 已检测到，但当前钱包不支持签名并发送交易。请升级钱包扩展，或换用支持 signAndSendTransaction 的钱包。",
    "wallet.detected": "{label} 已检测到，请先连接钱包。",
    "wallet.connectFailed": "钱包连接失败。",
    "provider.needsApiKey": "选择 Agent 推荐时，请先填写或解锁 AI Provider API Key。",
    "common.signSendFailed": "签名或发送失败。",
    "errors.schema_invalid": "请求数据格式无效。",
    "errors.wallet_invalid": "钱包地址不是有效的 Solana 公钥。",
    "errors.mint_invalid": "Mint 公钥不是有效的 Solana 公钥。",
    "errors.token_name_required": "Token 名称是必填项。",
    "errors.token_name_too_long": "Token 名称不能超过 32 个字符。",
    "errors.token_symbol_invalid": "Token Symbol 必须是 2-10 位字母数字。",
    "errors.image_uri_invalid": "图片 URI 必须是 http(s) URL。",
    "errors.metadata_uri_invalid": "元数据 URI 必须是 http(s) URL。",
    "errors.budget_too_low": "预算至少需要 {min} SOL。",
    "errors.budget_too_high": "预算最多 {max} SOL。",
    "errors.first_buy_amount_invalid": "首买金额必须大于 0 SOL。",
    "errors.first_buy_slippage_invalid": "首买滑点必须在 0-5000 bps 之间。",
    "errors.meteora_minimum_out_default_zero": "Meteora DBC 首买将使用 minimumAmountOut=0。",
    "errors.description_empty": "描述可以提升 launch 元数据和下游预览效果。",
    "errors.build_not_validated": "请先通过草案校验，再构建待签交易。",
    "errors.draft_before_validate": "请先生成草案，再校验草案。",
    "errors.unknown": "发生未知错误。",
  },
  en: {
    "header.title": "Solana Aggregated Launch Workstation",
    "header.subtitle": "AI-generated drafts, backend validation & unsigned transaction building, user wallet signing.",
    "header.connectWallet": "Connect {label}",
    "header.disconnect": "Disconnect",
    "header.redetectWallet": "Re-detect Wallet",
    "form.title": "Launch Input",
    "form.walletAddress": "Wallet Address",
    "form.walletPlaceholder": "Auto-filled after wallet connect, or enter manually",
    "form.mintPublicKey": "Mint Public Key",
    "form.mintPlaceholder": "Generate a mint keypair for this launch",
    "form.generateMint": "Generate Mint",
    "form.mintNote": "Mint secret key stays in sessionStorage; backend only sees the public key.",
    "form.goal": "Goal",
    "form.tokenName": "Token Name",
    "form.symbol": "Symbol",
    "form.budgetSol": "Budget (SOL)",
    "form.firstBuyEnabled": "First Buy",
    "form.firstBuyCreateOnly": "Create Only",
    "form.firstBuyCreateAndBuy": "Create & Buy",
    "form.firstBuyAmountSol": "First Buy (SOL)",
    "form.firstBuySlippageBps": "Slippage (bps)",
    "form.targetPlatform": "Target Platform",
    "form.agentRecommend": "Agent Recommended",
    "form.description": "Description",
    "form.imageUri": "Image URI",
    "form.generateDraft": "Generate Draft",
    "form.validateDraft": "Validate Draft",
    "form.buildTransaction": "Build Transaction",
    "form.skillPrepare": "Skill Prepare",
    "form.footnote": "Returns unsigned transaction payloads. Wallet handles signing and sending; platform never holds private keys.",
    "ai.title": "AI Provider (Local Encryption)",
    "ai.provider": "Provider",
    "ai.baseUrl": "Base URL",
    "ai.model": "Model",
    "ai.apiKey": "API Key",
    "ai.encryptPassword": "Encryption Password",
    "ai.encryptSave": "Encrypt & Save",
    "ai.unlockSession": "Unlock for This Session",
    "ai.footnote": "Key stored as AES-GCM ciphertext in localStorage, sent temporarily to API during request.",
    "result.title": "API Output",
    "result.recommendationTitle": "Recommendation Reasons",
    "result.feeConfirmTitle": "Fee Confirmation (Pre-sign)",
    "result.serviceFee": "Service Fee",
    "result.totalEstimated": "Total Estimated",
    "result.transactionCount": "Transactions",
    "result.signTitle": "Transactions to Sign",
    "result.signAndSend": "Sign & Send",
    "result.signing": "Requesting wallet signature...",
    "result.sent": "Sent {count} transaction(s).",
    "result.noResult": "No result yet.",
    "result.redacted": "[redacted]",
    "result.feeRecipientRedacted": "Fee recipient: [redacted]",
    "wallet.connects": "{label} connected.",
    "wallet.disconnects": "Wallet disconnected.",
    "wallet.requiresConnection": "Connect your wallet first.",
    "wallet.requiresMintKey": "This transaction requires the mint keypair, but this session has no mint secret. Re-generate the Mint before building.",
    "wallet.notDetected": "No Phantom/Solflare wallet detected. Open this page in a browser with the wallet extension installed, or install it and re-detect.",
    "wallet.noSignSend": "{label} detected, but this wallet does not support signAndSendTransaction. Upgrade the extension or use a compatible wallet.",
    "wallet.detected": "{label} detected. Connect your wallet.",
    "wallet.connectFailed": "Wallet connection failed.",
    "provider.needsApiKey": "Enter or unlock an AI Provider API Key to use Agent recommendations.",
    "common.signSendFailed": "Signing or sending failed.",
    "errors.schema_invalid": "Invalid request data format.",
    "errors.wallet_invalid": "Wallet address is not a valid Solana public key.",
    "errors.mint_invalid": "Mint public key is not a valid Solana public key.",
    "errors.token_name_required": "Token name is required.",
    "errors.token_name_too_long": "Token name must be 32 characters or fewer.",
    "errors.token_symbol_invalid": "Token symbol must be 2-10 uppercase letters or numbers.",
    "errors.image_uri_invalid": "Image URI must be an http(s) URL.",
    "errors.metadata_uri_invalid": "Metadata URI must be an http(s) URL when provided.",
    "errors.budget_too_low": "Minimum budget is {min} SOL for this template.",
    "errors.budget_too_high": "Maximum budget is {max} SOL for this template.",
    "errors.first_buy_amount_invalid": "First buy amount must be greater than 0 SOL.",
    "errors.first_buy_slippage_invalid": "First buy slippage must be between 0 and 5000 bps.",
    "errors.meteora_minimum_out_default_zero": "Meteora DBC first buy will use minimumAmountOut=0.",
    "errors.description_empty": "A description improves launch metadata and downstream previews.",
    "errors.build_not_validated": "Validate the draft before building a transaction.",
    "errors.draft_before_validate": "Generate a draft first, then validate it.",
    "errors.unknown": "An unknown error occurred.",
  },
};
```

- [ ] **Step 2: Verify file parses**

Run: `npx tsc --noEmit lib/i18n/messages.ts`
Expected: No errors.

---

### Task 2: i18n infrastructure — detect.ts, provider.tsx, LocaleToggle.tsx, tests

**Files:**
- Create: `lib/i18n/detect.ts`
- Create: `lib/i18n/provider.tsx`
- Create: `lib/i18n/LocaleToggle.tsx`
- Create: `tests/i18n-detect.test.ts`

- [ ] **Step 1: Create `lib/i18n/detect.ts`**

```ts
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
```

- [ ] **Step 2: Create `lib/i18n/provider.tsx`**

```tsx
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
```

- [ ] **Step 3: Create `lib/i18n/LocaleToggle.tsx`**

```tsx
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
```

- [ ] **Step 4: Create `tests/i18n-detect.test.ts`**

```ts
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
```

- [ ] **Step 5: Run tests**

Run: `pnpm test`  
Expected: All 5 new tests pass; existing tests still pass.

---

### Task 3: Modify `app/layout.tsx` — inline script for `<html lang>`

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update layout with inline script**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Launchpad",
  description: "API-first Solana launch workstation"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var l=localStorage.getItem("launchpad.locale");if(l!="zh"&&l!="en")l=navigator.language?.startsWith("zh")?"zh":"en";document.documentElement.lang=l}catch(e){}})()`
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

### Task 4: Modify helpers to return i18n codes

**Files:**
- Modify: `lib/wallet/browser-wallet.ts`
- Modify: `lib/launch/workbench-flow.ts`

- [ ] **Step 1: `lib/wallet/browser-wallet.ts` — change `getWalletDetectionMessage` return type**

Replace the function:

```ts
export function getWalletDetectionMessage(wallet: DetectedSolanaWallet | null): { code: string; params?: Record<string, string> } {
  if (!wallet) {
    return { code: "wallet.notDetected" };
  }
  if (!wallet.provider.signAndSendTransaction) {
    return { code: "wallet.noSignSend", params: { label: wallet.label } };
  }
  return { code: "wallet.detected", params: { label: wallet.label } };
}
```

- [ ] **Step 2: `lib/launch/workbench-flow.ts` — change `getAgentRecommendationProviderWarning`**

Replace function at line 65:

```ts
export function getAgentRecommendationProviderWarning(input: { preferredPlatform?: string; apiKey?: string }): { code: string } | null {
  if (input.preferredPlatform) return null;
  if (input.apiKey?.trim()) return null;
  return { code: "provider.needsApiKey" };
}
```

- [ ] **Step 3: `lib/launch/workbench-flow.ts` — change `redactFeeRecipientsForDisplay`**

Replace the function to accept a `redactedLabel` parameter:

```ts
export function redactFeeRecipientsForDisplay(value: unknown, redactedLabel = "已隐藏"): unknown {
  if (Array.isArray(value)) return value.map((item) => redactFeeRecipientsForDisplay(item, redactedLabel));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        key === "feeRecipient" ? redactedLabel : redactFeeRecipientsForDisplay(entry, redactedLabel)
      ])
    );
  }
  if (typeof value === "string" && value.toLowerCase().startsWith("fee recipient:")) {
    return `Fee recipient: ${redactedLabel}`;
  }
  return value;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test`  
Expected: Existing tests pass (no test imports these functions directly).

---

### Task 5: Modify `app/page.tsx` — the big transformation

**Files:**
- Modify: `app/page.tsx`

This is the heaviest task. Every Chinese hardcoded string in the JSX (there are ~85) must be replaced with `t("key")` or `t("key", { param })`. The structural changes are:

1. Import `I18nProvider`, `useI18n`, `LocaleToggle`
2. Wrap the returned JSX with `<I18nProvider>`
3. Replace all Chinese strings with `t()` calls
4. Handle error code → error message translation
5. Add `LocaleToggle` in the topbar `pill-row`

- [ ] **Step 1: Add imports at top**

```tsx
import { I18nProvider, useI18n } from "@/lib/i18n/provider";
import { LocaleToggle } from "@/lib/i18n/LocaleToggle";
```

- [ ] **Step 2: Create a `PageInner` component that calls `useI18n()`**

Move all the existing JSX from `HomePage` into a new `PageInner` component:

```tsx
function PageInner() {
  const { t } = useI18n();
  // ... rest of existing code (hooks, event handlers, JSX) with strings replaced
}
```

Change `HomePage` to:

```tsx
export default function HomePage() {
  return (
    <I18nProvider>
      <PageInner />
    </I18nProvider>
  );
}
```

- [ ] **Step 3: Replace all JSX Chinese strings with `t()`**

Pattern:
- `<h1>Solana 聚合发射工作台</h1>` → `<h1>{t("header.title")}</h1>`
- `<p>AI 生成草案...</p>` → `<p>{t("header.subtitle")}</p>`
- `<h2>Launch 输入</h2>` → `<h2>{t("form.title")}</h2>`
- `<label>钱包地址</label>` → `<label>{t("form.walletAddress")}</label>`
- `<button>断开</button>` → `<button>{t("header.disconnect")}</button>`
- `{detectedWallet ? `连接 ${detectedWallet.label}` : "重新检测钱包"}` → `{detectedWallet ? t("header.connectWallet", { label: detectedWallet.label }) : t("header.redetectWallet")}`

For the `result.noResult` fallback (line 635):
```tsx
{result ? <pre>...</pre> : <p className="muted">{t("result.noResult")}</p>}
```

For the error message display (line 581):
```tsx
{apiErrorMessage ? <div className="error-box">{t(apiErrorMessage)}</div> : null}
```
Note: `apiErrorMessage` now comes from error codes, so we pass it directly to `t()`.

For signing status (line 632):
```tsx
{signingStatus ? <p className="field-note full-line">{t(signingStatus)}</p> : null}
```

For the "正在请求钱包签名并发送..." text (line 334):
```tsx
setSigningStatus("result.signing");
```

For "已发送" (line 347):
```tsx
setSigningStatus(t("result.sent", { count: String(sentSignatures.length) }));
```

For the sign/send error (line 354):
```tsx
const message = error instanceof Error ? error.message : t("common.signSendFailed");
```

For wallet connect/disconnect messages (lines 149, 159, 322, 329, 398):
```tsx
setWalletMessage(t("wallet.disconnects"));  // line 149
setWalletMessage(t("wallet.disconnects"));  // line 159

setSigningStatus(t("wallet.requiresConnection"));  // line 322
setSigningStatus(t("wallet.requiresMintKey")); // line 329

setWalletMessage(t("wallet.connects", { label: connection.label }));  // line 398
```

For validate/build errors (lines 261, 273):
```tsx
setResult({ error: "errors.draft_before_validate" });   // line 261
setResult({ error: "errors.build_not_validated" });      // line 273
```

For the "feeRecipient" redacted label — pass to `redactFeeRecipientsForDisplay`:
```tsx
const displayResult = useMemo(
  () => redactFeeRecipientsForDisplay(result, t("result.redacted")),
  [result]
);
```

- [ ] **Step 4: Add `LocaleToggle` to the `pill-row`**

Near line 431, after the wallet pill, before the platform pills:

```tsx
<div className="pill-row">
  {walletConnection ? <span className="pill wallet-pill">...</span> : null}
  <LocaleToggle />
  <span className="pill">pump.fun</span>
  <span className="pill">Raydium LaunchLab</span>
  <span className="pill">Meteora DBC</span>
</div>
```

- [ ] **Step 5: Run tests**

Run: `pnpm test`  
Expected: All existing tests pass. (No component tests exist for page.tsx.)

- [ ] **Step 6: Dev server smoke test**

Run: `pnpm dev`  
Open the page. Verify:
- All labels are in correct default language (based on browser locale)
- Toggle button in topbar shows "EN" (when Chinese) or "中文" (when English)
- Click toggles — all strings switch
- Error paths still work (click "生成草案" without API key → see localized error)

---

### Task 6: Modify `app/sign/[id]/page.tsx`

**Files:**
- Modify: `app/sign/[id]/page.tsx`

- [ ] **Step 1: Update the server component to read cookie and use messages**

```tsx
import { cookies } from "next/headers";
import { getRecordById } from "@/lib/launch/repository";
import { messages, type Locale } from "@/lib/i18n/messages";

function t(locale: Locale, key: string): string {
  return messages[locale]?.[key] ?? key;
}

export default async function SignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getRecordById(id);
  const cookieStore = await cookies();
  const locale: Locale = cookieStore.get("launchpad.locale")?.value === "zh" ? "zh" : "en";

  return (
    <main className="page">
      <section className="panel">
        <h1>{t(locale, "result.signTitle")}</h1>
        {record ? (
          <>
            <p>Launch Record: {record.id}</p>
            <p>{t(locale, "form.targetPlatform")}: {record.platform}</p>
            <p>{t(locale, "result.serviceFee")}: {record.feeAmountLamports} lamports</p>
          </>
        ) : (
          <p className="warning">没有找到这条发射记录。serverless 环境需要持久数据库保存记录。</p>
        )}
      </section>
    </main>
  );
}
```

Note: The "没有找到这条发射记录" string is a known edge-case message when the in-memory record doesn't exist. Keep it as-is; it's an infrastructure note, not a common user-facing message.

Wait — actually the user said "全部 UI", so even this should be translated. Let me add keys for it.

Add to `messages.ts`:
```
"sign.notFound": "没有找到这条发射记录。serverless 环境需要持久数据库保存记录。"
"sign.notFound": "Launch record not found. Serverless environment needs a persistent database."
```

Update the sign page:
```tsx
{record ? (
  <>
    <p>Launch Record: {record.id}</p>
    <p>{t(locale, "form.targetPlatform")}: {record.platform}</p>
    <p>{t(locale, "result.serviceFee")}: {record.feeAmountLamports} lamports</p>
  </>
) : (
  <p className="warning">{t(locale, "sign.notFound")}</p>
)}
```

Update `messages.ts`:
```
"sign.notFound": "没有找到这条发射记录。serverless 环境需要持久数据库保存记录。"
"sign.notFound": "Launch record not found in serverless memory store. A persistent database is required."
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`  
Expected: No errors.

---

### Task 7: Update AGENTS.md + final verification

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add i18n notes to AGENTS.md**

Add a section after "Things that will trip you up" or in the layout section:

```
- **i18n system.** `lib/i18n/` has a lightweight DIY Context-based translation system (zh/en). Provider reads `localStorage` then `navigator.language` at mount. Layout has an inline script to set `<html lang>` before hydration. API errors are translated client-side by mapping `LaunchIssue.code` → `t("errors." + code)`. Locale toggle writes localStorage + cookie (`launchpad.locale`, 7d expiry, path=/). No external i18n library.
```

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`  
Expected: All tests pass.

- [ ] **Step 3: Run build**

Run: `pnpm build`  
Expected: Build succeeds.
