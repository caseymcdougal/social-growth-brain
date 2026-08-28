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

export async function isReplayMaterialized(store: BrainEventStore, fixture: ReplayFixture, existingOpportunity?: unknown): Promise<boolean> {
  const expectedPrimary = fixture.events.find((event) => event.kind === "opportunity_revision" && event.payload.id === fixture.primaryOpportunityId);
  if (!expectedPrimary || JSON.stringify(existingOpportunity) !== JSON.stringify(expectedPrimary.payload)) return false;

  const [revisions, evidence, drafts, decisions, outcomes, compliance] = await Promise.all([
    store.listOpportunityRevisions(fixture.primaryOpportunityId),
    store.listSignalEvidence(fixture.primaryOpportunityId),
    store.listDraftVariants(fixture.primaryOpportunityId),
    store.listDecisionEvents(fixture.primaryOpportunityId),
    store.listOutcomeSnapshots(fixture.primaryOpportunityId),
    store.listComplianceChecks()
  ]);
  const expectedRevisionKeys = fixture.events
    .filter((event) => event.kind === "opportunity_revision")
    .map((event) => `${event.payload.id}:${event.payload.revision}`);

  return containsEvery(expectedRevisionKeys, revisions.map((value) => `${value.id}:${value.revision}`))
    && containsEvery(expectedIds(fixture, "signal_evidence"), evidence.map((value) => value.id))
    && containsEvery(expectedIds(fixture, "draft_variant"), drafts.map((value) => value.id))
    && containsEvery(expectedIds(fixture, "decision_event"), decisions.map((value) => value.id))
    && containsEvery(expectedIds(fixture, "outcome_snapshot"), outcomes.map((value) => value.id))
    && containsEvery(expectedIds(fixture, "compliance_check"), compliance.map((value) => value.id));
}

export async function seedSynthetic(store: BrainEventStore, fixtureInput: unknown): Promise<SeedResult> {
  const fixture = replayFixtureSchema.parse(fixtureInput);
  const existing = await store.getOpportunity(fixture.primaryOpportunityId);
  if (existing) {
    if (!await isReplayMaterialized(store, fixture, existing)) throw new Error("Partial synthetic replay detected");
    return { status: "already-seeded", opportunityId: fixture.primaryOpportunityId };
  }

  await runReplay(store, fixture);
  const materialized = await store.getOpportunity(fixture.primaryOpportunityId);
  if (!await isReplayMaterialized(store, fixture, materialized)) throw new Error("Partial synthetic replay detected");
  return { status: "seeded", opportunityId: fixture.primaryOpportunityId };
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
