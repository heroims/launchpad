# Platform Comparison

Launchpad supports three Solana launch platforms. Here is how they compare.

## pump.fun

| Aspect | Detail |
|---|---|
| **Mechanism** | Bonding curve |
| **RPC required** | No (create-only) / Yes (create-and-buy) |
| **First buy** | Optional — create-only or create-and-buy |
| **Signers** | Fee payer + mint authority |
| **Best for** | Meme tokens, rapid launches, low initial liquidity |

## Raydium LaunchLab

| Aspect | Detail |
|---|---|
| **Mechanism** | AMM pool (constant product) |
| **RPC required** | Yes |
| **Config ID** | Default from SDK or override via `RAYDIUM_LAUNCHPAD_CONFIG_ID` |
| **Platform ID** | Default from SDK or override via `RAYDIUM_LAUNCHPAD_PLATFORM_ID` |
| **Best for** | Tokens that need immediate DEX liquidity |

## Meteora DBC

| Aspect | Detail |
|---|---|
| **Mechanism** | Dynamic bonding curve |
| **RPC required** | Yes |
| **Config ID** | Auto-created per launch, or pre-configured via `METEORA_DBC_CONFIG_ID` |
| **Partial signing** | Backend partially signs a launch-specific config signer |
| **First buy** | Returns 2-transaction group (config creation, then pool + buy + fee) |
| **Best for** | Custom curve parameters, advanced launch mechanics |

## Comparison summary

| Feature | pump.fun | Raydium LaunchLab | Meteora DBC |
|---|---|---|---|
| Create-only | ✅ | ✅ | ✅ |
| Create-and-buy | ✅ | — | ✅ |
| No RPC needed (create-only) | ✅ | ❌ | ❌ |
| Client-side signing | ✅ | ✅ | ✅ |
| Configurable fee | ✅ | ✅ | ✅ |
| In-memory idempotency | ✅ | ✅ | ✅ |
