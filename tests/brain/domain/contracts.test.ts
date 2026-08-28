import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  complianceCheckSchema,
  creatorArchiveSchema,
  decisionEventSchema,
  draftVariantSchema,
  outcomeSnapshotSchema,
  opportunityForecastSchema,
  opportunitySchema,
  signalEvidenceSchema,
  type Opportunity
} from "../../../src/brain/domain";

const UUID = "00000000-0000-4000-8000-000000000001";
const SECOND_UUID = "00000000-0000-4000-8000-000000000002";
const HASH = "a".repeat(64);

function validSignalEvidence() {
  return {
    schemaVersion: 1,
    id: UUID,
    opportunityId: SECOND_UUID,
    predictionRevision: 1,
    creatorId: "casey-mcdougal",
    source: "synthetic",
    retainedPostId: "900000000000000001",
    capturedAt: "2026-08-27T14:00:00.000Z",
    features: [
      {
        name: "recent-replies",
        rawValue: 12,
        normalizedValue: 0.5,
        normalizationMethod: "min-max",
        baselineId: "baseline-v1",
        observedAt: "2026-08-27T14:00:00.000Z",
        featureCodeVersion: "features-v1"
      }
    ]
  };
}

function validDraftVariant() {
  return {
    schemaVersion: 1,
    id: UUID,
    opportunityId: SECOND_UUID,
    predictionRevision: 1,
    actionType: "reply",
    targetPostId: "900000000000000001",
    content: "A concise reply.",
    angle: "useful counterpoint",
    voiceProfileVersion: "voice-v1",
    modelId: "synthetic-fixture",
    promptTemplateVersion: "prompt-v1",
    qualityScore: 0.8,
    noveltyScore: 0.7,
    createdAt: "2026-08-27T14:00:00.000Z"
  };
}

function validDecisionEvent() {
  return {
    schemaVersion: 1,
    id: UUID,
    opportunityId: SECOND_UUID,
    opportunityRevision: 1,
    type: "approved",
    actor: { type: "human", id: "casey" },
    interface: "mcp",
    occurredAt: "2026-08-27T14:00:00.000Z",
    payload: {
      draftId: UUID,
      draftContentHash: HASH,
      approvalExpiresAt: "2026-08-27T15:00:00.000Z"
    }
  };
}

function validOutcomeSnapshot() {
  return {
    schemaVersion: 1,
    id: UUID,
    opportunityId: SECOND_UUID,
    publishedPostId: "900000000000000001",
    publishedAt: "2026-08-27T14:00:00.000Z",
    observedAt: "2026-08-27T14:45:00.000Z",
    observationAgeMinutes: 45,
    publicMetrics: { views: 1200, likes: 12, replies: 2, reposts: 1, bookmarks: 3 },
    privateMetrics: null,
    source: "synthetic",
    collectionStatus: "complete"
  };
}

function validComplianceCheck() {
  return {
    schemaVersion: 1,
    id: UUID,
    retainedPostId: "900000000000000001",
    checkedAt: "2026-08-27T14:00:00.000Z",
    nextCheckAt: "2026-08-27T20:00:00.000Z",
    status: "active",
    requiredAction: "retain",
    source: "synthetic"
  };
}

