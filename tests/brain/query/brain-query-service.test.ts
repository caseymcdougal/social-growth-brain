import { describe, expect, it } from "vitest";
import fixture from "../../../src/brain/replay/fixtures/synthetic-replay.json";
import { replayFixtureSchema } from "../../../src/brain/replay/replay-schema";
import type { BrainEventStore } from "../../../src/brain/storage/event-store";
import { BrainQueryService } from "../../../src/brain/query/brain-query-service";

const replay = replayFixtureSchema.parse(fixture);
const opportunity = replay.events.find((event) => event.kind === "opportunity_revision")!.payload;
const evidence = replay.events.filter((event) => event.kind === "signal_evidence").map((event) => event.payload);
const drafts = replay.events.filter((event) => event.kind === "draft_variant").map((event) => event.payload);
const decisions = replay.events.filter((event) => event.kind === "decision_event").map((event) => event.payload);
const compliance = replay.events.filter((event) => event.kind === "compliance_check").map((event) => event.payload);

function store(): BrainEventStore {
  return {
    withExclusiveLock: async (_key, operation) => operation(store()),
    appendOpportunityRevision: async () => {}, appendSignalEvidence: async () => {}, appendDraftVariant: async () => {}, appendDecisionEvent: async () => {}, appendOutcomeSnapshot: async () => {}, appendComplianceCheck: async () => {}, appendCreatorArchive: async () => {},
    getOpportunity: async (id) => id === opportunity.id ? opportunity : null,
    getOpportunityRevision: async (id, revision) => id === opportunity.id && revision === 1 ? opportunity : null,
    listOpportunityRevisions: async () => [opportunity],
    listOpportunities: async () => [opportunity],
    listSignalEvidence: async (_id, revision) => revision === undefined || revision === 1 ? evidence : [],
    listDraftVariants: async (_id, revision) => revision === undefined || revision === 1 ? drafts : [],
    listDecisionEvents: async () => decisions,
    listOutcomeSnapshots: async () => [],
    listComplianceChecks: async () => compliance,
    getCreatorArchiveByFingerprint: async () => null,
    getLatestCreatorArchive: async () => null,
    healthCheck: async () => {}
  };
}

describe("BrainQueryService", () => {
  const service = new BrainQueryService(store(), { mode: "synthetic", databaseUrl: "postgresql://social_brain:placeholder@127.0.0.1/social_brain_test" });

  it("returns complete inspection and revision-specific explanations", async () => {
    const inspection = await service.inspectOpportunity(opportunity.id);
    expect(inspection).toMatchObject({ opportunity, revisions: [opportunity], evidence, drafts, decisions, compliance });
    expect((await service.explainPrediction(opportunity.id)).evidence).toEqual(evidence);
    await expect(service.explainPrediction(opportunity.id, 2)).rejects.toThrow("revision not found");
  });

  it("reports fixed proof requirements and redacted synthetic health", async () => {
    expect(service.getProofStatus()).toMatchObject({ state: "not_started", requiredConsecutiveDays: 7, requiredViews: 1000, maturityHours: 48 });
    expect(await service.getSystemHealth()).toMatchObject({ mode: "synthetic", storage: "healthy", approvalConfigured: false, latestComplianceCheckedAt: compliance[0]?.checkedAt });
  });
});
