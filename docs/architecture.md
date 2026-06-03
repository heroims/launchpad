# Architecture

Launchpad is a Next.js 15 App Router application with strict TypeScript, designed as an API-first launch workstation.

## Layered design

```
┌─────────────────────────────────┐
│         Browser (client)         │
│  Wallet · Mint Keypair · UI     │
└────────────┬────────────────────┘
             │ REST
┌────────────▼────────────────────┐
│     Next.js API Routes           │
│  /api/launch/{draft,validate,   │
│  build-transaction,record-result │
│  /api/skill/launch/prepare       │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│       lib/launch/                │
│  Adapters · Validator · Builder │
│  Repository · Templates · Types │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  Protocol SDKs + Solana RPC     │
│  pump.fun · Raydium · Meteora  │
└─────────────────────────────────┘
```

## Key modules

- **`lib/launch/adapters/`** — protocol-specific logic for pump.fun, Raydium LaunchLab, and Meteora DBC. Each adapter returns signable transaction payloads with service fee insertion.
- **`lib/launch/validator.ts`** — deterministic launch draft validation, fee estimation.
- **`lib/launch/builder.ts`** — assembles unsigned transactions from validated drafts.
- **`lib/launch/repository.ts`** — in-memory launch record store with idempotency hash.
- **`lib/wallet/`** — browser wallet detection, mint keypair generation, sign-and-send logic.
- **`lib/ai/providers.ts`** — OpenAI-compatible and Anthropic providers with deterministic fallback.
- **`lib/i18n/`** — DIY locale switch (zh/en) via React Context.

## Security model

- Backend never holds or transmits private keys
- Mint keypairs are generated client-side, stored in sessionStorage only
- AI provider API keys are encrypted with AES-256-GCM before localStorage persistence
- Wallet signing is entirely in the browser via `window.solana` (Phantom/Backpack etc.)
- Service fee is injected server-side but the transaction is returned unsigned for user review

## Data flow

1. User submits launch parameters via the workbench UI
2. API generates/validates/builds transactions using protocol SDKs
3. Unsigned transactions (serialized) are returned to the browser
4. Browser wallet deserializes, prompts user, signs, and broadcasts
5. Result is recorded back to the API
