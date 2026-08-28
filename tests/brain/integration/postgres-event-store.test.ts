import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  complianceCheckSchema,
  creatorArchiveSchema,
  decisionEventSchema,
  draftVariantSchema,
  outcomeSnapshotSchema,
  signalEvidenceSchema,
  type ComplianceCheck,
  type CreatorArchive,
  type DecisionEvent,
  type DraftVariant,
  type Opportunity,
  type OutcomeSnapshot,
  type SignalEvidence
} from "../../../src/brain/domain";
import { runMigrations } from "../../../src/brain/storage/migrations";
import { PostgresBrainEventStore } from "../../../src/brain/storage/postgres-event-store";
import { createPostgresPool } from "../../../src/brain/storage/postgres";
import {
  assertConnectedTestDatabase,
  assertTestDatabaseUrl,
  TEST_DATABASE_URL,
  truncateBrainTables
} from "./postgres-test-harness";

const IDS = {
  opportunity: "00000000-0000-4000-8000-000000000001",
  evidence: "00000000-0000-4000-8000-000000000002",
  draft: "00000000-0000-4000-8000-000000000003",
  decision: "00000000-0000-4000-8000-000000000004",
  outcome: "00000000-0000-4000-8000-000000000005",
  compliance: "00000000-0000-4000-8000-000000000006",
  archive: "00000000-0000-4000-8000-000000000007",
  pipeline: "00000000-0000-4000-8000-000000000008"
} as const;
const HASH = "a".repeat(64);
const T0 = "2026-08-27T14:00:00.000Z";
const T1 = "2026-08-27T14:01:00.000Z";

function opportunity(revision: number, status: Opportunity["status"] = "surfaced"): Opportunity {
  return {
    schemaVersion: 1, id: IDS.opportunity, creatorId: "casey-mcdougal", revision, status,
    actionType: "reply", targetPostId: "900000000000000001", detectedAt: T0,
    publishBy: "2026-08-27T14:20:00.000Z",
    forecast: { probability1k24h: 0.62, probability1k48h: 0.74, viewsP10: 420, viewsP50: 1600, viewsP90: 6200, confidence: 0.71, predictedAt: T1, calibrationVersion: "synthetic-v1" },
    recommendedDraftId: IDS.draft, evidenceIds: [IDS.evidence],
    provenance: { sourceKind: "synthetic", pipelineRunId: IDS.pipeline, eligibilityVersion: "eligibility-v1", featureVersion: "features-v1", strategyVersion: "strategy-v1", voiceProfileVersion: "voice-v1", judgeModel: "synthetic-fixture", promptTemplateVersion: "prompt-v1", forecastPolicyVersion: "forecast-v1" },
    createdAt: T0, revisedAt: revision === 1 ? T1 : "2026-08-27T14:02:00.000Z"
  };
}