function validCreatorArchive() {
  return {
    schemaVersion: 1,
    id: UUID,
    creatorId: "casey-mcdougal",
    source: "legacy-sqlite",
    consentBasis: "casey-requested-import",
    consentRecordedAt: "2026-08-27T14:00:00.000Z",
    sourceFingerprint: HASH,
    importedAt: "2026-08-27T14:00:00.000Z",
    profile: null,
    posts: [
      {
        xPostId: "900000000000000001",
        url: "https://x.com/caseymcdougal/status/900000000000000001",
        text: "Archived post",
        postedAt: "2026-08-27T13:00:00.000Z",
        capturedAt: "2026-08-27T14:00:00.000Z",
        viewsCount: 100,
        likesCount: 2,
        repostsCount: 1,
        repliesCount: 0,
        bookmarksCount: 0
      }
    ],
    voiceProfile: null,
    voiceOverrides: "",
    strategyMemory: null,
    creativeDirections: [],
    importReport: { importedPosts: 1, omittedFields: [] }
  };
}

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

  it("accepts valid immutable record schemas", () => {
    expect(signalEvidenceSchema.parse(validSignalEvidence()).id).toBe(UUID);
    expect(draftVariantSchema.parse(validDraftVariant()).id).toBe(UUID);
    expect(decisionEventSchema.parse(validDecisionEvent()).id).toBe(UUID);
    expect(outcomeSnapshotSchema.parse(validOutcomeSnapshot()).id).toBe(UUID);
    expect(complianceCheckSchema.parse(validComplianceCheck()).id).toBe(UUID);
  });

  it("requires signal evidence to retain at least one feature", () => {
    expect(() => signalEvidenceSchema.parse({ ...validSignalEvidence(), features: [] })).toThrow();
  });

  it("enforces draft action and target consistency", () => {
    expect(() =>
      draftVariantSchema.parse({ ...validDraftVariant(), actionType: "original", targetPostId: "900000000000000001" })
    ).toThrow();
  });

  it("rejects raw content and unknown keys in decision payloads", () => {
    expect(() =>
      decisionEventSchema.parse({
        ...validDecisionEvent(),
        payload: { ...validDecisionEvent().payload, rawPostText: "do not persist this" }
      })
    ).toThrow();
    expect(() =>
      decisionEventSchema.parse({
        ...validDecisionEvent(),
        payload: { ...validDecisionEvent().payload, unexpectedFlag: true }
      })
    ).toThrow();
  });

  it("rejects mismatched decision type and payload variants", () => {
    expect(() =>
      decisionEventSchema.parse({
        ...validDecisionEvent(),
        type: "detected",
        payload: { draftId: UUID, draftContentHash: HASH, approvalExpiresAt: "2026-08-27T15:00:00.000Z" }
      })
    ).toThrow();
  });

  it("requires outcome observations to be truthful", () => {
    expect(outcomeSnapshotSchema.parse(validOutcomeSnapshot()).observationAgeMinutes).toBe(45);
    expect(() =>
      outcomeSnapshotSchema.parse({
        ...validOutcomeSnapshot(),
        observedAt: "2026-08-27T13:59:00.000Z",
        observationAgeMinutes: 0
      })
    ).toThrow();
    expect(() => outcomeSnapshotSchema.parse({ ...validOutcomeSnapshot(), observationAgeMinutes: 2880 })).toThrow();
  });

  it.each([
    ["active", "retain"],
    ["edited", "rehydrate"],
    ["deleted", "purge"],
    ["protected", "purge"],
    ["withheld", "purge"],
    ["suspended", "purge"]
  ] as const)("accepts the %s to %s compliance mapping", (status, requiredAction) => {
    expect(complianceCheckSchema.parse({ ...validComplianceCheck(), status, requiredAction }).status).toBe(status);
  });

  it("rejects invalid compliance mappings and schedules", () => {
    expect(() => complianceCheckSchema.parse({ ...validComplianceCheck(), requiredAction: "purge" })).toThrow();
    expect(() =>
      complianceCheckSchema.parse({ ...validComplianceCheck(), nextCheckAt: "2026-08-28T02:01:00.000Z" })
    ).toThrow();
    expect(() =>
      complianceCheckSchema.parse({ ...validComplianceCheck(), nextCheckAt: "2026-08-27T14:00:00.000Z" })
    ).toThrow();
  });

  it("requires creator archive imports to report the retained post count", () => {
    expect(creatorArchiveSchema.parse(validCreatorArchive()).importReport.importedPosts).toBe(1);
    expect(() =>
      creatorArchiveSchema.parse({
        ...validCreatorArchive(),
        importReport: { importedPosts: 0, omittedFields: [] }
      })
    ).toThrow();
  });
});
