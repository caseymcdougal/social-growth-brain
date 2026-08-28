import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../../../src/brain/config/runtime-config";

const databaseUrl = "postgresql://social_brain:social_brain@127.0.0.1:54329/social_brain_test";

describe("loadRuntimeConfig", () => {
  it("uses the safe synthetic defaults", () => {
    expect(loadRuntimeConfig({})).toEqual({
      mode: "synthetic",
      databaseUrl
    });
  });

  it("rejects production configuration without an approval reference and spend limits", () => {
    expect(() => loadRuntimeConfig({
      SOCIAL_BRAIN_MODE: "production",
      SOCIAL_BRAIN_DATABASE_URL: databaseUrl
    })).toThrow();
  });

  it("rejects production configuration when the daily spend limit exceeds the monthly limit", () => {
    expect(() => loadRuntimeConfig({
      SOCIAL_BRAIN_MODE: "production",
      SOCIAL_BRAIN_DATABASE_URL: databaseUrl,
      SOCIAL_BRAIN_X_APPROVAL_REFERENCE: "approved-by-casey",
      SOCIAL_BRAIN_DAILY_SPEND_LIMIT_USD: "101",
      SOCIAL_BRAIN_MONTHLY_SPEND_LIMIT_USD: "100"
    })).toThrow();
  });
});
