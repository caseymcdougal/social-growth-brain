import fixture from "../../../src/brain/replay/fixtures/synthetic-replay.json";
import { describe, expect, it } from "vitest";
import { replayFixtureSchema } from "../../../src/brain/replay/replay-schema";
import { runReplay } from "../../../src/brain/replay/replay-runner";
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

class RecordingEventStore implements BrainEventStore {
  readonly calls: string[] = [];
  async appendOpportunityRevision(value: Opportunity) { this.calls.push(`opportunity_revision:${value.id}:${value.revision}`); }
  async appendSignalEvidence(value: SignalEvidence) { this.calls.push(`signal_evidence:${value.id}`); }
  async appendDraftVariant(value: DraftVariant) { this.calls.push(`draft_variant:${value.id}`); }
  async appendDecisionEvent(value: DecisionEvent) { this.calls.push(`decision_event:${value.id}`); }
  async appendOutcomeSnapshot(value: OutcomeSnapshot) { this.calls.push(`outcome_snapshot:${value.id}`); }
  async appendComplianceCheck(value: ComplianceCheck) { this.calls.push(`compliance_check:${value.id}`); }
  async getOpportunity(): Promise<Opportunity | null> { return null; }
  async getOpportunityRevision(): Promise<Opportunity | null> { return null; }
  async listOpportunityRevisions(): Promise<Opportunity[]> { return []; }
  async listOpportunities(): Promise<Opportunity[]> { return []; }
  async listSignalEvidence(): Promise<SignalEvidence[]> { return []; }
  async listDraftVariants(): Promise<DraftVariant[]> { return []; }
  async listDecisionEvents(): Promise<DecisionEvent[]> { return []; }
  async listOutcomeSnapshots(): Promise<OutcomeSnapshot[]> { return []; }
  async listComplianceChecks(): Promise<ComplianceCheck[]> { return []; }
  async appendCreatorArchive(_value: CreatorArchive) { throw new Error("not used"); }
  async getLatestCreatorArchive(): Promise<CreatorArchive | null> { return null; }
  async healthCheck() {}
}

describe("synthetic replay", () => {
  it("dispatches parsed events in declared sequence order deterministically", async () => {
    const first = new RecordingEventStore();
    const second = new RecordingEventStore();

    await runReplay(first, fixture);
    await runReplay(second, fixture);

    expect(first.calls).toEqual([
      "opportunity_revision:20000000-0000-4000-8000-000000000001:1",
      "signal_evidence:30000000-0000-4000-8000-000000000001",
      "signal_evidence:30000000-0000-4000-8000-000000000002",
      "signal_evidence:30000000-0000-4000-8000-000000000003",
      "draft_variant:40000000-0000-4000-8000-000000000001",
      "decision_event:50000000-0000-4000-8000-000000000001",
      "decision_event:50000000-0000-4000-8000-000000000002",
      "compliance_check:70000000-0000-4000-8000-000000000001"
    ]);
    expect(JSON.stringify(second.calls)).toBe(JSON.stringify(first.calls));
  });

  it("rejects duplicate/non-increasing sequences and backward event times", () => {
    const parsed = replayFixtureSchema.parse(fixture);
    expect(() => replayFixtureSchema.parse({ ...parsed, events: [{ ...parsed.events[0], sequence: 2 }, ...parsed.events.slice(1)] })).toThrow();
    expect(() => replayFixtureSchema.parse({ ...parsed, events: [{ ...parsed.events[0], at: "2026-08-27T15:00:00.000Z" }, ...parsed.events.slice(1)] })).toThrow();
  });

  it("rejects live provenance before materializing any event", async () => {
    const bad = structuredClone(fixture);
    (bad.events[0] as { payload: { provenance: { sourceKind: string } } }).payload.provenance.sourceKind = "official-x-api";
    const store = new RecordingEventStore();

    await expect(runReplay(store, bad)).rejects.toThrow("Synthetic replay cannot contain live opportunity provenance");
    expect(store.calls).toEqual([]);
  });
});
