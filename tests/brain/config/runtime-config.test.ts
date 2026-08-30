import { describe, expect, it } from "vitest";
import { loadRuntimeConfig, runtimeConfigSchema } from "../../../src/brain/config/runtime-config";

const databaseUrl = "postgresql://social_brain:social_brain@127.0.0.1:54329/social_brain_test";
const productionDatabaseUrl = "postgresql://social_brain:placeholder@db.example.invalid/social_brain?sslmode=verify-full";

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
      SOCIAL_BRAIN_DATABASE_URL: productionDatabaseUrl,
      SOCIAL_BRAIN_X_APPROVAL_REFERENCE: "approved-by-casey",
      SOCIAL_BRAIN_DAILY_SPEND_LIMIT_USD: "101",
      SOCIAL_BRAIN_MONTHLY_SPEND_LIMIT_USD: "100"
    })).toThrow();
  });

  it("exports a runtime schema that validates configurations handed across runtime boundaries", () => {
    expect(runtimeConfigSchema.parse({
      mode: "production",
      databaseUrl: productionDatabaseUrl,
      xApprovalReference: "approved-by-casey",
      dailySpendLimitUsd: 1,
      monthlySpendLimitUsd: 2
    })).toMatchObject({ mode: "production", dailySpendLimitUsd: 1, monthlySpendLimitUsd: 2 });
  });

  it.each(["0x10", "1e2", "10.001", "+10", "-10", "NaN", "Infinity", "", " "])(
    "rejects non-plain USD input %j",
    (limit) => {
      expect(() => loadRuntimeConfig({
        SOCIAL_BRAIN_MODE: "production",
        SOCIAL_BRAIN_DATABASE_URL: productionDatabaseUrl,
        SOCIAL_BRAIN_X_APPROVAL_REFERENCE: "approved-by-casey",
        SOCIAL_BRAIN_DAILY_SPEND_LIMIT_USD: limit,
        SOCIAL_BRAIN_MONTHLY_SPEND_LIMIT_USD: "100"
      })).toThrow();
    }
  );

  it("accepts exact two-decimal USD values and compares their cents exactly", () => {
    expect(loadRuntimeConfig({
      SOCIAL_BRAIN_MODE: "production",
      SOCIAL_BRAIN_DATABASE_URL: productionDatabaseUrl,
      SOCIAL_BRAIN_X_APPROVAL_REFERENCE: "approved-by-casey",
      SOCIAL_BRAIN_DAILY_SPEND_LIMIT_USD: "0.10",
      SOCIAL_BRAIN_MONTHLY_SPEND_LIMIT_USD: "0.10"
    })).toMatchObject({ dailySpendLimitUsd: 0.1, monthlySpendLimitUsd: 0.1 });
    expect(() => loadRuntimeConfig({
      SOCIAL_BRAIN_MODE: "production",
      SOCIAL_BRAIN_DATABASE_URL: productionDatabaseUrl,
      SOCIAL_BRAIN_X_APPROVAL_REFERENCE: "approved-by-casey",
      SOCIAL_BRAIN_DAILY_SPEND_LIMIT_USD: "1.01",
      SOCIAL_BRAIN_MONTHLY_SPEND_LIMIT_USD: "1.00"
    })).toThrow();
  });

  it("rejects values whose cents exceed Number.MAX_SAFE_INTEGER", () => {
    expect(() => loadRuntimeConfig({
      SOCIAL_BRAIN_MODE: "production",
      SOCIAL_BRAIN_DATABASE_URL: productionDatabaseUrl,
      SOCIAL_BRAIN_X_APPROVAL_REFERENCE: "approved-by-casey",
      SOCIAL_BRAIN_DAILY_SPEND_LIMIT_USD: "90071992547409.92",
      SOCIAL_BRAIN_MONTHLY_SPEND_LIMIT_USD: "90071992547409.92"
    })).toThrow();
  });

  it("rejects safe-cent inputs whose public dollar number loses a cent", () => {
    expect(() => loadRuntimeConfig({
      SOCIAL_BRAIN_MODE: "production",
      SOCIAL_BRAIN_DATABASE_URL: productionDatabaseUrl,
      SOCIAL_BRAIN_X_APPROVAL_REFERENCE: "approved-by-casey",
      SOCIAL_BRAIN_DAILY_SPEND_LIMIT_USD: "90071992547409.91",
      SOCIAL_BRAIN_MONTHLY_SPEND_LIMIT_USD: "90071992547409.91"
    })).toThrow();
  });

  it.each([
    ["not-a-url", "synthetic"],
    ["https://db.example.invalid/social_brain_test", "synthetic"],
    ["postgresql:///social_brain_test", "synthetic"],
    ["postgresql://db.example.invalid/", "synthetic"],
    ["postgresql://db.example.invalid/social_brain", "synthetic"]
  ])("rejects unsafe synthetic database URL %s", (unsafeDatabaseUrl) => {
    expect(() => loadRuntimeConfig({ SOCIAL_BRAIN_DATABASE_URL: unsafeDatabaseUrl })).toThrow();
  });

  it.each([
    "postgresql://db.example.invalid/social_brain",
    "postgresql://db.example.invalid/social_brain?sslmode=require",
    "postgresql://db.example.invalid/social_brain?sslmode=verify-ca",
    "postgresql://db.example.invalid/social_brain?sslmode=require&uselibpqcompat=true",
    "postgresql://db.example.invalid/social_brain_test?sslmode=verify-full",
    "postgresql://db.example.invalid/social_brain%5Ftest?sslmode=verify-full",
    "postgresql://db.example.invalid/social_brain/?sslmode=verify-full",
    "postgresql://db.example.invalid//social_brain?sslmode=verify-full",
    "postgresql://db.example.invalid/social/brain?sslmode=verify-full",
    "postgresql://db.example.invalid/social_brain?sslmode=require&sslmode=disable",
    "postgresql://db.example.invalid/social_brain?sslmode=verify-full&sslmode=verify-full",
    "http://db.example.invalid/social_brain?sslmode=require",
    "postgresql:///social_brain?sslmode=require",
    "postgresql://db.example.invalid/?sslmode=require"
  ])("rejects insecure or invalid production database URL %s", (unsafeDatabaseUrl) => {
    expect(() => loadRuntimeConfig({
      SOCIAL_BRAIN_MODE: "production",
      SOCIAL_BRAIN_DATABASE_URL: unsafeDatabaseUrl,
      SOCIAL_BRAIN_X_APPROVAL_REFERENCE: "approved-by-casey",
      SOCIAL_BRAIN_DAILY_SPEND_LIMIT_USD: "1",
      SOCIAL_BRAIN_MONTHLY_SPEND_LIMIT_USD: "2"
    })).toThrow();
  });

  it.each([
    "postgresql://db.example.invalid/social_brain_test/",
    "postgresql://db.example.invalid//social_brain_test",
    "postgresql://db.example.invalid/social/brain_test"
  ])("rejects synthetic database paths that are not exactly one segment %s", (unsafeDatabaseUrl) => {
    expect(() => loadRuntimeConfig({ SOCIAL_BRAIN_DATABASE_URL: unsafeDatabaseUrl })).toThrow();
  });

  it("uses decoded database names for mode isolation", () => {
    expect(loadRuntimeConfig({
      SOCIAL_BRAIN_DATABASE_URL: "postgresql://db.example.invalid/social_brain%5Ftest"
    })).toMatchObject({ mode: "synthetic" });
  });
});
