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

  for (const event of fixture.events) {
    switch (event.kind) {
      case "opportunity_revision": await store.appendOpportunityRevision(event.payload); break;
      case "signal_evidence": await store.appendSignalEvidence(event.payload); break;
      case "draft_variant": await store.appendDraftVariant(event.payload); break;
      case "decision_event": await store.appendDecisionEvent(event.payload); break;
      case "outcome_snapshot": await store.appendOutcomeSnapshot(event.payload); break;
      case "compliance_check": await store.appendComplianceCheck(event.payload); break;
    }
  }
}
