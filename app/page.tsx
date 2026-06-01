"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  findSolanaWalletProvider,
  getWalletDetectionMessage,
  publicKeyToString,
  type BrowserWalletGlobal,
  type DetectedSolanaWallet,
  type WalletConnection
} from "@/lib/wallet/browser-wallet";
import { generateLaunchMintKeypair, restoreLaunchMintKeypair } from "@/lib/wallet/mint-keypair";
import { getPreparedLaunchResult } from "@/lib/launch/prepared-result";
import {
  createLaunchIdempotencyKey,
  formatLamportsAsSol,
  getDraftForBuild,
  getDraftForValidation,
  getLaunchFeeEstimate,
  makeBuildTransactionPayload,
  redactFeeRecipientsForDisplay,
  shouldShowFirstBuyFields
} from "@/lib/launch/workbench-flow";
import { signAndSendLaunchTransactionsWithWallet } from "@/lib/wallet/launch-signing";

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

export default function HomePage() {
  const [form, setForm] = useState(defaultForm);
  const [password, setPassword] = useState("");
  const [savedSecret, setSavedSecret] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult>(null);
  const [busy, setBusy] = useState(false);
  const [detectedWallet, setDetectedWallet] = useState<DetectedSolanaWallet | null>(null);
  const [walletConnection, setWalletConnection] = useState<WalletConnection | null>(null);
  const [walletMessage, setWalletMessage] = useState("");
  const [signingStatus, setSigningStatus] = useState("");

  const detectWalletProvider = useCallback(() => {
    const detected = findSolanaWalletProvider(window as unknown as BrowserWalletGlobal);
    setDetectedWallet(detected);
    setWalletMessage(getWalletDetectionMessage(detected));
    return detected;
  }, []);

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

    detectWalletProvider();
    const retryDelays = [500, 1500, 3000];
    const retryTimers = retryDelays.map((delay) => window.setTimeout(detectWalletProvider, delay));

    return () => {
      retryTimers.forEach(window.clearTimeout);
    };
  }, [detectWalletProvider]);

  useEffect(() => {
    if (!detectedWallet) return;
    const handleAccountChanged = (nextPublicKey: unknown) => {
      const address = publicKeyToString(nextPublicKey as never);
      if (!address) {
        setWalletConnection(null);
        setWalletMessage("钱包账户已断开。");
        return;
      }
      setWalletConnection({ label: detectedWallet.label, address, connected: true });
      setForm((current) => ({ ...current, walletAddress: address }));
      localStorage.setItem("launchpad.walletAddress", address);
    };

    const handleDisconnect = () => {
      setWalletConnection(null);
      setWalletMessage("钱包已断开。");
    };

    detectedWallet.provider.on?.("accountChanged", handleAccountChanged);
    detectedWallet.provider.on?.("disconnect", handleDisconnect);

    return () => {
      detectedWallet.provider.off?.("accountChanged", handleAccountChanged);
      detectedWallet.provider.off?.("disconnect", handleDisconnect);
    };
  }, [detectedWallet]);

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
  const draftForValidation = useMemo(() => getDraftForValidation(result), [result]);
  const draftForBuild = useMemo(() => getDraftForBuild(result), [result]);
  const currentFeeEstimate = useMemo(() => getLaunchFeeEstimate(result), [result]);
  const displayResult = useMemo(() => redactFeeRecipientsForDisplay(result), [result]);
  const showFirstBuyFields = shouldShowFirstBuyFields(form.firstBuyEnabled);

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
      setResult((await response.json()) as ApiResult);
    } finally {
      setBusy(false);
    }
  }

  async function validateCurrentDraft() {
    const draft = draftForValidation;
    if (!draft) {
      setResult({ error: "请先生成草案，再校验草案。" });
      return;
    }

    await callApi("/api/launch/validate", { draft });
  }

  async function buildCurrentTransaction() {
    const payload = makeBuildTransactionPayload(result, body.idempotencyKey);
    if (!payload) {
      setResult((current) => ({
        ...(current ?? {}),
        error: "请先通过草案校验，再构建待签交易。"
      }));
      return;
    }

    await callApi("/api/launch/build-transaction", payload);
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
    const wallet = detectedWallet ?? detectWalletProvider();
    if (!wallet?.provider) {
      setSigningStatus(getWalletDetectionMessage(null));
      return;
    }
    if (!wallet.provider.signAndSendTransaction) {
      setSigningStatus(getWalletDetectionMessage(wallet));
      return;
    }
    if (!walletConnection) {
      setSigningStatus("请先连接钱包再签名发送。");
      return;
    }

    const mintSecretKeyBase64 = sessionStorage.getItem("launchpad.mintSecret");
    const needsMintSigner = form.mintPublicKey && preparedLaunch.requiredSigners.includes(form.mintPublicKey);
    if (needsMintSigner && !mintSecretKeyBase64) {
      setSigningStatus("当前交易需要 mint keypair 签名，但本浏览器会话没有对应 mint 私钥。请重新生成 Mint 后再构造交易。");
      return;
    }

    setBusy(true);
    setSigningStatus("正在请求钱包签名并发送...");
    const sentSignatures: string[] = [];
    try {
      sentSignatures.push(
        ...(await signAndSendLaunchTransactionsWithWallet({
          transactions: preparedLaunch.transactions,
          requiredSigners: preparedLaunch.requiredSigners,
          mintSecretKeyBase64,
          wallet: wallet.provider
        }))
      );

      await recordLaunchResult(preparedLaunch.launchRecordId, sentSignatures, "sent");
      setSigningStatus(`已发送 ${sentSignatures.length} 笔交易。`);
      setResult((current) => ({
        ...(current ?? {}),
        sendStatus: "sent",
        sentSignatures
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "签名或发送失败。";
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

  async function connectWallet() {
    setBusy(true);
    setWalletMessage("");
    try {
      const wallet = detectedWallet ?? detectWalletProvider();
      const connection = await connectSolanaWallet(wallet);
      setWalletConnection(connection);
      update("walletAddress", connection.address);
      setWalletMessage(`${connection.label} 已连接。`);
    } catch (error) {
      setWalletMessage(error instanceof Error ? error.message : "钱包连接失败。");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectWallet() {
    setBusy(true);
    try {
      await disconnectSolanaWallet(detectedWallet);
      setWalletConnection(null);
      setWalletMessage("钱包已断开。");
    } finally {
      setBusy(false);
    }
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
          <h1>Solana 聚合发射工作台</h1>
          <p>AI 生成草案，后端校验和构造 unsigned transaction，用户钱包最终签名。</p>
        </div>
        <div className="pill-row">
          {walletConnection ? <span className="pill wallet-pill">{walletConnection.label}: {walletConnection.address.slice(0, 4)}...{walletConnection.address.slice(-4)}</span> : null}
          <span className="pill">pump.fun</span>
          <span className="pill">Raydium LaunchLab</span>
          <span className="pill">Meteora DBC</span>
        </div>
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Launch 输入</h2>
          <div className="form-grid">
            <div className="field full">
              <label>钱包地址</label>
              <div className="wallet-row">
                <input
                  value={form.walletAddress}
                  placeholder="连接钱包后自动填充，也可以手动输入"
                  onChange={(event) => update("walletAddress", event.target.value)}
                />
                {walletConnection ? (
                  <button className="secondary" disabled={busy} onClick={disconnectWallet}>断开</button>
                ) : (
                  <button disabled={busy} onClick={detectedWallet ? connectWallet : detectWalletProvider}>
                    {detectedWallet ? `连接 ${detectedWallet.label}` : "重新检测钱包"}
                  </button>
                )}
              </div>
              {walletMessage ? <p className="field-note">{walletMessage}</p> : null}
            </div>
            <div className="field full">
              <label>Mint Public Key</label>
              <div className="wallet-row">
                <input
                  value={form.mintPublicKey}
                  placeholder="生成本次 launch 的 mint keypair"
                  onChange={(event) => update("mintPublicKey", event.target.value)}
                />
                <button className="secondary" type="button" onClick={generateMint}>生成 Mint</button>
              </div>
              <p className="field-note">mint 私钥仅保存在当前浏览器 sessionStorage；后端只接收 public key。</p>
            </div>
            <div className="field full">
              <label>目标</label>
              <textarea value={form.goal} onChange={(event) => update("goal", event.target.value)} />
            </div>
            <div className="field">
              <label>Token 名称</label>
              <input value={form.tokenName} onChange={(event) => update("tokenName", event.target.value)} />
            </div>
            <div className="field">
              <label>Symbol</label>
              <input value={form.tokenSymbol} onChange={(event) => update("tokenSymbol", event.target.value)} />
            </div>
            <div className="field">
              <label>预算 SOL</label>
              <input type="number" min="0" step="0.1" value={form.budgetSol} onChange={(event) => update("budgetSol", event.target.value)} />
            </div>
            <div className="field">
              <label>是否首买</label>
              <select value={form.firstBuyEnabled} onChange={(event) => update("firstBuyEnabled", event.target.value)}>
                <option value="false">只创建</option>
                <option value="true">创建并首买</option>
              </select>
            </div>
            {showFirstBuyFields ? (
              <>
                <div className="field">
                  <label>首买 SOL</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.firstBuyAmountSol}
                    onChange={(event) => update("firstBuyAmountSol", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label>首买滑点 bps</label>
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
              <label>目标平台</label>
              <select value={form.preferredPlatform} onChange={(event) => update("preferredPlatform", event.target.value)}>
                <option value="">Agent 推荐</option>
                <option value="pumpfun">pump.fun</option>
                <option value="raydium_launchlab">Raydium LaunchLab</option>
                <option value="meteora_dbc">Meteora DBC</option>
              </select>
            </div>
            <div className="field full">
              <label>描述</label>
              <textarea value={form.description} onChange={(event) => update("description", event.target.value)} />
            </div>
            <div className="field full">
              <label>图片 URI</label>
              <input value={form.imageUri} onChange={(event) => update("imageUri", event.target.value)} />
            </div>
          </div>

          <div className="actions">
            <button disabled={busy} onClick={() => callApi("/api/launch/draft")}>生成草案</button>
            <button className="secondary" disabled={busy || !draftForValidation} onClick={validateCurrentDraft}>校验草案</button>
            <button className="secondary" disabled={busy || !draftForBuild} onClick={buildCurrentTransaction}>构建待签交易</button>
            <button className="secondary" disabled={busy} onClick={() => callApi("/api/skill/launch/prepare")}>Skill 一键准备</button>
          </div>
          <p className="muted">当前版本返回待签名交易 payload；浏览器钱包负责签名和发送，平台不托管私钥或代签。</p>
        </div>

        <div className="panel">
          <h2>AI Provider 本地加密</h2>
          <div className="field">
            <label>Provider</label>
            <select value={form.providerType} onChange={(event) => update("providerType", event.target.value)}>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div className="field">
            <label>Base URL</label>
            <input value={form.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} />
          </div>
          <div className="field">
            <label>Model</label>
            <input value={form.model} onChange={(event) => update("model", event.target.value)} />
          </div>
          <div className="field">
            <label>API Key</label>
            <input type="password" value={form.apiKey} onChange={(event) => update("apiKey", event.target.value)} />
          </div>
          <div className="field">
            <label>本地加密密码</label>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="actions">
            <button disabled={!password || !form.apiKey} onClick={saveAiConfig}>本地加密保存</button>
            <button className="secondary" disabled={!password || !savedSecret} onClick={unlockAiKey}>解锁到本次会话</button>
          </div>
          <p className="muted">密钥只存 localStorage 的 AES-GCM 密文；请求时临时发给 API，不写入数据库。</p>

          <div className="result">
            <h2>API 输出</h2>
            {currentFeeEstimate ? (
              <div className="fee-box">
                <strong>签名前费用确认</strong>
                <dl>
                  <div>
                    <dt>服务费</dt>
                    <dd>{formatLamportsAsSol(currentFeeEstimate.serviceFeeLamports)}</dd>
                  </div>
                  <div>
                    <dt>预估总额</dt>
                    <dd>{formatLamportsAsSol(currentFeeEstimate.totalEstimatedLamports)}</dd>
                  </div>
                  <div>
                    <dt>交易数量</dt>
                    <dd>{preparedLaunch ? preparedLaunch.transactions.length : "校验后构建"}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {preparedLaunch ? (
              <div className="sign-box">
                <div>
                  <strong>待签交易</strong>
                  <p className="field-note">
                    平台 {preparedLaunch.platform}，交易 {preparedLaunch.transactions.length} 笔，服务费{" "}
                    {formatLamportsAsSol(preparedLaunch.fee.serviceFeeLamports)}
                  </p>
                </div>
                <button disabled={busy} onClick={signAndSendPreparedLaunch}>签名并发送</button>
                {signingStatus ? <p className="field-note full-line">{signingStatus}</p> : null}
              </div>
            ) : null}
            {result ? <pre>{JSON.stringify(displayResult, null, 2)}</pre> : <p className="muted">还没有请求结果。</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
