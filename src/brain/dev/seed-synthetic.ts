import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadRuntimeConfig } from "../config/runtime-config";
import type { BrainEventStore } from "../storage/event-store";
import { runMigrations } from "../storage/migrations";
import { PostgresBrainEventStore } from "../storage/postgres-event-store";
import { createPostgresPool } from "../storage/postgres";
import { replayFixtureSchema, type ReplayFixture } from "../replay/replay-schema";
import { runReplay } from "../replay/replay-runner";

type SeedResult = { status: "seeded" | "already-seeded"; opportunityId: string };

const expectedIds = <K extends ReplayFixture["events"][number]["kind"]>(fixture: ReplayFixture, kind: K) =>
  fixture.events.filter((event) => event.kind === kind).map((event) => event.payload.id);

const containsEvery = (expected: string[], actual: string[]) => expected.every((id) => actual.includes(id));

export async function isReplayMaterialized(store: BrainEventStore, fixture: ReplayFixture): Promise<boolean> {

  const revisions = await store.listOpportunityRevisions(fixture.primaryOpportunityId);
  const evidence = await store.listSignalEvidence(fixture.primaryOpportunityId);
  const drafts = await store.listDraftVariants(fixture.primaryOpportunityId);
  const decisions = await store.listDecisionEvents(fixture.primaryOpportunityId);
  const outcomes = await store.listOutcomeSnapshots(fixture.primaryOpportunityId);
  const compliance = await store.listComplianceChecks();
  const expectedRevisionKeys = fixture.events
    .filter((event) => event.kind === "opportunity_revision")
    .map((event) => `${event.payload.id}:${event.payload.revision}`);

  const exact = <T extends { id: string }>(expected: T[], actual: T[]) => expected.every((value) => actual.some((record) => record.id === value.id && JSON.stringify(record) === JSON.stringify(value)));
  const expectedRevisions = fixture.events.filter((event) => event.kind === "opportunity_revision").map((event) => event.payload);
  const expectedEvidence = fixture.events.filter((event) => event.kind === "signal_evidence").map((event) => event.payload);
  const expectedDrafts = fixture.events.filter((event) => event.kind === "draft_variant").map((event) => event.payload);
  const expectedDecisions = fixture.events.filter((event) => event.kind === "decision_event").map((event) => event.payload);
  const expectedOutcomes = fixture.events.filter((event) => event.kind === "outcome_snapshot").map((event) => event.payload);
  const expectedCompliance = fixture.events.filter((event) => event.kind === "compliance_check").map((event) => event.payload);
  return containsEvery(expectedRevisionKeys, revisions.map((value) => `${value.id}:${value.revision}`))
    && exact(expectedRevisions, revisions) && exact(expectedEvidence, evidence) && exact(expectedDrafts, drafts)
    && exact(expectedDecisions, decisions) && exact(expectedOutcomes, outcomes) && exact(expectedCompliance, compliance);
}

export async function seedSynthetic(store: BrainEventStore, fixtureInput: unknown): Promise<SeedResult> {
  const fixture = replayFixtureSchema.parse(fixtureInput);
  return store.withExclusiveLock(`social-brain-replay:${fixture.replayId}`, async (transaction) => {
    const existing = await transaction.getOpportunity(fixture.primaryOpportunityId);
    if (existing) {
      if (!await isReplayMaterialized(transaction, fixture)) throw new Error("Partial synthetic replay detected");
      return { status: "already-seeded", opportunityId: fixture.primaryOpportunityId };
    }
    await runReplay(transaction, fixture);
    if (!await isReplayMaterialized(transaction, fixture)) throw new Error("Partial synthetic replay detected");
    return { status: "seeded", opportunityId: fixture.primaryOpportunityId };
  });
}

async function main(): Promise<void> {
  const config = loadRuntimeConfig();
  if (config.mode !== "synthetic") throw new Error("Synthetic seeding requires SOCIAL_BRAIN_MODE=synthetic");
  const pool = createPostgresPool(config.databaseUrl);
  try {
    await runMigrations(pool);
    const fixturePath = fileURLToPath(new URL("../replay/fixtures/synthetic-replay.json", import.meta.url));
    const fixture = replayFixtureSchema.parse(JSON.parse(await readFile(fixturePath, "utf8")));
    const result = await seedSynthetic(new PostgresBrainEventStore(pool), fixture);
    process.stdout.write(`${result.status} ${result.opportunityId}\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
