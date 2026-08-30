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
  private scoped = false;
  private readonly lockTails = new Map<string, Promise<void>>();
  async withExclusiveLock<T>(key: string, operation: (store: BrainEventStore) => Promise<T>): Promise<T> {
    if (this.scoped) return operation(this);
    const prior = this.lockTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const completion = new Promise<void>((resolve) => { release = resolve; });
    this.lockTails.set(key, prior.then(() => completion));
    await prior;
    const transaction = Object.create(this) as SeedStore;
    transaction.scoped = true;
    try {
      const result = await operation(transaction);
      this.opportunity = transaction.opportunity;
      return result;
    } finally { release(); }
  }
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
  async getCreatorArchiveByFingerprint(_sourceFingerprint: string): Promise<CreatorArchive | null> { return null; }
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

  it("keeps the canonical revision immutable when the current projection advances", async () => {
    const store = new SeedStore();
    await seedSynthetic(store, fixture);
    const revision2 = { ...store.opportunity!, revision: 2, status: "approved" as const, revisedAt: "2026-08-27T14:08:00.000Z" };
    await store.appendOpportunityRevision(revision2);

    await expect(seedSynthetic(store, fixture)).resolves.toEqual({
      status: "already-seeded",
      opportunityId: "20000000-0000-4000-8000-000000000001"
    });
    expect(store.revisions[0]).toEqual(fixture.events[0].payload);
  });

  it("serializes concurrent seeders into seeded then already-seeded", async () => {
    const store = new SeedStore();
    const results = await Promise.all([seedSynthetic(store, fixture), seedSynthetic(store, fixture)]);
    expect(results.map((result) => result.status).sort()).toEqual(["already-seeded", "seeded"]);
    expect(store.evidence).toHaveLength(3);
    expect(store.drafts).toHaveLength(1);
    expect(store.decisions).toHaveLength(2);
  });

  it("accepts JSONB-reordered immutable payload keys but rejects changed values", async () => {
    const fixtureWithOutcome = {
      ...structuredClone(fixture),
      events: [...fixture.events, {
        sequence: 9,
        at: "2026-08-27T14:08:00.000Z",
        kind: "outcome_snapshot",
        payload: {
          schemaVersion: 1, id: "80000000-0000-4000-8000-000000000001", opportunityId: fixture.primaryOpportunityId,
          publishedPostId: "900000000000000001", publishedAt: "2026-08-27T14:00:00.000Z", observedAt: "2026-08-27T14:08:00.000Z",
          observationAgeMinutes: 8, publicMetrics: { views: 1, likes: 1, replies: 1, reposts: 1, bookmarks: 1 },
          privateMetrics: { zeta: 2, alpha: 1 }, source: "synthetic", collectionStatus: "complete"
        }
      }]
    };
    const store = new SeedStore();
    await seedSynthetic(store, fixtureWithOutcome);
    store.outcomes[0] = { ...store.outcomes[0], privateMetrics: { alpha: 1, zeta: 2 } };
    await expect(seedSynthetic(store, fixtureWithOutcome)).resolves.toMatchObject({ status: "already-seeded" });
    store.outcomes[0] = { ...store.outcomes[0], privateMetrics: { alpha: 9, zeta: 2 } };
    await expect(seedSynthetic(store, fixtureWithOutcome)).rejects.toThrow("Partial synthetic replay detected");
  });
});
