# Launchpad

API-first Solana launch workstation built with Next.js App Router.

## What is implemented

- Web workstation for launch inputs, AI provider settings, local encrypted API key storage, and API calls.
- Serverless API routes for draft generation, deterministic validation, transaction building, launch result recording, record lookup, and skill prepare.
- OpenAI-compatible and Anthropic provider configuration shape.
- Deterministic fallback launch planner when no model key is provided.
- Launch templates for `pump.fun`, `Raydium LaunchLab`, and `Meteora DBC`.
- Fixed SOL service fee injection into unsigned Solana transactions.
- In-memory launch records and idempotency handling for local MVP development.
- Vitest coverage for validation, transaction construction, and skill prepare.

## Important adapter boundary

The `PumpFunAdapter`, `RaydiumLaunchLabAdapter`, and `MeteoraDbcAdapter` isolate the protocol-specific build surface and return signable transaction payloads with service fee insertion.

`PROTOCOL_SDK_MODE=live` is the default. In live mode:

- `pump.fun` create-only uses `@pump-fun/pump-sdk` directly and does not require `SOLANA_RPC_URL`.
- `pump.fun` create-and-buy requires `SOLANA_RPC_URL` for SDK state reads.
- `Raydium LaunchLab` requires `SOLANA_RPC_URL`, `RAYDIUM_LAUNCHPAD_CONFIG_ID`, and `RAYDIUM_LAUNCHPAD_PLATFORM_ID`.
- `Meteora DBC` requires `SOLANA_RPC_URL` and `METEORA_DBC_CONFIG_ID`.

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

- `POST /api/launch/draft`
- `POST /api/launch/validate`
- `POST /api/launch/build-transaction`
- `POST /api/launch/record-result`
- `GET /api/launch/:id`
- `POST /api/skill/launch/prepare`

Skill/API callers can prepare launch transactions, but user wallet signing remains outside the API.