const evidence: SignalEvidence = { schemaVersion: 1, id: IDS.evidence, opportunityId: IDS.opportunity, predictionRevision: 1, creatorId: "casey-mcdougal", source: "synthetic", retainedPostId: "900000000000000001", capturedAt: T1, features: [{ name: "recent-replies", rawValue: 12, normalizedValue: 0.5, normalizationMethod: "min-max", baselineId: "baseline-v1", observedAt: T1, featureCodeVersion: "features-v1" }] };
const draft: DraftVariant = { schemaVersion: 1, id: IDS.draft, opportunityId: IDS.opportunity, predictionRevision: 1, actionType: "reply", targetPostId: "900000000000000001", content: "A concise reply.", angle: "useful counterpoint", voiceProfileVersion: "voice-v1", modelId: "synthetic-fixture", promptTemplateVersion: "prompt-v1", qualityScore: 0.8, noveltyScore: 0.7, createdAt: T1 };
const decision: DecisionEvent = { schemaVersion: 1, id: IDS.decision, opportunityId: IDS.opportunity, opportunityRevision: 1, type: "approved", actor: { type: "human", id: "casey" }, interface: "mcp", occurredAt: T1, payload: { draftId: IDS.draft, draftContentHash: HASH, approvalExpiresAt: "2026-08-27T15:00:00.000Z" } };
const outcome: OutcomeSnapshot = { schemaVersion: 1, id: IDS.outcome, opportunityId: IDS.opportunity, publishedPostId: "900000000000000001", publishedAt: T0, observedAt: "2026-08-27T14:45:00.000Z", observationAgeMinutes: 45, publicMetrics: { views: 1200, likes: 12, replies: 2, reposts: 1, bookmarks: 3 }, privateMetrics: null, source: "synthetic", collectionStatus: "complete" };
const compliance: ComplianceCheck = { schemaVersion: 1, id: IDS.compliance, retainedPostId: "900000000000000001", checkedAt: T1, nextCheckAt: "2026-08-27T20:00:00.000Z", status: "active", requiredAction: "retain", source: "synthetic" };
const archive: CreatorArchive = { schemaVersion: 1, id: IDS.archive, creatorId: "casey-mcdougal", source: "legacy-sqlite", consentBasis: "casey-requested-import", consentRecordedAt: T0, sourceFingerprint: HASH, importedAt: T1, profile: null, posts: [{ xPostId: "900000000000000001", url: "https://x.com/caseymcdougal/status/900000000000000001", text: "Archived post", postedAt: T0, capturedAt: T1, viewsCount: 100, likesCount: 2, repostsCount: 1, repliesCount: 0, bookmarksCount: 0 }], voiceProfile: null, voiceOverrides: "", strategyMemory: null, creativeDirections: [], importReport: { importedPosts: 1, omittedFields: [] } };

assertTestDatabaseUrl(TEST_DATABASE_URL);
let pool: Pool;
let store: PostgresBrainEventStore;

