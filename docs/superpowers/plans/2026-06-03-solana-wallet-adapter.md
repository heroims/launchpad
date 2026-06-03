# Solana Wallet Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom Solana wallet detection/connection with `@solana/wallet-adapter` for multi-wallet support (Phantom, OKX, Binance, etc.)

**Architecture:** Add `ConnectionProvider` + `WalletProvider` + `WalletModalProvider` at layout level. Refactor `page.tsx` to use `useWallet()` and `useConnection()` hooks. Update `launch-signing.ts` to accept adapter-style signers with `Connection`-based sending.

**Tech Stack:** `@solana/wallet-adapter-react`, `@solana/wallet-adapter-base`, `@solana/wallet-adapter-wallets`, `@solana/wallet-adapter-react-ui`, `@solana/web3.js`

---

### Task 1: Install wallet adapter dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add wallet adapter packages**

```bash
pnpm add @solana/wallet-adapter-react @solana/wallet-adapter-base @solana/wallet-adapter-wallets @solana/wallet-adapter-react-ui
```

- [ ] **Step 2: Run tests to confirm baseline still passes**

Run: `pnpm test`
Expected: 60 passed

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @solana/wallet-adapter dependencies"
```

---

### Task 2: Create wallet provider wrapper component

**Files:**
- Create: `lib/wallet/wallet-providers.tsx`

- [ ] **Step 1: Create `lib/wallet/wallet-providers.tsx`**

```tsx
"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  OKXWalletAdapter,
  BackpackWalletAdapter,
  CoinbaseWalletAdapter,
  TrustWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import type { ReactNode } from "react";

import "@solana/wallet-adapter-react-ui/styles.css";

const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");

