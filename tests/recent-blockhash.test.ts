import { describe, expect, it } from "vitest";
import { resolveBuildRecentBlockhash } from "@/lib/launch/recent-blockhash";

describe("resolveBuildRecentBlockhash", () => {
  it("keeps an explicit recent blockhash when the caller provides one", async () => {
    const blockhash = await resolveBuildRecentBlockhash({
      requestedBlockhash: "caller-blockhash",
      rpcUrl: "https://rpc.example",
      fetchBlockhash: async () => {
        throw new Error("should not fetch");
      }
    });

    expect(blockhash).toBe("caller-blockhash");
  });

  it("fetches a server-side blockhash when RPC is configured", async () => {
    const blockhash = await resolveBuildRecentBlockhash({
      rpcUrl: "https://rpc.example",
      fetchBlockhash: async (rpcUrl) => `blockhash-from:${rpcUrl}`
    });

    expect(blockhash).toBe("blockhash-from:https://rpc.example");
  });

  it("returns undefined when no RPC is configured", async () => {
    await expect(resolveBuildRecentBlockhash({})).resolves.toBeUndefined();
  });

  it("does not block transaction construction when the configured RPC cannot fetch a blockhash", async () => {
    await expect(
      resolveBuildRecentBlockhash({
        rpcUrl: "https://rpc.example",
        fetchBlockhash: async () => {
          throw new Error("failed to get recent blockhash: TypeError: fetch failed");
        }
      })
    ).resolves.toBeUndefined();
  });
});
