import { describe, expect, it } from "vitest";
import { type RuntimeConfig } from "../../../src/brain/config/runtime-config";
import { createPolicyGate } from "../../../src/brain/policy/policy-gate";

const productionConfig: RuntimeConfig = {
  mode: "production",
  databaseUrl: "postgresql://social_brain:placeholder@db.example.invalid/social_brain?sslmode=require",
  xApprovalReference: "approved-by-casey",
  dailySpendLimitUsd: 50,
  monthlySpendLimitUsd: 100
};

describe("createPolicyGate", () => {
  it("denies every live capability in synthetic mode", () => {
    const gate = createPolicyGate({
      mode: "synthetic",
      databaseUrl: "postgresql://social_brain:social_brain@127.0.0.1:54329/social_brain_test"
    });

    for (const capability of ["live-x-read", "live-ai-judgment", "live-ai-generation", "x-write"] as const) {
      expect(gate.check(capability)).toMatchObject({ allowed: false, mode: "synthetic" });
      expect(() => gate.assertAllowed(capability)).toThrow("synthetic mode");
    }
  });

  it("does not enable live capabilities from valid production configuration alone", () => {
    const gate = createPolicyGate(productionConfig);

    expect(gate.check("live-x-read")).toMatchObject({ allowed: false, mode: "production" });
  });

  it("allows only explicitly installed production capability adapters", () => {
    const gate = createPolicyGate(productionConfig, { installedCapabilities: ["live-x-read"] });

    expect(gate.check("live-x-read")).toMatchObject({ allowed: true, mode: "production" });
    expect(gate.check("x-write")).toMatchObject({ allowed: false, mode: "production" });
  });

  it.each([
    { ...productionConfig, xApprovalReference: " " },
    { ...productionConfig, dailySpendLimitUsd: -1 },
    { ...productionConfig, monthlySpendLimitUsd: Number.NaN },
    { ...productionConfig, databaseUrl: "postgresql://db.example.invalid/social_brain" },
    { mode: "staging" }
  ])("rejects invalid hand-built runtime configuration %j", (invalidConfig) => {
    expect(() => createPolicyGate(invalidConfig as RuntimeConfig)).toThrow();
  });

  it("rejects unreviewed capability strings at every policy boundary", () => {
    expect(() => createPolicyGate(productionConfig, {
      installedCapabilities: ["future-unreviewed-operation"] as never
    })).toThrow();

    const gate = createPolicyGate(productionConfig);
    expect(() => gate.check("future-unreviewed-operation" as never)).toThrow();
    expect(() => gate.assertAllowed("future-unreviewed-operation" as never)).toThrow();
  });
});