export function WalletProviders({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new OKXWalletAdapter(),
      new BackpackWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new TrustWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/wallet/wallet-providers.tsx
git commit -m "feat: add wallet provider wrapper with Phantom, OKX, Solflare, Backpack, Coinbase, Trust"
```

---

### Task 3: Update layout to wrap with wallet providers

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Wrap children with `WalletProviders`**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { WalletProviders } from "@/lib/wallet/wallet-providers";

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
      <body><WalletProviders>{children}</WalletProviders></body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wrap app with ConnectionProvider, WalletProvider, WalletModalProvider"
```

---

### Task 4: Refactor page.tsx to use `useWallet()` and `useConnection()`

**Files:**
- Modify: `app/page.tsx`
- Modify: `lib/wallet/browser-wallet.ts`

- [ ] **Step 1: Strip `browser-wallet.ts` — remove detection/connection, keep only types and `publicKeyToString`**

```ts
export type WalletPublicKeyLike =
  | string
  | { toBase58: () => string }
  | { toString: () => string };

export type WalletConnection = {
  label: string;
  address: string;
  connected: true;
};

export function publicKeyToString(publicKey: WalletPublicKeyLike | null | undefined): string | null {
  if (!publicKey) return null;
  if (typeof publicKey === "string") return publicKey;
  if ("toBase58" in publicKey && typeof publicKey.toBase58 === "function") return publicKey.toBase58();
  return publicKey.toString();
}
```

Remove: `SolanaBrowserWalletProvider`, `DetectedSolanaWallet`, `BrowserWalletGlobal`, `findSolanaWalletProvider`, `connectSolanaWallet`, `disconnectSolanaWallet`, `getWalletDetectionMessage`, `walletLabel`.

- [ ] **Step 2: Rewrite `page.tsx` wallet section to use `useWallet()` and `useConnection()`**

Key changes:
- Replace `detectedWallet` / `walletConnection` / `walletMessage` / `signingStatus` state with `useWallet()` and `useConnection()`
- Remove manual `detectWalletProvider`, `connectWallet`, `disconnectWallet` functions
- Replace wallet connect button with `WalletMultiButton` from `@solana/wallet-adapter-react-ui`
- Auto-fill wallet address from `useWallet().publicKey`
- Replace `signAndSendPreparedLaunch` to use `wallet.sendTransaction(tx, connection)` instead of `wallet.signAndSendTransaction(tx)`

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { generateLaunchMintKeypair, restoreLaunchMintKeypair } from "@/lib/wallet/mint-keypair";
import { getPreparedLaunchResult, getPreparedTransactionSteps } from "@/lib/launch/prepared-result";
import {
  applyLaunchFormToDraft,
  createLaunchIdempotencyKey,
  formatLamportsAsSol,
  getAgentRecommendationProviderWarning,
  getApiErrorMessage,
  getDraftForBuild,
  getDraftForValidation,
  getDraftRecommendationReasons,
  getLaunchFeeEstimate,
  makeBuildTransactionPayload,
  redactFeeRecipientsForDisplay,
  shouldShowFirstBuyFields
} from "@/lib/launch/workbench-flow";
import { signAndSendLaunchTransactionsWithWallet } from "@/lib/wallet/launch-signing";
import { I18nProvider, useI18n } from "@/lib/i18n/provider";
import { LocaleToggle } from "@/lib/i18n/LocaleToggle";

type ApiResult = Record<string, unknown> | null;

const defaultForm = {
  walletAddress: "",
  mintPublicKey: "",
  goal: "Launch a meme token with safe defaults",
  budgetSol: "1",
  firstBuyEnabled: "false",
  firstBuyAmountSol: "0",
  firstBuySlippageBps: "100",
  tokenName: "Launch Token",
  tokenSymbol: "LAUNCH",
  description: "A token launched through the API-first launch workstation",
  imageUri: "https://example.com/token.png",
  preferredPlatform: "",
  providerType: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  apiKey: ""
};

// deriveKey, toBase64, fromBase64, encryptLocalSecret, decryptLocalSecret remain unchanged

function PageInner() {
  const { t } = useI18n();
  const wallet = useWallet();
  const { connection } = useConnection();
  const [form, setForm] = useState(defaultForm);
  const [password, setPassword] = useState("");
  const [savedSecret, setSavedSecret] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult>(null);
  const [busy, setBusy] = useState(false);
  const [signingStatus, setSigningStatus] = useState("");

  // Auto-fill wallet address when connected
  useEffect(() => {
    if (wallet.publicKey) {
      const address = wallet.publicKey.toBase58();
      setForm((current) => ({ ...current, walletAddress: address }));
      localStorage.setItem("launchpad.walletAddress", address);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    const saved = localStorage.getItem("launchpad.aiSecret");
    const config = localStorage.getItem("launchpad.aiConfig");
    const savedWalletAddress = localStorage.getItem("launchpad.walletAddress");
    const savedMintSecret = sessionStorage.getItem("launchpad.mintSecret");
    if (saved) setSavedSecret(saved);
    if (config) {
      setForm((current) => ({ ...current, ...JSON.parse(config), apiKey: "" }));
    }
    if (savedWalletAddress) {
      setForm((current) => ({ ...current, walletAddress: savedWalletAddress }));
    }
    if (savedMintSecret) {
      const restored = restoreLaunchMintKeypair(savedMintSecret);
      setForm((current) => ({ ...current, mintPublicKey: restored.publicKey }));
    }
  }, []);

  // body, formDraftInput, preparedLaunch, etc. remain the SAME as current

  // ... all the existing API call / form logic stays the same ...
  // ONLY change wallet-related parts:

  async function signAndSendPreparedLaunch() {
    if (!preparedLaunch) return;
    if (!wallet.connected || !wallet.publicKey) {
      setSigningStatus(t("wallet.requiresConnection"));
      return;
    }
    if (!wallet.sendTransaction) {
      setSigningStatus(t("wallet.requiresConnection"));
      return;
    }

    const mintSecretKeyBase64 = sessionStorage.getItem("launchpad.mintSecret");
    const needsMintSigner = form.mintPublicKey && preparedLaunch.requiredSigners.includes(form.mintPublicKey);
    if (needsMintSigner && !mintSecretKeyBase64) {
      setSigningStatus(t("wallet.requiresMintKey"));
      return;
    }

    setBusy(true);
    setSigningStatus(t("result.signing"));
    const sentSignatures: string[] = [];
    try {
      sentSignatures.push(
        ...(await signAndSendLaunchTransactionsWithWallet({
          transactions: preparedLaunch.transactions,
          requiredSigners: preparedLaunch.requiredSigners,
          mintSecretKeyBase64,
          wallet,
          connection,
        }))
      );

      await recordLaunchResult(preparedLaunch.launchRecordId, sentSignatures, "sent");
      setSigningStatus(t("result.sent", { count: String(sentSignatures.length) }));
      setResult((current) => ({
        ...(current ?? {}),
        sendStatus: "sent",
        sentSignatures
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("common.signSendFailed");
      setSigningStatus(message);
      await recordLaunchResult(preparedLaunch.launchRecordId, sentSignatures, "failed", message).catch(() => undefined);
      setResult((current) => ({
        ...(current ?? {}),
        sendStatus: "failed",
        sentSignatures,
        sendError: message
      }));
    } finally {
      setBusy(false);
    }
  }

  // recordLaunchResult, callApi, validateCurrentDraft, buildCurrentTransaction, etc stay the same

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand">
          <h1>{t("header.title")}</h1>
          <p>{t("header.subtitle")}</p>
        </div>
        <div className="pill-row">
          {wallet.connected && wallet.publicKey ? (
            <span className="pill wallet-pill">
              {wallet.wallet?.adapter.name ?? "Wallet"}: {wallet.publicKey.toBase58().slice(0, 4)}...{wallet.publicKey.toBase58().slice(-4)}
            </span>
          ) : null}
          <LocaleToggle />
          <span className="pill">pump.fun</span>
          <span className="pill">Raydium LaunchLab</span>
          <span className="pill">Meteora DBC</span>
        </div>
      </header>

      <section className="grid">
        <div className="panel">
          <h2>{t("form.title")}</h2>
          <div className="form-grid">
            <div className="field full">
              <label>{t("form.walletAddress")}</label>
              <div className="wallet-row">
                <input
                  value={form.walletAddress}
                  placeholder={t("form.walletPlaceholder")}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, walletAddress: event.target.value }));
                    localStorage.setItem("launchpad.walletAddress", event.target.value);
                  }}
                />
                <WalletMultiButton />
              </div>
              {wallet.connecting ? (
                <p className="field-note">{t("wallet.connecting")}</p>
              ) : wallet.connected && wallet.publicKey ? (
                <p className="field-note">{t("wallet.connects", { label: wallet.wallet?.adapter.name ?? "Wallet" })}</p>
              ) : null}
            </div>
            {/* rest of form unchanged */}
          </div>
        </div>
      </section>
    </main>
  );
}
```

Note: The majority of `page.tsx` code (form state, api calls, body computation, result display, fee display, AI provider section, i18n, etc.) stays exactly the same. Only the wallet section changes.

- [ ] **Step 3: Commit**

```bash
git add lib/wallet/browser-wallet.ts app/page.tsx
git commit -m "refactor: replace custom wallet detection with @solana/wallet-adapter hooks"
```

---

### Task 5: Update launch-signing.ts for wallet adapter API

**Files:**
- Modify: `lib/wallet/launch-signing.ts`

- [ ] **Step 1: Change `LaunchWalletSigner` to accept adapter-style interfaces**

The wallet adapter `sendTransaction` takes `(transaction, connection)` instead of `signAndSendTransaction(transaction)`. Update the type and function:

```ts
import { Connection, Keypair, PublicKey, Transaction, TransactionSignature } from "@solana/web3.js";
import { publicKeyToString, type WalletPublicKeyLike } from "./browser-wallet";
import type { TransactionPayload } from "@/lib/launch/types";

