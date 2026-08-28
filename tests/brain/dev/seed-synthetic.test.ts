import fixture from "../../../src/brain/replay/fixtures/synthetic-replay.json";
import { describe, expect, it } from "vitest";
import { seedSynthetic } from "../../../src/brain/dev/seed-synthetic";
import type {
  ComplianceCheck,
  CreatorArchive,
  DecisionEvent,
  DraftVariant,
  Opportunity,
  OutcomeSnapshot,
  SignalEvidence
} from "../../../src/brain/domain";
import type { BrainEventStore } from "../../../src/brain/storage/event-store";

class SeedStore implements BrainEventStore {
  opportunity: Opportunity | null = null;
  revisions: Opportunity[] = [];
  evidence: SignalEvidence[] = [];
  drafts: DraftVariant[] = [];
  decisions: DecisionEvent[] = [];
  outcomes: OutcomeSnapshot[] = [];
  compliance: ComplianceCheck[] = [];
  async appendOpportunityRevision(value: Opportunity) { this.opportunity = value; this.revisions.push(value); }
  async appendSignalEvidence(value: SignalEvidence) { this.evidence.push(value); }
  async appendDraftVariant(value: DraftVariant) { this.drafts.push(value); }
  async appendDecisionEvent(value: DecisionEvent) { this.decisions.push(value); }
  async appendOutcomeSnapshot(value: OutcomeSnapshot) { this.outcomes.push(value); }
  async appendComplianceCheck(value: ComplianceCheck) { this.compliance.push(value); }
  async getOpportunity(): Promise<Opportunity | null> { return this.opportunity; }
  async getOpportunityRevision(_id: string, revision: number): Promise<Opportunity | null> { return this.revisions.find((value) => value.revision === revision) ?? null; }
  async listOpportunityRevisions(): Promise<Opportunity[]> { return this.revisions; }
  async listOpportunities(): Promise<Opportunity[]> { return this.opportunity ? [this.opportunity] : []; }
  async listSignalEvidence(): Promise<SignalEvidence[]> { return this.evidence; }
  async listDraftVariants(): Promise<DraftVariant[]> { return this.drafts; }
  async listDecisionEvents(): Promise<DecisionEvent[]> { return this.decisions; }
  async listOutcomeSnapshots(): Promise<OutcomeSnapshot[]> { return this.outcomes; }
  async listComplianceChecks(): Promise<ComplianceCheck[]> { return this.compliance; }
  async appendCreatorArchive(_value: CreatorArchive) { throw new Error("not used"); }
  async getLatestCreatorArchive(): Promise<CreatorArchive | null> { return null; }
  async healthCheck() {}
}

describe("seedSynthetic", () => {
  it("rejects a partial materialization without calling it already seeded", async () => {
    const store = new SeedStore();
    const opportunity = fixture.events[0].payload as Opportunity;
    store.opportunity = opportunity;
    store.revisions = [opportunity];
    store.evidence = [fixture.events[1].payload as SignalEvidence];

    await expect(seedSynthetic(store, fixture)).rejects.toThrow("Partial synthetic replay detected");
  });

  it("reports a complete fixture as already seeded", async () => {
    const store = new SeedStore();
    await expect(seedSynthetic(store, fixture)).resolves.toEqual({
      status: "seeded",
      opportunityId: "20000000-0000-4000-8000-000000000001"
    });
    await expect(seedSynthetic(store, fixture)).resolves.toEqual({
      status: "already-seeded",
      opportunityId: "20000000-0000-4000-8000-000000000001"
    });
  });
});
