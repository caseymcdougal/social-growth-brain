import type { BrainEventStore } from "../storage/event-store";
import { replayFixtureSchema, type ReplayFixture } from "./replay-schema";

function assertSyntheticSources(fixture: ReplayFixture): void {
  for (const event of fixture.events) {
    if (event.kind === "opportunity_revision" && event.payload.provenance.sourceKind !== "synthetic") {
      throw new Error("Synthetic replay cannot contain live opportunity provenance");
    }
    if (event.kind === "signal_evidence" && event.payload.source !== "synthetic") {
      throw new Error("Synthetic replay cannot contain live evidence");
    }
    if (event.kind === "outcome_snapshot" && event.payload.source !== "synthetic") {
      throw new Error("Synthetic replay cannot contain live outcome");
    }
    if (event.kind === "compliance_check" && event.payload.source !== "synthetic") {
      throw new Error("Synthetic replay cannot contain live compliance");
    }
  }
}

export async function runReplay(store: BrainEventStore, fixtureInput: unknown): Promise<void> {
  const fixture = replayFixtureSchema.parse(fixtureInput);
  assertSyntheticSources(fixture);

  await store.withExclusiveLock(`social-brain-replay:${fixture.replayId}`, async (transaction) => {
    for (const event of fixture.events) {
      switch (event.kind) {
        case "opportunity_revision": await transaction.appendOpportunityRevision(event.payload); break;
        case "signal_evidence": await transaction.appendSignalEvidence(event.payload); break;
        case "draft_variant": await transaction.appendDraftVariant(event.payload); break;
        case "decision_event": await transaction.appendDecisionEvent(event.payload); break;
        case "outcome_snapshot": await transaction.appendOutcomeSnapshot(event.payload); break;
        case "compliance_check": await transaction.appendComplianceCheck(event.payload); break;
      }
    }
  });
}
