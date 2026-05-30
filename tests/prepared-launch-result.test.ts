import { describe, expect, it } from "vitest";
import { getPreparedLaunchResult } from "@/lib/launch/prepared-result";

describe("getPreparedLaunchResult", () => {
  it("extracts build results that can be signed by the browser", () => {
    const result = getPreparedLaunchResult({
      launchRecordId: "launch_1",
      transactions: [{ label: "launch", description: "unsigned", serializedTransaction: "abc" }],
      requiredSigners: ["mint"],
      fee: { serviceFeeLamports: 50_000_000 },
      summary: ["ready"]
    });

    expect(result?.launchRecordId).toBe("launch_1");
    expect(result?.transactions).toHaveLength(1);
    expect(result?.requiredSigners).toEqual(["mint"]);
  });

  it("returns null for draft-only API responses", () => {
    expect(getPreparedLaunchResult({ draft: {}, recommendation: {} })).toBeNull();
  });
});
