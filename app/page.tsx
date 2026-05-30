"use client";

import { useEffect, useMemo, useState } from "react";
import {
  connectSolanaWallet,
  disconnectSolanaWallet,
  findSolanaWalletProvider,
  publicKeyToString,
  type BrowserWalletGlobal,
  type DetectedSolanaWallet,
  type WalletConnection
} from "@/lib/wallet/browser-wallet";
import { generateLaunchMintKeypair, restoreLaunchMintKeypair } from "@/lib/wallet/mint-keypair";
import { getPreparedLaunchResult } from "@/lib/launch/prepared-result";
import { sendSignedTransactionsSequentially, signLaunchTransactions } from "@/lib/wallet/launch-signing";

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
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
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

    const detected = findSolanaWalletProvider(window as unknown as BrowserWalletGlobal);
    setDetectedWallet(detected);
    if (!detected) {
      setWalletMessage("未检测到 Phantom 或 Solflare。可以先手动填写钱包地址。");
      return;
    }

    const handleAccountChanged = (nextPublicKey: unknown) => {
      const address = publicKeyToString(nextPublicKey as never);
      if (!address) {
        setWalletConnection(null);
        setWalletMessage("钱包账户已断开。");
        return;
      }
      setWalletConnection({ label: detected.label, address, connected: true });
      setForm((current) => ({ ...current, walletAddress: address }));
      localStorage.setItem("launchpad.walletAddress", address);
    };

    const handleDisconnect = () => {
      setWalletConnection(null);
      setWalletMessage("钱包已断开。");
    };

    detected.provider.on?.("accountChanged", handleAccountChanged);
    detected.provider.on?.("disconnect", handleDisconnect);

    return () => {
      detected.provider.off?.("accountChanged", handleAccountChanged);
      detected.provider.off?.("disconnect", handleDisconnect);
    };
  }, []);

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
      idempotencyKey: `${form.walletAddress}:${form.tokenSymbol}:${form.budgetSol}`
    }),
    [form]
  );
  const preparedLaunch = useMemo(() => getPreparedLaunchResult(result), [result]);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "walletAddress" && value) {
      localStorage.setItem("launchpad.walletAddress", value);
    }
  }

  async function callApi(path: string, payload = body) {
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
    if (!detectedWallet?.provider || !walletConnection) {
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
    setSigningStatus("正在获取最新 blockhash...");
    const sentSignatures: string[] = [];
    try {
      const { Connection } = await import("@solana/web3.js");
      const connection = new Connection(form.rpcUrl, "confirmed");
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");

      setSigningStatus("正在请求钱包签名...");
      const signedTransactions = await signLaunchTransactions({
        transactions: preparedLaunch.transactions,
        requiredSigners: preparedLaunch.requiredSigners,
        mintSecretKeyBase64,
        recentBlockhash: latestBlockhash.blockhash,
        wallet: detectedWallet.provider
      });

      setSigningStatus("正在发送交易...");
      sentSignatures.push(
        ...(await sendSignedTransactionsSequentially(signedTransactions, (rawTransaction) =>
          connection.sendRawTransaction(rawTransaction, { skipPreflight: false })
        ))
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
      const connection = await connectSolanaWallet(detectedWallet);
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
                  <button disabled={busy || !detectedWallet} onClick={connectWallet}>
                    {detectedWallet ? `连接 ${detectedWallet.label}` : "未检测到钱包"}
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
            <div className="field full">
              <label>前端发送 RPC</label>
              <input value={form.rpcUrl} onChange={(event) => update("rpcUrl", event.target.value)} />
              <p className="field-note">签名后由浏览器通过这个 RPC 发送交易；服务端不代签、不代发。</p>
            </div>
          </div>

          <div className="actions">
            <button disabled={busy} onClick={() => callApi("/api/launch/draft")}>生成草案</button>
            <button className="secondary" disabled={busy} onClick={() => callApi("/api/skill/launch/prepare")}>Skill 一键准备</button>
          </div>
          <p className="muted">当前版本返回待签名交易 payload；不会托管私钥或代签。</p>
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
            {preparedLaunch ? (
              <div className="sign-box">
                <div>
                  <strong>待签交易</strong>
                  <p className="field-note">
                    平台 {preparedLaunch.platform}，交易 {preparedLaunch.transactions.length} 笔，服务费{" "}
                    {preparedLaunch.fee.serviceFeeLamports} lamports，收款地址 {preparedLaunch.fee.feeRecipient}
                  </p>
                </div>
                <button disabled={busy || !walletConnection} onClick={signAndSendPreparedLaunch}>签名并发送</button>
                {signingStatus ? <p className="field-note full-line">{signingStatus}</p> : null}
              </div>
            ) : null}
            {result ? <pre>{JSON.stringify(result, null, 2)}</pre> : <p className="muted">还没有请求结果。</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
