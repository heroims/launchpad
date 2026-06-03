# API Overview

Launchpad exposes REST endpoints for every step of the token launch workflow.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/launch/draft` | Generate a draft launch recommendation (AI or deterministic fallback) |
| `POST` | `/api/launch/validate` | Validate a LaunchDraft and return fee estimates |
| `POST` | `/api/launch/build-transaction` | Build unsigned Solana transactions for a validated draft |
| `POST` | `/api/launch/record-result` | Record the outcome (sent/failed) of a signed launch |
| `GET` | `/api/launch/:id` | Fetch a launch record by ID |
| `POST` | `/api/skill/launch/prepare` | Validate + build in one call — designed for AI agent integration |

## Flow

```
Draft → Validate → Build → Sign (client-side) → RecordResult
```

The API never holds private keys. Signing is always performed client-side in the browser wallet.

## Example: curl

```bash
curl -X POST http://localhost:3000/api/launch/validate \
  -H "Content-Type: application/json" \
  -d '{
    "draft": {
      "walletAddress": "GgU...",
      "mintPublicKey": "6gU...",
      "token": {
        "name": "MyToken",
        "symbol": "MYT",
        "description": "A test token",
        "imageUri": "https://example.com/token.png"
      },
      "platform": "pumpfun",
      "budgetSol": 1,
      "firstBuy": { "enabled": false }
    }
  }'
```

## Environment variables

See `.env.example` for all configuration options including service fee, RPC URL, and protocol overrides.
