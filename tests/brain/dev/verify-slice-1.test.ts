import { describe, expect, it } from "vitest";
import { validateSlice1Verification } from "../../../src/brain/dev/verify-slice-1";

const valid = {
  tools: ["explain_prediction", "get_creator_archive", "get_proof_status", "get_system_health", "inspect_opportunity", "list_opportunities"],
  inspection: { opportunity: { id: "20000000-0000-4000-8000-000000000001", revision: 1 }, evidence: [{}, {}, {}] },
  health: { mode: "synthetic", storage: "healthy", liveAdaptersInstalled: false, approvalConfigured: false, latestComplianceCheckedAt: "2026-08-27T14:07:00.000Z", creatorArchive: { available: false, source: null, importedAt: null }, capabilities: [
    { capability: "live-x-read", allowed: false, reason: "live capabilities are disabled in synthetic mode" },
    { capability: "live-ai-judgment", allowed: false, reason: "live capabilities are disabled in synthetic mode" },
    { capability: "live-ai-generation", allowed: false, reason: "live capabilities are disabled in synthetic mode" },
    { capability: "x-write", allowed: false, reason: "live capabilities are disabled in synthetic mode" }
  ] }
};

describe("Slice 1 verifier", () => {
  it("rejects unavailable storage", () => expect(() => validateSlice1Verification({ ...valid, health: { ...valid.health, storage: "unavailable" } })).toThrow());
  it("rejects an unexpected runtime mode", () => expect(() => validateSlice1Verification({ ...valid, health: { ...valid.health, mode: "production" } })).toThrow());
  it("rejects any allowed live capability", () => expect(() => validateSlice1Verification({ ...valid, health: { ...valid.health, capabilities: [{ ...valid.health.capabilities[0], allowed: true }, ...valid.health.capabilities.slice(1)] } })).toThrow());
});
