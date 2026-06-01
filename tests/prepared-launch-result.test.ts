import { describe, expect, it } from "vitest";
import { getPreparedLaunchResult, getPreparedTransactionSteps } from "@/lib/launch/prepared-result";

describe("getPreparedLaunchResult", () => {
  it("extracts build results that can be signed by the browser", () => {
    const result = getPreparedLaunchResult({
      launchRecordId: "launch_1",
      platform: "pumpfun",
      transactions: [{ label: "launch", description: "unsigned", serializedTransaction: "abc" }],
      requiredSigners: ["mint"],
      fee: { serviceFeeLamports: 50_000_000 },
      summary: ["ready"]
    });

    expect(result?.launchRecordId).toBe("launch_1");
    expect(result?.platform).toBe("pumpfun");
    expect(result?.transactions).toHaveLength(1);
    expect(result?.requiredSigners).toEqual(["mint"]);
  });

  it("returns null for draft-only API responses", () => {
    expect(getPreparedLaunchResult({ draft: {}, recommendation: {} })).toBeNull();
  });

  it("formats prepared transaction payloads as ordered signing steps", () => {
    const steps = getPreparedTransactionSteps({
      launchRecordId: "launch_1",
      platform: "meteora_dbc",
      transactions: [
        { label: "meteora-create-config", description: "Create config.", serializedTransaction: "abc" },
        { label: "meteora-create-pool-first-buy", description: "Create pool and first buy.", serializedTransaction: "def" }
      ],
      requiredSigners: [],
      fee: { serviceFeeLamports: 50_000_000 },
      summary: []
    });

    expect(steps).toEqual([
      { index: 1, total: 2, label: "meteora-create-config", description: "Create config." },
      { index: 2, total: 2, label: "meteora-create-pool-first-buy", description: "Create pool and first buy." }
    ]);
  });
});
