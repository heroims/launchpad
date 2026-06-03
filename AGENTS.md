# AGENTS.md

API-first Solana launch workstation (Next.js 15 App Router, TypeScript strict, pnpm).

## Commands

There is **no `lint` or `typecheck` script**. The only verification is `pnpm test` (Vitest).

```bash
pnpm install      # uses .pnpm-store
pnpm dev          # next dev
pnpm build        # next build
pnpm test         # vitest run (one-shot)
pnpm test:watch   # vitest watch
pnpm start        # next start
```

`tsconfig.json` has `strict: true` and `ignoreDeprecations: "6.0"` — leave both alone.

## Environment

Copy `.env.example` to `.env.local` (gitignored). All vars are optional except none are strictly required to run the app, but `build-transaction` will hit the default public RPC.

| Var | Default | Notes |
|---|---|---|
| `LAUNCH_FEE_LAMPORTS` | `50000000` (0.05 SOL) | Fixed service fee injected into every unsigned launch tx |
| `FEE_RECIPIENT_PUBLIC_KEY` | `HpijwaAmevR4rFCP7kA1iTLB4gUKjhAJE6WkwdorMxzD` | Receives the service fee |
| `PROTOCOL_SDK_MODE` | `live` | See warning below |
| `SOLANA_RPC_URL` | `https://solana-rpc.publicnode.com` | Only override for private / devnet / localnet |
| `RAYDIUM_LAUNCHPAD_CONFIG_ID` / `RAYDIUM_LAUNCHPAD_PLATFORM_ID` | SDK defaults | Raydium override only |
| `METEORA_DBC_CONFIG_ID` | empty | See Meteora note below |

## Protocol SDK mode

`PROTOCOL_SDK_MODE=live` is the default and the only mode that produces user-signable transactions. `dry-run` is retained for `tests/protocol-adapters.test.ts`-style isolation and `buildLaunchTransaction` will throw if called in dry-run. Don't flip the default.

## Layout

- `app/page.tsx` — client workbench UI (form, AI provider settings, browser wallet)
- `app/sign/[id]/page.tsx` — post-build signing flow
- `app/api/launch/{draft,validate,build-transaction,record-result}/route.ts` — REST surface
- `app/api/launch/[id]/route.ts` — record lookup
- `app/api/skill/launch/prepare/route.ts` — `POST` skill entrypoint
- `lib/launch/` — adapters, validator, transaction builder, repository, templates, types
- `lib/wallet/` — browser wallet + mint keypair + sign-and-send
- `lib/i18n/` — DIY Context-based i18n (zh/en switch, no external library)
- `lib/ai/providers.ts` — OpenAI-compatible + Anthropic draft generation, deterministic fallback
- `lib/skill/prepare-launch.ts` — backs `/api/skill/launch/prepare`
- `tests/*.test.ts` — Vitest specs (Node env, alias `@` → repo root)

Path alias `@/*` → repo root (see `tsconfig.json` and `vitest.config.ts`).

## Things that will trip you up

- **In-memory store.** `lib/launch/repository.ts` keeps launch records in process memory. Restarting `next dev` wipes records and build payloads. Don't add persistence without asking.
- **Meteora DBC partial signing.** When `METEORA_DBC_CONFIG_ID` is empty the adapter calls `createConfigAndPool` / `createConfigAndPoolWithFirstBuy` and the backend partially signs a launch-specific config signer before returning the wallet transaction. With first-buy enabled it returns a **two-transaction group** (config creation, then pool + first buy + service fee). Setting `METEORA_DBC_CONFIG_ID` switches to the `createPool` / `createPoolWithFirstBuy` path with no partial signing.
- **pump.fun create-only** does not require `SOLANA_RPC_URL` (uses `PumpSdk` directly); create-and-buy and the other two platforms do.
- **Idempotency.** `build-transaction` scopes the caller-supplied key by hashing the stable-stringified draft, so identical drafts reuse the same launch record id.
- **No ESLint, no Prettier, no CI, no pre-commit hooks.** Don't assume `pnpm lint` works — it doesn't. Match existing style from neighboring files.
- **No `next.config.*`.** Next.js defaults apply; if you need config changes, add the file deliberately.
- **Tests are Vitest + Node**, not jsdom. Browser-wallet tests stub the global, they don't load a real DOM.
- **i18n system.** `lib/i18n/` implements a DIY Context-based locale switch (zh/en). `I18nProvider` reads `localStorage` then `navigator.language` on mount. API errors are translated client-side by mapping `LaunchIssue.code` → `t("errors." + code)`. The locale toggle writes both localStorage and a cookie (`launchpad.locale`, 7d, path=/). No external i18n library. See `messages.ts` for the full key set.

## API quick reference

`POST /api/launch/draft` — AI (or deterministic fallback) → `DraftRecommendation`
`POST /api/launch/validate` — `LaunchDraft` → `ValidationResult` (fee estimate included)
`POST /api/launch/build-transaction` — `LaunchDraft` + `idempotencyKey` → `BuildTransactionResult` (one or more unsigned serialized transactions, required signers, summary)
`POST /api/launch/record-result` — record signed/sent/failed outcome
`GET  /api/launch/:id` — fetch record
`POST /api/skill/launch/prepare` — skill-shaped wrapper around validate + build

User wallet signing is always done client-side (`lib/wallet/launch-signing.ts` + `app/sign/[id]/page.tsx`); the API never holds keys.
