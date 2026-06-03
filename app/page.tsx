"use client";

import { useEffect, useMemo, useState } from "react";
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

async function deriveKey(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBuffer, iterations: 120000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encryptLocalSecret(secret: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBuffer }, key, new TextEncoder().encode(secret));
  return JSON.stringify({
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted))
  });
}

async function decryptLocalSecret(payload: string, password: string) {
  const parsed = JSON.parse(payload) as { salt: string; iv: string; data: string };
  const iv = fromBase64(parsed.iv);
  const data = fromBase64(parsed.data);
  const key = await deriveKey(password, fromBase64(parsed.salt));
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
    key,
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  );
  return new TextDecoder().decode(decrypted);
}

function PageInner() {
  const { t } = useI18n();
  const [form, setForm] = useState(defaultForm);
  const [password, setPassword] = useState("");
  const [savedSecret, setSavedSecret] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult>(null);
  const [busy, setBusy] = useState(false);
  const [signingStatus, setSigningStatus] = useState("");
  const wallet = useWallet();
  const { connection } = useConnection();

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

  useEffect(() => {
    if (wallet.publicKey) {
      const address = wallet.publicKey.toBase58();
      setForm((current) => ({ ...current, walletAddress: address }));
      localStorage.setItem("launchpad.walletAddress", address);
    }
  }, [wallet.publicKey]);

  const body = useMemo(
    () => ({
      walletAddress: form.walletAddress,
      mintPublicKey: form.mintPublicKey,
      goal: form.goal,
      budgetSol: Number(form.budgetSol),
      firstBuy: {
        enabled: form.firstBuyEnabled === "true",
        amountSol: Number(form.firstBuyAmountSol),
        slippageBps: Number(form.firstBuySlippageBps)
      },
      preferredPlatform: form.preferredPlatform || undefined,
      token: {
        name: form.tokenName,
        symbol: form.tokenSymbol,
        description: form.description,
        imageUri: form.imageUri
      },
      aiProvider: form.apiKey
        ? form.providerType === "anthropic"
          ? { type: "anthropic", apiKey: form.apiKey, model: form.model, baseUrl: form.baseUrl || undefined }
          : { type: "openai-compatible", apiKey: form.apiKey, model: form.model, baseUrl: form.baseUrl }
        : undefined,
      idempotencyKey: createLaunchIdempotencyKey({
        walletAddress: form.walletAddress,
        mintPublicKey: form.mintPublicKey,
        tokenSymbol: form.tokenSymbol,
        budgetSol: form.budgetSol,
        preferredPlatform: form.preferredPlatform,
        firstBuyEnabled: form.firstBuyEnabled,
        firstBuyAmountSol: form.firstBuyAmountSol
      })
    }),
    [form]
  );
  const preparedLaunch = useMemo(() => getPreparedLaunchResult(result), [result]);
  const preparedTransactionSteps = useMemo(
    () => (preparedLaunch ? getPreparedTransactionSteps(preparedLaunch) : []),
    [preparedLaunch]
  );
  const draftForValidation = useMemo(() => getDraftForValidation(result), [result]);
  const draftForBuild = useMemo(() => getDraftForBuild(result), [result]);
  const currentFeeEstimate = useMemo(() => getLaunchFeeEstimate(result), [result]);
  const recommendationReasons = useMemo(() => getDraftRecommendationReasons(result), [result]);
  const apiErrorMessage = useMemo(() => getApiErrorMessage(result), [result]);
  const displayResult = useMemo(() => redactFeeRecipientsForDisplay(result, t("result.redacted")), [result, t]);
  const showFirstBuyFields = shouldShowFirstBuyFields(form.firstBuyEnabled);

  const formDraftInput = useMemo(
    () => ({
      walletAddress: form.walletAddress,
      mintPublicKey: form.mintPublicKey,
      tokenName: form.tokenName,
      tokenSymbol: form.tokenSymbol,
      description: form.description,
      imageUri: form.imageUri,
      budgetSol: form.budgetSol,
      preferredPlatform: form.preferredPlatform,
      firstBuyEnabled: form.firstBuyEnabled,
      firstBuyAmountSol: form.firstBuyAmountSol,
      firstBuySlippageBps: form.firstBuySlippageBps
    }),
    [form]
  );

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "walletAddress" && value) {
      localStorage.setItem("launchpad.walletAddress", value);
    }
  }

  async function callApi(path: string, payload: unknown = body) {
    setBusy(true);
    setSigningStatus("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const text = await response.text();
        setResult({ error: `HTTP ${response.status}: ${text.slice(0, 200)}` });
        return;
      }
      setResult((await response.json()) as ApiResult);
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function validateCurrentDraft() {
    const draft = draftForValidation;
    if (!draft) {
      setResult({ error: "errors.draft_before_validate" });
      return;
    }

    await callApi("/api/launch/validate", { draft: applyLaunchFormToDraft(draft, formDraftInput) });
  }

  async function buildCurrentTransaction() {
    const payload = makeBuildTransactionPayload(result, body.idempotencyKey);
    if (!payload) {
      setResult((current) => ({
        ...(current ?? {}),
        error: "errors.build_not_validated"
      }));
      return;
    }

    await callApi("/api/launch/build-transaction", {
      ...payload,
      draft: applyLaunchFormToDraft(payload.draft, formDraftInput)
    });
  }

  async function prepareLaunchDraft(path: "/api/launch/draft" | "/api/skill/launch/prepare") {
    const providerWarning = getAgentRecommendationProviderWarning({
      preferredPlatform: form.preferredPlatform,
      apiKey: form.apiKey
    });
    if (providerWarning) {
      setResult({ error: t(providerWarning.code) });
      return;
    }

    await callApi(path);
  }

  async function recordLaunchResult(launchRecordId: string, signatures: string[], status: "sent" | "failed", errorMessage?: string) {
    await fetch("/api/launch/record-result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        launchRecordId,
        signature: signatures.join(","),
        status,
        errorMessage
      })
    });
  }

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

  async function saveAiConfig() {
    if (!password || !form.apiKey) return;
    const encrypted = await encryptLocalSecret(form.apiKey, password);
    localStorage.setItem("launchpad.aiSecret", encrypted);
    localStorage.setItem(
      "launchpad.aiConfig",
      JSON.stringify({
        providerType: form.providerType,
        baseUrl: form.baseUrl,
        model: form.model
      })
    );
    setSavedSecret(encrypted);
    update("apiKey", "");
  }

  async function unlockAiKey() {
    if (!savedSecret || !password) return;
    const apiKey = await decryptLocalSecret(savedSecret, password);
    update("apiKey", apiKey);
  }

  function generateMint() {
    const mint = generateLaunchMintKeypair();
    sessionStorage.setItem("launchpad.mintSecret", mint.secretKeyBase64);
    update("mintPublicKey", mint.publicKey);
  }

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
                <p className="field-note">{t("wallet.connects", { label: wallet.wallet?.adapter.name ?? "Wallet" })}</p>
              ) : wallet.connected && wallet.publicKey ? (
                <p className="field-note">{t("wallet.connects", { label: wallet.wallet?.adapter.name ?? "Wallet" })}</p>
              ) : null}
            </div>
            <div className="field full">
              <label>{t("form.mintPublicKey")}</label>
              <div className="wallet-row">
                <input
                  value={form.mintPublicKey}
                  placeholder={t("form.mintPlaceholder")}
                  onChange={(event) => update("mintPublicKey", event.target.value)}
                />
                <button className="secondary" type="button" onClick={generateMint}>{t("form.generateMint")}</button>
              </div>
              <p className="field-note">{t("form.mintNote")}</p>
            </div>
            <div className="field full">
              <label>{t("form.goal")}</label>
              <textarea value={form.goal} onChange={(event) => update("goal", event.target.value)} />
            </div>
            <div className="field">
              <label>{t("form.tokenName")}</label>
              <input value={form.tokenName} onChange={(event) => update("tokenName", event.target.value)} />
            </div>
            <div className="field">
              <label>{t("form.symbol")}</label>
              <input value={form.tokenSymbol} onChange={(event) => update("tokenSymbol", event.target.value)} />
            </div>
            <div className="field">
              <label>{t("form.budgetSol")}</label>
              <input type="number" min="0" step="0.1" value={form.budgetSol} onChange={(event) => update("budgetSol", event.target.value)} />
            </div>
            <div className="field">
              <label>{t("form.firstBuyEnabled")}</label>
              <select value={form.firstBuyEnabled} onChange={(event) => update("firstBuyEnabled", event.target.value)}>
                <option value="false">{t("form.firstBuyCreateOnly")}</option>
                <option value="true">{t("form.firstBuyCreateAndBuy")}</option>
              </select>
            </div>
            {showFirstBuyFields ? (
              <>
                <div className="field">
                  <label>{t("form.firstBuyAmountSol")}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.firstBuyAmountSol}
                    onChange={(event) => update("firstBuyAmountSol", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label>{t("form.firstBuySlippageBps")}</label>
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    step="1"
                    value={form.firstBuySlippageBps}
                    onChange={(event) => update("firstBuySlippageBps", event.target.value)}
                  />
                </div>
              </>
            ) : null}
            <div className="field">
              <label>{t("form.targetPlatform")}</label>
              <select value={form.preferredPlatform} onChange={(event) => update("preferredPlatform", event.target.value)}>
                <option value="">{t("form.agentRecommend")}</option>
                <option value="pumpfun">pump.fun</option>
                <option value="raydium_launchlab">Raydium LaunchLab</option>
                <option value="meteora_dbc">Meteora DBC</option>
              </select>
            </div>
            <div className="field full">
              <label>{t("form.description")}</label>
              <textarea value={form.description} onChange={(event) => update("description", event.target.value)} />
            </div>
            <div className="field full">
              <label>{t("form.imageUri")}</label>
              <input value={form.imageUri} onChange={(event) => update("imageUri", event.target.value)} />
            </div>
          </div>

          <div className="actions">
            <button disabled={busy} onClick={() => prepareLaunchDraft("/api/launch/draft")}>{t("form.generateDraft")}</button>
            <button className="secondary" disabled={busy || !draftForValidation} onClick={validateCurrentDraft}>{t("form.validateDraft")}</button>
            <button className="secondary" disabled={busy || !draftForBuild} onClick={buildCurrentTransaction}>{t("form.buildTransaction")}</button>
            <button className="secondary" disabled={busy} onClick={() => prepareLaunchDraft("/api/skill/launch/prepare")}>{t("form.skillPrepare")}</button>
          </div>
          <p className="muted">{t("form.footnote")}</p>
        </div>

        <div className="panel">
          <h2>{t("ai.title")}</h2>
          <div className="field">
            <label>{t("ai.provider")}</label>
            <select value={form.providerType} onChange={(event) => update("providerType", event.target.value)}>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div className="field">
            <label>{t("ai.baseUrl")}</label>
            <input value={form.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} />
          </div>
          <div className="field">
            <label>{t("ai.model")}</label>
            <input value={form.model} onChange={(event) => update("model", event.target.value)} />
          </div>
          <div className="field">
            <label>{t("ai.apiKey")}</label>
            <input type="password" value={form.apiKey} onChange={(event) => update("apiKey", event.target.value)} />
          </div>
          <div className="field">
            <label>{t("ai.encryptPassword")}</label>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="actions">
            <button disabled={!password || !form.apiKey} onClick={saveAiConfig}>{t("ai.encryptSave")}</button>
            <button className="secondary" disabled={!password || !savedSecret} onClick={unlockAiKey}>{t("ai.unlockSession")}</button>
          </div>
          <p className="muted">{t("ai.footnote")}</p>

          <div className="result">
            <h2>{t("result.title")}</h2>
            {apiErrorMessage ? <div className="error-box">{t(apiErrorMessage)}</div> : null}
            {recommendationReasons.length > 0 ? (
              <div className="reason-box">
                <strong>{t("result.recommendationTitle")}</strong>
                <ul>
                  {recommendationReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {currentFeeEstimate ? (
              <div className="fee-box">
                <strong>{t("result.feeConfirmTitle")}</strong>
                <dl>
                  <div>
                    <dt>{t("result.serviceFee")}</dt>
                    <dd>{formatLamportsAsSol(currentFeeEstimate.serviceFeeLamports)}</dd>
                  </div>
                  <div>
                    <dt>{t("result.totalEstimated")}</dt>
                    <dd>{formatLamportsAsSol(currentFeeEstimate.totalEstimatedLamports)}</dd>
                  </div>
                  <div>
                    <dt>{t("result.transactionCount")}</dt>
                    <dd>{preparedLaunch ? preparedLaunch.transactions.length : ""}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {preparedLaunch ? (
              <div className="sign-box">
                <div>
                  <strong>{t("result.signTitle")}</strong>
                  <p className="field-note">
                    {preparedLaunch.transactions.length} tx(s),{" "}
                    {t("result.serviceFee").toLowerCase()}:{" "}
                    {formatLamportsAsSol(preparedLaunch.fee.serviceFeeLamports)}
                  </p>
                  <ol className="transaction-steps">
                    {preparedTransactionSteps.map((step) => (
                      <li key={`${step.index}-${step.label}`}>
                        <span>{step.index}/{step.total}</span>
                        <div>
                          <strong>{step.label}</strong>
                          <p>{step.description}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
                <button disabled={busy} onClick={signAndSendPreparedLaunch}>{t("result.signAndSend")}</button>
                {signingStatus ? <p className="field-note full-line">{signingStatus}</p> : null}
              </div>
            ) : null}
            {result ? <pre>{JSON.stringify(displayResult, null, 2)}</pre> : <p className="muted">{t("result.noResult")}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <I18nProvider>
      <PageInner />
    </I18nProvider>
  );
}