export type LaunchWalletSigner = {
  publicKey: WalletPublicKeyLike | null;
  signTransaction: <T extends Transaction | { toBase64: () => string }>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | { toBase64: () => string }>(txs: T[]) => Promise<T[]>;
};

export type LaunchWalletAndConnection = LaunchWalletSigner & {
  sendTransaction: (
    transaction: Transaction,
    connection: Connection,
    options?: { maxRetries?: number; skipPreflight?: boolean }
  ) => Promise<TransactionSignature>;
};

type SignLaunchTransactionsInput = {
  transactions: TransactionPayload[];
  requiredSigners: string[];
  wallet: LaunchWalletSigner;
  mintSecretKeyBase64?: string | null;
  recentBlockhash?: string;
};

type SignAndSendInput = SignLaunchTransactionsInput & {
  wallet: LaunchWalletAndConnection;
  connection: Connection;
};
```

Update `signAndSendLaunchTransactionsWithWallet` to use `wallet.sendTransaction(tx, connection)`:

```ts
export async function signAndSendLaunchTransactionsWithWallet(input: SignAndSendInput): Promise<string[]> {
  if (!input.wallet.sendTransaction) {
    throw new Error("Connected wallet does not support signing and sending transactions.");
  }

  const transactions = input.transactions.map((payload) => transactionFromPayload(payload, input.recentBlockhash));
  const mintSigner = restoreMintSigner(input.mintSecretKeyBase64);
  assertLocalSignersAvailable(transactions, input.requiredSigners, input.wallet, mintSigner);
  applyLocalSigners(transactions, mintSigner);

  const signatures: string[] = [];
  for (const [index, transaction] of transactions.entries()) {
    const sig = await input.wallet.sendTransaction(transaction, input.connection);
    signatures.push(sig);
  }
  return signatures;
}
```

- [ ] **Step 2: Run tests to verify no regression**

Run: `pnpm test`
Expected: Tests pass (some may need updating)

- [ ] **Step 3: Commit**

```bash
git add lib/wallet/launch-signing.ts
git commit -m "refactor: update launch-signing to use wallet adapter sendTransaction API"
```

---

### Task 6: Update tests and i18n

**Files:**
- Modify: `tests/browser-wallet.test.ts`
- Modify: `tests/launch-signing.test.ts`
- Modify: `lib/i18n/messages.ts`

- [ ] **Step 1: Update `tests/browser-wallet.test.ts`** — remove tests that test removed functions, keep/update remaining

```ts
import { describe, expect, it } from "vitest";
import { publicKeyToString } from "@/lib/wallet/browser-wallet";

describe("browser wallet utilities", () => {
  it("converts a toBase58 public key to string", () => {
    expect(publicKeyToString({ toBase58: () => "abc123" })).toBe("abc123");
  });

  it("converts a string public key to string", () => {
    expect(publicKeyToString("abc123")).toBe("abc123");
  });

  it("returns null for null input", () => {
    expect(publicKeyToString(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(publicKeyToString(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Update i18n messages** — add `wallet.connecting` key for both locales

zh: `"wallet.connecting": "钱包连接中...",`
en: `"wallet.connecting": "Connecting wallet...",`

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/browser-wallet.test.ts lib/i18n/messages.ts
git commit -m "test: update tests for wallet adapter migration; add wallet.connecting i18n key"
```

---

### Task 7: Verify build compiles cleanly

- [ ] **Step 1: Build the project**

Run: `pnpm build`
Expected: Next.js build succeeds

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: post-migration cleanup"
```