describe("PostgresBrainEventStore", () => {
  beforeAll(async () => {
    pool = createPostgresPool(TEST_DATABASE_URL);
    await assertConnectedTestDatabase(pool);
    store = new PostgresBrainEventStore(pool);
    await runMigrations(pool);
  });
  beforeEach(async () => { await truncateBrainTables(pool); });
  afterAll(async () => { await pool.end(); });

  it("retains opportunity revisions while projecting the newest revision", async () => {
    await store.appendOpportunityRevision(opportunity(1));
    await store.appendOpportunityRevision(opportunity(2, "approved"));
    expect((await store.getOpportunity(IDS.opportunity))?.revision).toBe(2);
    expect((await store.getOpportunityRevision(IDS.opportunity, 1))?.revision).toBe(1);
  });

  it("rolls back every callback write when an exclusive transaction fails", async () => {
    await expect(store.withExclusiveLock("rollback-test", async (transaction) => {
      await transaction.appendOpportunityRevision(opportunity(1));
      throw new Error("force rollback");
    })).rejects.toThrow("force rollback");
    await expect(store.getOpportunity(IDS.opportunity)).resolves.toBeNull();
    await expect(store.getOpportunityRevision(IDS.opportunity, 1)).resolves.toBeNull();
  });

  it("serializes callbacks holding the same exclusive key", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = store.withExclusiveLock("serialize-test", async () => {
      order.push("first-start");
      await firstMayFinish;
      order.push("first-end");
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = store.withExclusiveLock("serialize-test", async () => { order.push("second"); });
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("round-trips immutable records through their domain parsers", async () => {
    await store.appendOpportunityRevision(opportunity(1));
    await store.appendSignalEvidence(evidence); await store.appendDraftVariant(draft);
    await store.appendDecisionEvent(decision); await store.appendOutcomeSnapshot(outcome);
    await store.appendComplianceCheck(compliance); await store.appendCreatorArchive(archive);
    expect(signalEvidenceSchema.parse((await store.listSignalEvidence(IDS.opportunity))[0])).toEqual(evidence);
    expect(draftVariantSchema.parse((await store.listDraftVariants(IDS.opportunity))[0])).toEqual(draft);
    expect(decisionEventSchema.parse((await store.listDecisionEvents(IDS.opportunity))[0])).toEqual(decision);
    expect(outcomeSnapshotSchema.parse((await store.listOutcomeSnapshots(IDS.opportunity))[0])).toEqual(outcome);
    expect(complianceCheckSchema.parse((await store.listComplianceChecks())[0])).toEqual(compliance);
    expect(creatorArchiveSchema.parse(await store.getLatestCreatorArchive())).toEqual(archive);
  });

  it("rejects duplicate opportunity revisions", async () => {
    await store.appendOpportunityRevision(opportunity(1));
    await expect(store.appendOpportunityRevision(opportunity(1))).rejects.toThrow();
  });

  it("rejects a decision event for an opportunity revision that does not exist", async () => {
    await store.appendOpportunityRevision(opportunity(1));
    await expect(store.appendDecisionEvent({ ...decision, opportunityRevision: 999 })).rejects.toThrow();
  });

  it("blocks direct update and delete of every append-only table", async () => {
    await store.appendOpportunityRevision(opportunity(1)); await store.appendSignalEvidence(evidence); await store.appendDraftVariant(draft);
    await store.appendDecisionEvent(decision); await store.appendOutcomeSnapshot(outcome); await store.appendComplianceCheck(compliance); await store.appendCreatorArchive(archive);
    for (const table of ["brain_opportunity_revisions", "brain_signal_evidence", "brain_draft_variants", "brain_decision_events", "brain_outcome_snapshots", "brain_compliance_checks", "brain_creator_archives"]) {
      await expect(pool.query(`UPDATE ${table} SET payload = payload`)).rejects.toThrow();
      await expect(pool.query(`DELETE FROM ${table}`)).rejects.toThrow();
    }
  });

  it("returns ascending history and does not replace a projection with a stale revision", async () => {
    await store.appendOpportunityRevision(opportunity(2, "approved"));
    await store.appendOpportunityRevision(opportunity(1));
    expect((await store.listOpportunityRevisions(IDS.opportunity)).map((value) => value.revision)).toEqual([1, 2]);
    expect((await store.getOpportunity(IDS.opportunity))?.revision).toBe(2);
  });

  it("refuses destructive cleanup for non-test databases", () => {
    expect(() => assertTestDatabaseUrl("postgresql://user:pass@localhost/social_brain")).toThrow("Refusing destructive test cleanup");
  });

  it("accepts the configured connected test database and rejects a mismatched test URL", async () => {
    await expect(assertConnectedTestDatabase(pool)).resolves.toBeUndefined();
    await expect(
      assertConnectedTestDatabase(pool, "postgresql://social_brain:social_brain@127.0.0.1:54329/another_test")
    ).rejects.toThrow("Refusing test database operation");
  });

  it("rejects invalid opportunity query limits and statuses at the adapter boundary", async () => {
    for (const query of [
      { limit: 1.5 }, { limit: Number.NaN }, { limit: Number.POSITIVE_INFINITY }, { limit: 0 }, { limit: 101 },
      { statuses: ["not-a-status"] }
    ]) {
      await expect(store.listOpportunities(query as never)).rejects.toThrow();
    }
  });

  it("runs migrations after the process changes to a temporary directory", async () => {
    const originalCwd = process.cwd();
    const temporaryCwd = await mkdtemp(join(tmpdir(), "social-brain-migration-"));
    try {
      process.chdir(temporaryCwd);
      await vi.resetModules();
      const { runMigrations: runFromTemporaryCwd } = await import("../../../src/brain/storage/migrations");
      await pool.query("DELETE FROM brain_schema_migrations WHERE version = $1", [1]);
      await runFromTemporaryCwd(pool);
    } finally {
      process.chdir(originalCwd);
      await rm(temporaryCwd, { recursive: true, force: true });
    }
  });
});
