import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BrainQueryService } from "../../../src/brain/query/brain-query-service";
import fixture from "../../../src/brain/replay/fixtures/synthetic-replay.json";
import { runReplay } from "../../../src/brain/replay/replay-runner";
import { replayFixtureSchema } from "../../../src/brain/replay/replay-schema";
import { createReadOnlyMcpServer } from "../../../src/brain/interfaces/mcp/create-server";
import { runMigrations } from "../../../src/brain/storage/migrations";
import { PostgresBrainEventStore } from "../../../src/brain/storage/postgres-event-store";
import { createPostgresPool } from "../../../src/brain/storage/postgres";
import { assertConnectedTestDatabase, TEST_DATABASE_URL, truncateBrainTables } from "./postgres-test-harness";

const opportunityId = "20000000-0000-4000-8000-000000000001";
let pool: Pool;

describe("seeded MCP inspection", () => {
  beforeAll(async () => {
    pool = createPostgresPool(TEST_DATABASE_URL);
    await assertConnectedTestDatabase(pool);
    await runMigrations(pool);
  });
  beforeEach(async () => {
    await truncateBrainTables(pool);
    await runReplay(new PostgresBrainEventStore(pool), replayFixtureSchema.parse(fixture));
  });
  afterAll(async () => { await pool.end(); });

  it("returns all seeded inspection evidence through read-only MCP", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createReadOnlyMcpServer(new BrainQueryService(new PostgresBrainEventStore(pool), { mode: "synthetic", databaseUrl: TEST_DATABASE_URL }));
    const client = new Client({ name: "seeded-inspection", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result = await client.callTool({ name: "inspect_opportunity", arguments: { id: opportunityId } });
      const inspection = result.structuredContent as { opportunity: { id: string; revision: number; evidenceIds: string[] }; evidence: { id: string }[]; drafts: unknown[]; decisions: unknown[] };
      expect(inspection.opportunity).toMatchObject({ id: opportunityId, revision: 1 });
      expect(inspection.evidence).toHaveLength(3);
      expect(inspection.opportunity.evidenceIds.every((id) => inspection.evidence.some((evidence) => evidence.id === id))).toBe(true);
      expect(inspection.drafts).toHaveLength(1);
      expect(inspection.decisions).toHaveLength(2);
      const health = (await client.callTool({ name: "get_system_health", arguments: {} })).structuredContent as { mode: string; storage: string; capabilities: { allowed: boolean }[] };
      expect(health).toMatchObject({ mode: "synthetic", storage: "healthy" });
      expect(health.capabilities.every((capability) => !capability.allowed)).toBe(true);
    } finally { await client.close(); }
  });
});
