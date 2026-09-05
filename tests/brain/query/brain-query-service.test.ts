import { describe, expect, it } from "vitest";
import fixture from "../../../src/brain/replay/fixtures/synthetic-replay.json";
import { replayFixtureSchema } from "../../../src/brain/replay/replay-schema";
import type { BrainEventStore } from "../../../src/brain/storage/event-store";
import { BrainQueryService } from "../../../src/brain/query/brain-query-service";
import { acceptedCreatorBaselineSchema, creatorBaselineProposalSchema } from "../../../src/brain/domain";

const replay = replayFixtureSchema.parse(fixture);
const opportunity = replay.events.find((event) => event.kind === "opportunity_revision")!.payload;
const evidence = replay.events.filter((event) => event.kind === "signal_evidence").map((event) => event.payload);
const drafts = replay.events.filter((event) => event.kind === "draft_variant").map((event) => event.payload);
const decisions = replay.events.filter((event) => event.kind === "decision_event").map((event) => event.payload);
const compliance = replay.events.filter((event) => event.kind === "compliance_check").map((event) => event.payload);
const olderRevision = { ...opportunity, revision: 1, revisedAt: "2026-08-27T14:00:00.000Z" };
const currentRevision = { ...opportunity, revision: 2, status: "approved" as const, revisedAt: "2026-08-27T14:10:00.000Z" };
const outcomes = [{ schemaVersion: 1 as const, id: "80000000-0000-4000-8000-000000000001", opportunityId: opportunity.id, publishedPostId: opportunity.targetPostId!, publishedAt: "2026-08-27T14:05:00.000Z", observedAt: "2026-08-27T14:10:00.000Z", observationAgeMinutes: 5, publicMetrics: { views: 1, likes: 0, replies: 0, reposts: 0, bookmarks: 0 }, privateMetrics: null, source: "synthetic" as const, collectionStatus: "complete" as const }];
const baselineProposal = creatorBaselineProposalSchema.parse({ schemaVersion: 1, id: "30000000-0000-4000-8000-000000000001", creatorId: "casey-mcdougal", createdAt: "2026-09-04T21:00:00.000Z", sourceArchiveFingerprint: "a".repeat(64), provenance: { interface: "codex-cli", model: "codex-cli-chatgpt-default", promptTemplateVersion: "owned-x-baseline-v1" }, voiceProfile: { summary: "direct", casing_and_punctuation: ["sentence case"], sentence_rhythm: ["short"], vocabulary: ["build"], hook_moves: ["claim"], banned_moves: ["hype"], style_excerpts: ["Build it."] }, strategyMemory: { positioning: "builder", audience_segments: ["builders"], strongest_lanes: ["product"], weak_lanes: ["news"], voice_rules: ["plain"], proof_points: ["shipped"], active_experiments: [{ hypothesis: "artifacts work", status: "active", evidence: "future posts" }] }, duplicationGuard: { consideredPostIds: ["100"] }, claims: [{ area: "voice", claim: "direct", postIds: ["100"], evidenceKind: "measured", confidence: 0.9, uncertainty: "small sample" }, { area: "positioning", claim: "builder", postIds: ["100"], evidenceKind: "inferred", confidence: 0.7, uncertainty: "inferred" }], largestUncertainty: "small archive" });
const acceptedBaseline = acceptedCreatorBaselineSchema.parse({ schemaVersion: 1, proposal: baselineProposal, acceptedAt: "2026-09-04T22:00:00.000Z", acceptedBy: "casey-mcdougal", acceptedProposalId: baselineProposal.id, acceptedSourceArchiveFingerprint: baselineProposal.sourceArchiveFingerprint });

function store(): BrainEventStore {
  return {
    withExclusiveLock: async (_key, operation) => operation(store()),
    appendOpportunityRevision: async () => {}, appendSignalEvidence: async () => {}, appendDraftVariant: async () => {}, appendDecisionEvent: async () => {}, appendOutcomeSnapshot: async () => {}, appendComplianceCheck: async () => {}, appendCreatorArchive: async () => {},
    getOpportunity: async (id) => id === opportunity.id ? currentRevision : null,
    getOpportunityRevision: async (id, revision) => id === opportunity.id ? ([olderRevision, currentRevision].find((value) => value.revision === revision) ?? null) : null,
    listOpportunityRevisions: async () => [olderRevision, currentRevision],
    listOpportunities: async () => [currentRevision],
    listSignalEvidence: async (_id, revision) => revision === undefined || revision === 1 ? evidence : [],
    listDraftVariants: async (_id, revision) => revision === undefined || revision === 1 ? drafts : [],
    listDecisionEvents: async () => decisions,
    listOutcomeSnapshots: async () => outcomes,
    listComplianceChecks: async () => compliance,
    getCreatorArchiveByFingerprint: async () => null,
    getLatestCreatorArchive: async () => null,
    healthCheck: async () => {}
  };
}

