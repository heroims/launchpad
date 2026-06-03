# Getting Started with Launchpad

Launch a Solana token on pump.fun, Raydium LaunchLab, or Meteora DBC in minutes.

## Prerequisites

- Node.js 18+ and pnpm
- A browser wallet (Phantom, Backpack, or any Solana wallet that injects `window.solana`)
- (Optional) An API key for OpenAI or Anthropic to use AI draft generation

## Quick start

```bash
git clone <your-repo-url>
cd launchpad
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000` in your browser.

## Launch your first token

1. **Connect a wallet** — click the wallet button in the top bar
2. **Generate a mint keypair** — click "Generate Mint Key" to create a new token mint
3. **Describe your token** — in the Goal field, write something like: *"Launch a meme token called SOLDOGE with symbol $SOLDOG, budget 2 SOL"*
4. **Generate a draft** — click "Generate Draft" (works without an AI key — deterministic fallback kicks in)
5. **Validate** — review the recommended platform, token parameters, and fee estimate
6. **Build transaction** — creates unsigned, serialized Solana transactions
7. **Sign & send** — the browser wallet prompts you to approve and broadcast

## Next steps

- Compare platforms in [compare-platforms.md](compare-platforms.md)
- Explore the API in [api/overview.md](../api/overview.md)
- Learn about architecture in [architecture.md](../architecture.md)
