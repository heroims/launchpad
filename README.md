# Launchpad

**API-first Solana token launch workstation.** Launch tokens on pump.fun, Raydium LaunchLab, and Meteora DBC from a single interface — with AI-powered draft generation, deterministic validation, and client-side signing.

![License](https://img.shields.io/badge/license-MIT-green)
![Solana](https://img.shields.io/badge/Solana-1.18-blue)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)

---

## What is Launchpad?

Launchpad is an open-source web workstation that lets you create and launch Solana tokens across multiple launch platforms — all without giving up custody of your keys. It combines an AI agent for draft generation, a deterministic validator, and a transaction builder into one cohesive workflow.

## Who is this for?

- **Solana token creators** who want to compare launch platforms (pump.fun, Raydium LaunchLab, Meteora DBC) before committing
- **Developers** building AI-powered launch agents on Solana — the API surface is designed for integration
- **Anyone** who wants to preview launch parameters, fees, and signable transactions before broadcasting to the network

## Key differentiators

- **API-first design** — integrate launch workflows into your own tools via REST endpoints
- **AI draft generation** — describe your token in natural language, get a validated launch draft (OpenAI-compatible, Anthropic, or deterministic fallback)
- **Multi-protocol** — pump.fun, Raydium LaunchLab, and Meteora DBC from a single codebase
- **No key custody** — the backend never holds private keys; wallet signing is always client-side
- **Deterministic idempotency** — identical drafts produce identical launch records, safe for retry
- **Encrypted API key storage** — AES-256-GCM encryption for AI provider keys in localStorage

## FAQ

### Can I launch on pump.fun without an RPC URL?
Yes. pump.fun create-only uses `@pump-fun/pump-sdk` directly and does not require `SOLANA_RPC_URL`. Create-and-buy mode does require an RPC.

### Does the backend hold my private keys?
No. All signing happens client-side in the browser wallet. The API never sees your keys. Mint keypairs are generated in-browser and stored in sessionStorage only.

### Can I use this with an AI agent?
Yes. `POST /api/skill/launch/prepare` accepts natural language launch descriptions and returns validated, ready-to-sign transactions.

### What launch platforms are supported?
- **pump.fun** — bonding-curve based, create-only or create-and-buy
- **Raydium LaunchLab** — standard AMM launch with configurable pools
- **Meteora DBC** — dynamic bonding curve with optional first-buy and two-transaction group support

### Is there a service fee?
Yes. A fixed service fee (default 0.05 SOL) is injected into every unsigned launch transaction. The fee recipient is configurable via `FEE_RECIPIENT_PUBLIC_KEY`.

### What AI providers are supported?
OpenAI-compatible endpoints (OpenAI, Together, Groq, etc.) and Anthropic. Deterministic fallback works without any API key.

## What is implemented

- Web workstation for launch inputs, AI provider settings, local encrypted API key storage, and API calls.
- Serverless API routes for draft generation, deterministic validation, transaction building, launch result recording, record lookup, and skill prepare.
- OpenAI-compatible and Anthropic provider configuration shape.
- Deterministic fallback launch planner when no model key is provided.
- Launch templates for pump.fun, Raydium LaunchLab, and Meteora DBC.
- Fixed SOL service fee injection into unsigned Solana transactions.
- In-memory launch records and idempotency handling for local MVP development.
- Vitest coverage for validation, transaction construction, and skill prepare.

## Important adapter boundary

The `PumpFunAdapter`, `RaydiumLaunchLabAdapter`, and `MeteoraDbcAdapter` isolate the protocol-specific build surface and return signable transaction payloads with service fee insertion.

`PROTOCOL_SDK_MODE=live` is the default. In live mode:

- pump.fun create-only uses `@pump-fun/pump-sdk` directly and does not require `SOLANA_RPC_URL`.
- pump.fun create-and-buy uses the server-side Solana RPC for SDK state reads.
- Raydium LaunchLab uses the server-side Solana RPC and defaults `configId` / `platformId` from `@raydium-io/raydium-sdk-v2`.
- Meteora DBC uses the server-side Solana RPC. When `METEORA_DBC_CONFIG_ID` is empty, it builds with `createConfigAndPool` / `createConfigAndPoolWithFirstBuy` and generates a launch-specific config signer that the backend partially signs before returning the wallet transaction. When first buy is enabled, Meteora returns a two-transaction group: config creation first, then pool creation / first buy / service fee. When `METEORA_DBC_CONFIG_ID` is set, it uses the existing-config `createPool` / `createPoolWithFirstBuy` path.

The server-side Solana RPC defaults to `https://solana-rpc.publicnode.com`. Set `SOLANA_RPC_URL` only when you want to override it with a private RPC, devnet RPC, or localnet RPC. Set `RAYDIUM_LAUNCHPAD_CONFIG_ID` / `RAYDIUM_LAUNCHPAD_PLATFORM_ID` only when you need to override the SDK defaults. Set `METEORA_DBC_CONFIG_ID` only when you want every Meteora launch to use a pre-created DBC config instead of creating one per launch.

`PROTOCOL_SDK_MODE=dry-run` is retained only for isolated adapter tests and should not be used to produce user-signable launch transactions.

## Commands

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

## Environment

Copy `.env.example` to `.env.local` for local development.

The fixed service fee defaults to `0.05 SOL` and the fee recipient defaults to `HpijwaAmevR4rFCP7kA1iTLB4gUKjhAJE6WkwdorMxzD`.

## API

- `POST /api/launch/draft` — AI or deterministic fallback → DraftRecommendation
- `POST /api/launch/validate` — LaunchDraft → ValidationResult (fee estimate included)
- `POST /api/launch/build-transaction` — LaunchDraft + idempotencyKey → BuildTransactionResult (one or more unsigned serialized transactions, required signers, summary)
- `POST /api/launch/record-result` — record signed/sent/failed outcome
- `GET  /api/launch/:id` — fetch launch record
- `POST /api/skill/launch/prepare` — skill-shaped wrapper around validate + build

Skill/API callers can prepare launch transactions, but user wallet signing remains outside the API.