describe("BrainQueryService", () => {
  const service = new BrainQueryService(store(), { mode: "synthetic", databaseUrl: "postgresql://social_brain:placeholder@127.0.0.1/social_brain_test" });

  it("returns current projections and complete inspection history", async () => {
    expect(await service.listOpportunities()).toEqual({ opportunities: [currentRevision] });
    const inspection = await service.inspectOpportunity(opportunity.id);
    expect(inspection).toMatchObject({ opportunity: currentRevision, revisions: [olderRevision, currentRevision], evidence, drafts, decisions, outcomes, compliance });
  });

  it("defaults explanation to current revision and can select older history", async () => {
    expect((await service.explainPrediction(opportunity.id)).opportunity).toEqual(currentRevision);
    expect((await service.explainPrediction(opportunity.id, 1)).opportunity).toEqual(olderRevision);
    await expect(service.explainPrediction(opportunity.id, 3)).rejects.toThrow("revision not found");
  });

  it("reports fixed proof requirements and redacted synthetic health", async () => {
    expect(service.getProofStatus()).toMatchObject({ state: "not_started", requiredConsecutiveDays: 7, requiredViews: 1000, maturityHours: 48 });
    const health = await service.getSystemHealth();
    expect(health).toMatchObject({ mode: "synthetic", storage: "healthy", liveAdaptersInstalled: false, approvalConfigured: false, latestComplianceCheckedAt: compliance[0]?.checkedAt });
    expect(health.capabilities).toEqual([
      { capability: "live-x-read", allowed: false, reason: "live capabilities are disabled in synthetic mode" },
      { capability: "live-ai-judgment", allowed: false, reason: "live capabilities are disabled in synthetic mode" },
      { capability: "live-ai-generation", allowed: false, reason: "live capabilities are disabled in synthetic mode" },
      { capability: "x-write", allowed: false, reason: "live capabilities are disabled in synthetic mode" }
    ]);
    expect(JSON.stringify(health)).not.toContain("postgresql:");
    expect(JSON.stringify(health)).not.toContain("placeholder");
  });

  it("does not expose a production approval reference in health output", async () => {
    const approvalReference = "x-approval-private-reference";
    const productionService = new BrainQueryService(store(), {
      mode: "production",
      databaseUrl: "postgresql://social_brain:placeholder@db.example.invalid/social_brain?sslmode=verify-full",
      xApprovalReference: approvalReference,
      dailySpendLimitUsd: 10,
      monthlySpendLimitUsd: 100
    });
    const health = await productionService.getSystemHealth();
    expect(health.approvalConfigured).toBe(true);
    expect(JSON.stringify(health)).not.toContain(approvalReference);
  });

  it("returns a cloned creator baseline snapshot with current-archive match state", () => {
    const input = {
      currentArchiveFingerprint: "a".repeat(64),
      proposal: structuredClone(baselineProposal),
      accepted: structuredClone(acceptedBaseline)
    };
    const baselineService = new BrainQueryService(
      store(),
      { mode: "synthetic", databaseUrl: "postgresql://social_brain:placeholder@127.0.0.1/social_brain_test" },
      input
    );

    expect(baselineService.getCreatorBaseline()).toEqual({
      proposalAvailable: true,
      acceptedAvailable: true,
      proposalMatchesCurrentArchive: true,
      acceptedMatchesCurrentArchive: true,
      proposal: baselineProposal,
      accepted: acceptedBaseline
    });

    input.proposal.voiceProfile.summary = "mutated";
    input.accepted.proposal.voiceProfile.summary = "mutated";
    expect(baselineService.getCreatorBaseline().proposal?.voiceProfile.summary).toBe("direct");
    expect(baselineService.getCreatorBaseline().accepted?.proposal.voiceProfile.summary).toBe("direct");
    const returned = baselineService.getCreatorBaseline();
    returned.proposal!.voiceProfile.summary = "returned mutation";
    expect(baselineService.getCreatorBaseline().proposal?.voiceProfile.summary).toBe("direct");
  });

  it("reports absent and stale creator baseline records without hiding them", () => {
    const absent = service.getCreatorBaseline();
    expect(absent).toEqual({
      proposalAvailable: false,
      acceptedAvailable: false,
      proposalMatchesCurrentArchive: false,
      acceptedMatchesCurrentArchive: false,
      proposal: null,
      accepted: null
    });

    const stale = new BrainQueryService(
      store(),
      { mode: "synthetic", databaseUrl: "postgresql://social_brain:placeholder@127.0.0.1/social_brain_test" },
      { currentArchiveFingerprint: "b".repeat(64), proposal: baselineProposal, accepted: acceptedBaseline }
    ).getCreatorBaseline();
    expect(stale).toMatchObject({
      proposalAvailable: true,
      acceptedAvailable: true,
      proposalMatchesCurrentArchive: false,
      acceptedMatchesCurrentArchive: false
    });
  });

  it("makes an archive lookup failure visible without treating it as an absent archive", async () => {
    const unavailableStore = {
      ...store(),
      getLatestCreatorArchive: async () => { throw new Error("archive lookup unavailable"); }
    };
    const unavailableService = new BrainQueryService(unavailableStore, { mode: "synthetic", databaseUrl: "postgresql://social_brain:placeholder@127.0.0.1/social_brain_test" });

    await expect(unavailableService.getCreatorArchive()).rejects.toThrow("archive lookup unavailable");
    await expect(unavailableService.getSystemHealth()).resolves.toMatchObject({
      storage: "unavailable",
      creatorArchive: { available: false, source: null, importedAt: null }
    });
  });
});
