import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  creatorArchiveSchema,
  opportunityForecastSchema,
  opportunitySchema,
  type Opportunity
} from "../../../src/brain/domain";

function validOpportunity(): Opportunity {
  const opportunityId = randomUUID();
  return {
    schemaVersion: 1,
    id: opportunityId,
    creatorId: "casey-mcdougal",
    revision: 1,
    status: "surfaced",
    actionType: "reply",
    targetPostId: "900000000000000001",
    detectedAt: "2026-08-27T14:00:00.000Z",
    publishBy: "2026-08-27T14:20:00.000Z",
    forecast: {
      probability1k24h: 0.62,
      probability1k48h: 0.74,
      viewsP10: 420,
      viewsP50: 1600,
      viewsP90: 6200,
      confidence: 0.71,
      predictedAt: "2026-08-27T14:01:00.000Z",
      calibrationVersion: "synthetic-v1"
    },
    recommendedDraftId: randomUUID(),
    evidenceIds: [randomUUID()],
    provenance: {
      sourceKind: "synthetic",
      pipelineRunId: randomUUID(),
      eligibilityVersion: "eligibility-v1",
      featureVersion: "features-v1",
      strategyVersion: "synthetic-v1",
      voiceProfileVersion: "synthetic-v1",
      judgeModel: "synthetic-fixture",
      promptTemplateVersion: "synthetic-v1",
      forecastPolicyVersion: "synthetic-v1"
    },
    createdAt: "2026-08-27T14:00:00.000Z",
    revisedAt: "2026-08-27T14:01:00.000Z"
  };
}

describe("Social Brain domain contracts", () => {
  it("accepts a complete Opportunity revision", () => {
    expect(opportunitySchema.parse(validOpportunity()).revision).toBe(1);
  });

  it("requires a target for replies and quotes", () => {
    expect(() => opportunitySchema.parse({ ...validOpportunity(), targetPostId: null })).toThrow();
    expect(() =>
      opportunitySchema.parse({ ...validOpportunity(), actionType: "quote", targetPostId: null })
    ).toThrow();
  });

  it("forbids a target on original posts", () => {
    expect(() =>
      opportunitySchema.parse({ ...validOpportunity(), actionType: "original", targetPostId: "1" })
    ).toThrow();
  });

  it("enforces increasing probability windows and view quantiles", () => {
    expect(() =>
      opportunityForecastSchema.parse({
        ...validOpportunity().forecast,
        probability1k24h: 0.8,
        probability1k48h: 0.7
      })
    ).toThrow();
    expect(() =>
      opportunityForecastSchema.parse({ ...validOpportunity().forecast, viewsP10: 2000, viewsP50: 1000 })
    ).toThrow();
  });

  it("allows only Casey-owned creator archives", () => {
    expect(() =>
      creatorArchiveSchema.parse({
        schemaVersion: 1,
        id: randomUUID(),
        creatorId: "someone-else",
        source: "legacy-sqlite",
        consentBasis: "casey-requested-import",
        consentRecordedAt: "2026-08-27T14:00:00.000Z",
        sourceFingerprint: "a".repeat(64),
        importedAt: "2026-08-27T14:00:00.000Z",
        profile: null,
        posts: [],
        voiceProfile: null,
        voiceOverrides: "",
        strategyMemory: null,
        creativeDirections: [],
        importReport: { importedPosts: 0, omittedFields: [] }
      })
    ).toThrow();
  });
});
