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

The current `PumpFunAdapter`, `RaydiumLaunchLabAdapter`, and `MeteoraDbcAdapter` isolate the protocol-specific build surface and return signable transaction payloads with service fee insertion. Their internal launch instruction is a deterministic placeholder marker.

Before mainnet or real devnet pool creation, replace each adapter implementation in `lib/launch/adapters.ts` with the official protocol SDK/IDL instruction builders for:

- `pump.fun`
- `Raydium LaunchLab`
- `Meteora DBC`

The API, validator, fee engine, record flow, and UI are structured so the adapter internals can be swapped without changing public API routes.

## Commands

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

## Environment

Copy `.env.example` to `.env.local` for local development.

## API

- `POST /api/launch/draft`
- `POST /api/launch/validate`
- `POST /api/launch/build-transaction`
- `POST /api/launch/record-result`
- `GET /api/launch/:id`
- `POST /api/skill/launch/prepare`

Skill/API callers can prepare launch transactions, but user wallet signing remains outside the API.
