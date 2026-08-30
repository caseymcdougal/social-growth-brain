import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadRuntimeConfig } from "../config/runtime-config";
import { createReadOnlyMcpServer } from "../interfaces/mcp/create-server";
import { BrainQueryService } from "../query/brain-query-service";
import { runMigrations } from "../storage/migrations";
import { PostgresBrainEventStore } from "../storage/postgres-event-store";
import { createPostgresPool } from "../storage/postgres";

const expectedTools = ["explain_prediction", "get_proof_status", "get_system_health", "inspect_opportunity", "list_opportunities"];
const expectedOpportunityId = "20000000-0000-4000-8000-000000000001";
const expectedEvidenceCount = 3;
const config = loadRuntimeConfig();
const pool = createPostgresPool(config.databaseUrl);
const client = new Client({ name: "social-brain-verifier", version: "1.0.0" });

try {
  await runMigrations(pool);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createReadOnlyMcpServer(new BrainQueryService(new PostgresBrainEventStore(pool), config));
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
  if (JSON.stringify(tools) !== JSON.stringify(expectedTools)) throw new Error("Unexpected MCP tool registry");
  const inspection = (await client.callTool({ name: "inspect_opportunity", arguments: { id: expectedOpportunityId } })).structuredContent as { opportunity: { id: string; revision: number }; evidence: unknown[] } | undefined;
  const health = (await client.callTool({ name: "get_system_health", arguments: {} })).structuredContent as { mode: string; capabilities: unknown[] } | undefined;
  if (!inspection || inspection.opportunity.id !== expectedOpportunityId || inspection.opportunity.revision !== 1 || inspection.evidence.length !== expectedEvidenceCount || !health) throw new Error("Seeded MCP inspection invariants failed");
  process.stdout.write(`${JSON.stringify({ result: "passed", tools, opportunityId: inspection.opportunity.id, revision: inspection.opportunity.revision, evidenceCount: inspection.evidence.length, mode: health.mode, liveCapabilityDecisions: health.capabilities })}\n`);
} finally {
  await client.close();
  await pool.end();
}
